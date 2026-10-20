import { after, NextResponse } from 'next/server';
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
import {
  inferWidgetsFromQuestion,
  type ChatWidget,
} from '@/lib/intelligence/chat/tools';

export const runtime = 'nodejs';
/** Keep chat under Vercel’s practical limit; clients also raised timeouts. */
export const maxDuration = 60;

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
 *
 * Charts/quadrants are attached server-side via inferWidgets (no multi-round tool loop).
 * That keeps one model round-trip while still rendering native widgets.
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
  const t0 = Date.now();
  // Widgets are pure local inference (show_price_chart / show_quadrant need no model tools).
  const widgets: ChatWidget[] = inferWidgetsFromQuestion(message);

  const mwsData = await loadMwsDataBlock(auth.client, contextRef, message, auth.user.id);
  const tContext = Date.now() - t0;

  let assistantText: string;
  let modelMs = 0;

  if (looksLikeAdviceRequest(message)) {
    assistantText = buildRefusal(
      'Available context was loaded from MWS DATA for explanation only.',
    );
  } else {
    const messages = buildChatMessages(mwsData, message);
    // Single-shot only — tool rounds were stacking 2–3 Modal RTTs for free (widgets are local).
    const tModel = Date.now();
    const result = await callChatModel(messages);
    modelMs = Date.now() - tModel;
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
    }
  }
  console.info(
    `[chat] total=${Date.now() - t0}ms context=${tContext}ms model=${modelMs}ms widgets=${widgets.length}`,
  );

  const userId = auth.user.id;
  const client = auth.client;
  const isNewSession = !body.sessionId;
  // Don't block the response on a session INSERT — mint id now, persist in after().
  const sessionId = body.sessionId ?? crypto.randomUUID();

  after(async () => {
    try {
      if (isNewSession) {
        const { error: sessionErr } = await client.from('ai_chat_sessions').insert({
          id: sessionId,
          user_id: userId,
          title: message.slice(0, 80),
          context_ref: contextRef,
        });
        if (sessionErr) throw sessionErr;
      } else {
        await client
          .from('ai_chat_sessions')
          .update({ updated_at: new Date().toISOString(), context_ref: contextRef })
          .eq('id', sessionId)
          .eq('user_id', userId);
      }
      const { error: insertErr } = await client.from('ai_chat_messages').insert([
        { session_id: sessionId, user_id: userId, role: 'user', content: message },
        { session_id: sessionId, user_id: userId, role: 'assistant', content: assistantText },
      ]);
      if (insertErr) throw insertErr;
    } catch (e) {
      console.error('chat persist error', e);
    }
  });

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

/** Lightweight probe — confirms deploy + preferred provider without a model call. */
export async function GET() {
  const explicit = (process.env.MWS_CHAT_PROVIDER ?? 'auto').trim().toLowerCase();
  const modal = Boolean(
    (process.env.MODAL_PROXY_TOKEN_ID && process.env.MODAL_PROXY_TOKEN_SECRET) ||
      (process.env.MODAL_CHAT_URL && process.env.MODAL_CHAT_API_KEY),
  );
  const google = Boolean(process.env.GOOGLE_STUDIO_AI_API_KEY?.trim());
  const preferred =
    explicit === 'google' || explicit === 'google_studio' || explicit === 'gemini'
      ? google
        ? 'google_studio'
        : null
      : explicit === 'modal'
        ? modal
          ? 'modal'
          : null
        : modal
          ? 'modal'
          : google
            ? 'google_studio'
            : null;
  return NextResponse.json({
    ok: true,
    preferred,
    modal,
    google,
    explicit,
  });
}
