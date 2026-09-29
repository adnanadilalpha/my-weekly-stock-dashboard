import { NextResponse } from 'next/server';
import {
  buildChatMessages,
  buildRefusal,
  callChatModel,
  checkRateLimit,
  createUserClientFromAuthHeader,
  isChatModelConfigured,
  loadMwsDataBlock,
  looksLikeAdviceRequest,
  type ChatContextRef,
} from '@/lib/intelligence/chat/context';

export const runtime = 'nodejs';

/**
 * Platform Chat API — used by web and mobile.
 * Auth: Authorization: Bearer <supabase access token>
 *
 * Body:
 * {
 *   message: string,
 *   sessionId?: string,
 *   stream?: boolean,  // SSE when true
 *   contextRef?: { ticker?, sector?, portfolioPage?, userPortfolioId? }
 * }
 */
export async function POST(request: Request) {
  const auth = await createUserClientFromAuthHeader(request.headers.get('authorization'));
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized', message: 'Valid Bearer JWT required' }, { status: 401 });
  }

  if (!checkRateLimit(auth.user.id)) {
    return NextResponse.json({ error: 'rate_limited', message: 'Too many chat requests' }, { status: 429 });
  }

  let body: {
    message?: string;
    sessionId?: string;
    stream?: boolean;
    contextRef?: ChatContextRef;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const message = (body.message ?? '').trim();
  if (!message) {
    return NextResponse.json({ error: 'message_required' }, { status: 400 });
  }

  const contextRef: ChatContextRef = body.contextRef ?? {};
  // User's own portfolio + MWS ticker snapshots + tickers named in the question.
  const mwsData = await loadMwsDataBlock(auth.client, contextRef, message, auth.user.id);

  let assistantText: string;
  if (looksLikeAdviceRequest(message)) {
    assistantText = buildRefusal(
      'Available context was loaded from MWS DATA for explanation only.',
    );
  } else {
    const messages = buildChatMessages(mwsData, message);
    const result = await callChatModel(messages);
    if (!result.ok) {
      // Never surface provider/quota details to the user — keep a calm fallback.
      console.error('[chat] all providers failed', result.provider, result.status, result.error);
      assistantText =
        'I could not reach the chat model just now. Please try again in a moment, or use MWS Brief on the page for Rating, Performance, and Quadrant Analysis explanations.';
      if (!isChatModelConfigured()) {
        return NextResponse.json(
          {
            error: 'chat_unavailable',
            message: assistantText,
            fallback: true,
          },
          { status: 503 },
        );
      }
      // Still return 200 with a helpful reply so the UI feels continuous.
    } else {
      assistantText = result.text;
    }
  }

  // Persist session + messages (owner RLS via user JWT client)
  let sessionId = body.sessionId ?? null;
  try {
    if (!sessionId) {
      const { data: sessionRow, error } = await auth.client
        .from('ai_chat_sessions')
        .insert({
          user_id: auth.user.id,
          title: message.slice(0, 80),
          context_ref: contextRef,
        })
        .select('id')
        .single();
      if (error) throw error;
      sessionId = sessionRow.id as string;
    } else {
      await auth.client
        .from('ai_chat_sessions')
        .update({ updated_at: new Date().toISOString(), context_ref: contextRef })
        .eq('id', sessionId)
        .eq('user_id', auth.user.id);
    }

    await auth.client.from('ai_chat_messages').insert([
      {
        session_id: sessionId,
        user_id: auth.user.id,
        role: 'user',
        content: message,
      },
      {
        session_id: sessionId,
        user_id: auth.user.id,
        role: 'assistant',
        content: assistantText,
      },
    ]);
  } catch (e) {
    console.error('chat persist error', e);
  }

  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`event: session\ndata: ${JSON.stringify({ sessionId })}\n\n`),
        );
        // Chunk assistant text for SSE clients
        const chunkSize = 48;
        for (let i = 0; i < assistantText.length; i += chunkSize) {
          const chunk = assistantText.slice(i, i + chunkSize);
          controller.enqueue(
            encoder.encode(`event: token\ndata: ${JSON.stringify({ token: chunk })}\n\n`),
          );
        }
        controller.enqueue(
          encoder.encode(`event: done\ndata: ${JSON.stringify({ sessionId, content: assistantText })}\n\n`),
        );
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }

  return NextResponse.json({
    sessionId,
    role: 'assistant',
    content: assistantText,
    contextRef,
  });
}
