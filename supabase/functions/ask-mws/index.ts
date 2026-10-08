/**
 * Ask MWS — mobile chat Edge Function (not the Next.js /api/ai/chat route).
 *
 * Auth: Authorization Bearer <user access token>
 * Body: { message: string, ticker?: string }
 *
 * Optional secrets for LLM:
 *   GOOGLE_STUDIO_AI_API_KEY, GOOGLE_STUDIO_AI_MODEL
 *   MODAL_CHAT_BASE_URL, MODAL_CHAT_MODEL, MODAL_PROXY_TOKEN_ID, MODAL_PROXY_TOKEN_SECRET
 * Falls back to deterministic answers from MWS rows when no model is configured.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type TickerRow = {
  ticker: string;
  name?: string | null;
  daily_trend_score?: number | null;
  daily_rating?: string | null;
  '1m_percent'?: number | null;
  '3m_percent'?: number | null;
  vs_1y_high?: number | null;
  daily_trend_description?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'unauthorized' }, 401);
    }
    const jwt = authHeader.slice(7).trim();

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!url || !anon) return json({ error: 'Server misconfigured' }, 500);

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json();
    const message = String(body?.message ?? '').trim();
    const contextTicker = body?.ticker ? String(body.ticker).toUpperCase() : null;
    if (!message) return json({ error: 'message_required' }, 400);

    if (/\b(buy|sell|hold|price target|should i (buy|sell))\b/i.test(message)) {
      return json({
        text: 'I can explain MWS ratings and momentum data, but I cannot give buy/sell/hold advice.',
        tickers: [],
      });
    }

    const tickers = await loadRelevantTickers(userClient, message, contextTicker);
    const dataBlock = tickers
      .map(
        (t) =>
          `${t.ticker}: score=${t.daily_trend_score ?? 'n/a'} rating=${t.daily_rating ?? 'n/a'} 1M=${t['1m_percent'] ?? 'n/a'} 3M=${t['3m_percent'] ?? 'n/a'} vs52w=${t.vs_1y_high ?? 'n/a'}`,
      )
      .join('\n');

    let text =
      (await callModel(message, dataBlock)) ??
      buildFallback(message, tickers);

    return json({
      text,
      tickers: tickers.slice(0, 6).map((t) => ({
        ticker: t.ticker,
        score: t.daily_trend_score ?? 0,
        rating: simplifyRating(t.daily_rating, t.daily_trend_score),
        change3m: t['3m_percent'] ?? null,
        from52w: t.vs_1y_high ?? null,
      })),
    });
  } catch (e) {
    console.error(e);
    return json({ error: 'Invalid request' }, 400);
  }
});

async function loadRelevantTickers(
  client: ReturnType<typeof createClient>,
  message: string,
  contextTicker: string | null,
): Promise<TickerRow[]> {
  const wanted = new Set<string>();
  if (contextTicker) wanted.add(contextTicker);
  for (const m of message.toUpperCase().matchAll(/\b[A-Z]{2,5}\b/g)) {
    wanted.add(m[0]);
  }

  const select =
    'ticker,name,daily_trend_score,daily_rating,1m_percent,3m_percent,vs_1y_high,daily_trend_description';
  const out: TickerRow[] = [];

  if (wanted.size) {
    for (const table of ['mega_caps', 'other_stocks', 'market_segments', 'sectors']) {
      const list = [...wanted];
      const { data } = await client.from(table).select(select).in('ticker', list);
      for (const row of data ?? []) out.push(row as TickerRow);
    }
  }

  if (!out.length) {
    const { data } = await client
      .from('sectors')
      .select(select)
      .order('daily_trend_score', { ascending: false })
      .limit(3);
    for (const row of data ?? []) out.push(row as TickerRow);
  }

  const seen = new Set<string>();
  return out.filter((r) => {
    if (!r.ticker || seen.has(r.ticker)) return false;
    seen.add(r.ticker);
    return true;
  });
}

function simplifyRating(label: string | null | undefined, score: number | null | undefined): string {
  if (label) {
    const l = label.toLowerCase();
    if (l.includes('strong') || l.includes('uptrend')) return 'Strong';
    if (l.includes('weak') || l.includes('down') || l.includes('bear')) return 'Weak';
  }
  if (score != null) {
    if (score >= 4) return 'Strong';
    if (score >= 3) return 'Mixed';
    return 'Weak';
  }
  return 'Mixed';
}

function buildFallback(message: string, tickers: TickerRow[]): string {
  if (!tickers.length) {
    return 'I could not load MWS data for that question right now. Try again in a moment.';
  }
  const top = [...tickers].sort(
    (a, b) => (b.daily_trend_score ?? 0) - (a.daily_trend_score ?? 0),
  )[0];
  if (/weaken/i.test(message)) {
    const weak = [...tickers].sort(
      (a, b) => (a.daily_trend_score ?? 0) - (b.daily_trend_score ?? 0),
    )[0];
    return `${weak.ticker} is among the weaker names in this set at ${weak.daily_trend_score ?? 'n/a'}/5 (${simplifyRating(weak.daily_rating, weak.daily_trend_score)}).`;
  }
  if (top.daily_trend_description) return top.daily_trend_description;
  return `${top.ticker} currently leads this set with an MWS score of ${top.daily_trend_score ?? 'n/a'}/5 (${simplifyRating(top.daily_rating, top.daily_trend_score)}).`;
}

async function callModel(message: string, dataBlock: string): Promise<string | null> {
  const googleKey = Deno.env.get('GOOGLE_STUDIO_AI_API_KEY');
  const googleModel = Deno.env.get('GOOGLE_STUDIO_AI_MODEL') ?? 'gemini-2.0-flash';
  const system =
    'You are MWS Intelligence. Explain only the supplied MWS DATA. Never give buy/sell advice. Keep answers to 2-5 short sentences.';

  if (googleKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${googleModel}:generateContent?key=${googleKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `${system}\n\nMWS DATA:\n${dataBlock}\n\nQuestion: ${message}`,
                  },
                ],
              },
            ],
          }),
        },
      );
      if (res.ok) {
        const j = await res.json();
        const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text === 'string' && text.trim()) return text.trim();
      }
    } catch (e) {
      console.error('google model failed', e);
    }
  }

  const modalBase = Deno.env.get('MODAL_CHAT_BASE_URL');
  const modalModel = Deno.env.get('MODAL_CHAT_MODEL');
  const id = Deno.env.get('MODAL_PROXY_TOKEN_ID');
  const secret = Deno.env.get('MODAL_PROXY_TOKEN_SECRET');
  if (modalBase && modalModel && id && secret) {
    try {
      const res = await fetch(`${modalBase.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${id}:${secret}`,
        },
        body: JSON.stringify({
          model: modalModel,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `MWS DATA:\n${dataBlock}\n\nQuestion: ${message}` },
          ],
        }),
      });
      if (res.ok) {
        const j = await res.json();
        const text = j?.choices?.[0]?.message?.content;
        if (typeof text === 'string' && text.trim()) return text.trim();
      }
    } catch (e) {
      console.error('modal model failed', e);
    }
  }

  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
