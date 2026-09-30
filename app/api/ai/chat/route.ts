import { NextResponse } from 'next/server';
import {
  buildChatMessages,
  buildRefusal,
  checkRateLimit,
  createUserClientFromAuthHeader,
  isChatModelConfigured,
  loadMwsDataBlock,
  looksLikeAdviceRequest,
  type ChatContextRef,
} from '@/lib/intelligence/chat/context';
import { callChatModelWithTools } from '@/lib/intelligence/chat/tool-loop';
import {
  inferWidgetsFromQuestion,
  mergeWidgets,
  type ChatWidget,
} from '@/lib/intelligence/chat/tools';

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
 *
 * Response includes optional `widgets` (price_chart / quadrant) for inline UI.
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
  const mwsData = await loadMwsDataBlock(auth.client, contextRef, message, auth.user.id);

  let assistantText: string;
  let widgets: ChatWidget[] = [];

  if (looksLikeAdviceRequest(message)) {
    assistantText = buildRefusal(
      'Available context was loaded from MWS DATA for explanation only.',
    );
  } else {
    const messages = buildChatMessages(mwsData, message);
    const result = await callChatModelWithTools(messages);
    if (!result.ok) {
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
    } else {
      assistantText = result.text;
      widgets = mergeWidgets(result.widgets ?? [], inferWidgetsFromQuestion(message));
    }
  }

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

    const rows: Record<string, unknown>[] = [
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
    ];
    const { error: insertErr } = await auth.client.from('ai_chat_messages').insert(rows);
    if (insertErr) throw insertErr;
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
        if (widgets.length > 0) {
          controller.enqueue(
            encoder.encode(`event: widgets\ndata: ${JSON.stringify({ widgets })}\n\n`),
          );
        }
        const chunkSize = 48;
        for (let i = 0; i < assistantText.length; i += chunkSize) {
          const chunk = assistantText.slice(i, i + chunkSize);
          controller.enqueue(
            encoder.encode(`event: token\ndata: ${JSON.stringify({ token: chunk })}\n\n`),
          );
        }
        controller.enqueue(
          encoder.encode(
            `event: done\ndata: ${JSON.stringify({ sessionId, content: assistantText, widgets })}\n\n`,
          ),
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
    widgets,
    contextRef,
  });
}
