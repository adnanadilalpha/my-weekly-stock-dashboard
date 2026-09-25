import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '@/lib/supabase-env';

export type ChatContextRef = {
  ticker?: string;
  sector?: string;
  portfolioPage?: string;
  userPortfolioId?: string;
};

const SYSTEM_PROMPT = `You are MWS Intelligence. Explain supplied MWS DATA only.
Rules:
- Do not recalculate Trend Score, Rating, Outlook, EMAs, returns, or portfolio KPIs.
- Do not invent missing fields; say not available.
- Do not give buy/sell/hold advice or price targets.
- Keep Daily vs Weekly, Performance vs Rating, and 1M vs 3M distinct.
- Prefer packaged narratives when present.`;

const ADVICE_RE =
  /\b(buy|sell|hold|accumulate|short|long|price target|should i (buy|sell)|recommend(ed|ation)?)\b/i;

export function looksLikeAdviceRequest(message: string): boolean {
  return ADVICE_RE.test(message);
}

export function buildRefusal(availableHint: string): string {
  return (
    'I can explain current MWS state, but I do not give buy/sell/hold advice or price targets. ' +
    availableHint
  );
}

export async function createUserClientFromAuthHeader(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  const { url, anonKey } = getSupabaseConfig();
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { client, user: data.user, accessToken: token };
}

export async function loadMwsDataBlock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminOrUserClient: any,
  context: ChatContextRef,
): Promise<string> {
  const lines: string[] = [];

  if (context.ticker) {
    const ticker = context.ticker.toUpperCase();
    const tables = ['market_segments', 'sectors', 'mega_caps', 'other_stocks'] as const;
    const fields =
      'ticker, daily_trend_score, daily_rating, daily_outlook, daily_trend_description, weekly_trend_score, weekly_rating, weekly_outlook, performance_strength, distance_to_highs, daily_performance_summary, "1m_percent", "3m_percent", vs_1y_high, pct_from_sma50, pct_from_sma200, daily_vs_spy_comparison, daily_vs_benchmark_comparison';
    for (const table of tables) {
      const { data } = await adminOrUserClient.from(table).select(fields).eq('ticker', ticker).maybeSingle();
      if (data) {
        lines.push(`TICKER ${ticker} (from ${table}):`);
        for (const [k, v] of Object.entries(data)) {
          if (v != null && v !== '') lines.push(`  ${k}: ${v}`);
        }
        break;
      }
    }
  }

  if (context.userPortfolioId) {
    const { data: holdings } = await adminOrUserClient
      .from('user_portfolio_holdings')
      .select('ticker, shares, cost_basis, notes')
      .eq('portfolio_id', context.userPortfolioId)
      .order('sort_order');
    if (holdings?.length) {
      lines.push(`USER PORTFOLIO ${context.userPortfolioId} HOLDINGS:`);
      for (const h of holdings) {
        lines.push(`  ${h.ticker} shares=${h.shares ?? 'n/a'} cost_basis=${h.cost_basis ?? 'n/a'}`);
      }
    }
  }

  if (context.portfolioPage) {
    lines.push(`PORTFOLIO PAGE CONTEXT: ${context.portfolioPage}`);
  }
  if (context.sector) {
    lines.push(`SECTOR CONTEXT: ${context.sector}`);
  }

  if (lines.length === 0) {
    return 'MWS DATA:\n\n(no ticker or portfolio context loaded)\n';
  }
  return `MWS DATA:\n\n${lines.join('\n')}\n`;
}

export function buildChatMessages(mwsDataBlock: string, userQuestion: string) {
  return [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: `${mwsDataBlock}\nQUESTION:\n${userQuestion}`,
    },
  ];
}

export async function callModalChat(
  messages: { role: string; content: string }[],
): Promise<{ ok: true; text: string } | { ok: false; error: string; status: number }> {
  const url = process.env.MODAL_CHAT_URL?.trim();
  if (!url) {
    return { ok: false, error: 'Chat model endpoint is not configured (MODAL_CHAT_URL).', status: 503 };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const key = process.env.MODAL_CHAT_API_KEY?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages, stream: false }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      ok: false,
      error: `Modal chat error ${res.status}: ${body.slice(0, 200)}`,
      status: 502,
    };
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    output?: string;
    text?: string;
  };
  const text =
    json.choices?.[0]?.message?.content ??
    json.output ??
    json.text ??
    '';
  if (!text.trim()) {
    return { ok: false, error: 'Empty model response', status: 502 };
  }
  return { ok: true, text: text.trim() };
}

/** Simple in-memory rate limit (per serverless isolate). */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(userId: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export { SYSTEM_PROMPT };
