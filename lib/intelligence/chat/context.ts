import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '@/lib/supabase-env';
import { quadrantFromPct } from '@/lib/intelligence/brief/composers/quadrant';
import type { QuadrantId } from '@/lib/intelligence/brief/types';

export type ChatContextRef = {
  ticker?: string;
  sector?: string;
  portfolioPage?: string;
  userPortfolioId?: string;
};

const SYSTEM_PROMPT = `You are MWS Intelligence — the assistant for My Weekly Stock (MWS), a market momentum analysis product.

ROLE
- Explain supplied MWS DATA and teach MWS concepts.
- Never recalculate or “correct” Trend Score, Rating, Outlook, EMAs, returns, or portfolio KPIs.
- Never invent missing fields. Say not available.
- Never give buy/sell/hold advice, price targets, or predictions.

MWS DATA RULES
- Treat every field in the MWS DATA block as authoritative for this turn.
- Prefer packaged narratives (daily_trend_description, weekly_trend_description, daily_performance_description / summary) when present.
- Every number you cite must appear in the supplied MWS DATA (or be an explicit methodology teaching note).
- Daily and Weekly are concurrent timeframe analyses from the same update — not “previous vs current” and not calendar day/week P&L.
- Performance strength ≠ Rating. 1M and 3M are different lookbacks, never sequential stages.
- Outlook qualifies state within a Rating band; it does not replace Rating.
- Quadrant Analysis is first-class: when quadrant_position is present on a ticker, lead with that label (Synced Uptrend / Pullback / Turning / Broken Trend) and the EMA relationship. Use daily_price_vs_21ema (X) and weekly_price_vs_30ema (Y) only as supporting distances — do not invent a different framework.

ANSWERING “TODAY” / “THIS WEEK” / “LAST WEEK”
- MWS does not store calendar “today %”, “week-to-date %”, or prior-week Rating history.
- For “today / day / intraday” questions: use Daily MWS fields (daily_rating, daily_outlook, daily_trend_score, daily_* narratives, 1m/3m, distance).
- For “this week / weekly” questions: use Weekly MWS fields (weekly_rating, weekly_outlook, weekly_trend_score, weekly_* narratives).
- For “last week” / prior-period Rating questions: say MWS does not archive prior Ratings; only the current concurrent Daily and Weekly snapshots are available.
- Always clarify briefly that you are reporting MWS Daily/Weekly momentum state, not live session or calendar-week return, when the user asked for today/this week/last week.
- Any ticker in the MWS universe may appear in MWS DATA when asked about — not only portfolio holdings.

STYLE
- Keep answers short, clean, and scannable. Default to 2–5 short sentences or a tight bullet list — not essays.
- Lead with the direct answer in the first sentence, then only the MWS points that matter.
- Prefer **bold** for tickers/ratings, short "- " bullets, and blank lines between tickers. No ### headings, no *** stars, no tables, no code fences.
- Do not dump the whole holdings list unless asked. Do not restate the full MWS DATA block.
- If a ticker the user asked about is missing from MWS DATA, say it is not in the MWS universe (or inactive) — do not substitute other holdings unless the user asked about the portfolio.`;

const ADVICE_RE =
  /\b(buy|sell|hold|accumulate|short|long|price target|should i (buy|sell)|recommend(ed|ation)?)\b/i;

/** Common company → ticker aliases for chat questions (incl. frequent typos). */
const NAME_ALIASES: Record<string, string> = {
  nvidia: 'NVDA',
  nvd: 'NVDA', // common shorthand / typo
  apple: 'AAPL',
  appl: 'AAPL', // common typo for AAPL
  aaple: 'AAPL',
  tesla: 'TSLA',
  tsla: 'TSLA',
  microsoft: 'MSFT',
  microsft: 'MSFT',
  amazon: 'AMZN',
  google: 'GOOGL',
  alphabet: 'GOOGL',
  meta: 'META',
  facebook: 'META',
  netflix: 'NFLX',
  amd: 'AMD',
  intel: 'INTC',
  broadcom: 'AVGO',
  silver: 'SLV',
  gold: 'GLD',
  spy: 'SPY',
  qqq: 'QQQ',
};

/** Canonical tickers used for 1-edit typo correction when an exact lookup misses. */
const TYPO_CORRECTION_TARGETS = [
  ...new Set([
    ...Object.values(NAME_ALIASES),
    'AAPL',
    'ABT',
    'AMZN',
    'GOOGL',
    'GOOG',
    'MSFT',
    'META',
    'NVDA',
    'TSLA',
    'SPY',
    'QQQ',
    'IWM',
    'DIA',
    'GLD',
    'SLV',
  ]),
];

/** English / filler tokens that look like tickers but are not. */
const TICKER_STOPWORDS = new Set([
  'A', 'I', 'AM', 'AN', 'AND', 'ARE', 'AS', 'AT', 'BE', 'BY', 'DO', 'FOR', 'FROM',
  'HAS', 'HOW', 'IF', 'IN', 'IS', 'IT', 'ITS', 'ME', 'MY', 'NO', 'NOT', 'NOW',
  'OF', 'OK', 'ON', 'OR', 'SO', 'THE', 'TO', 'UP', 'US', 'VS', 'WE', 'WHAT',
  'WHEN', 'WHO', 'WHY', 'WITH', 'YOU', 'YOUR', 'WEEK', 'WEEKS', 'TODAY', 'DAILY',
  'WEEKLY', 'MWS', 'DATA', 'ETF', 'CEO', 'IPO', 'ATH', 'YTD', 'ALL', 'CAN', 'DID',
  'GET', 'GOT', 'HAD', 'HER', 'HIS', 'OUR', 'OUT', 'PER', 'SAY', 'SEE', 'SET',
  'TOO', 'WAS', 'WAY', 'YES', 'YET', 'LAST', 'FAR', 'ASK', 'ANY', 'BOTH', 'EACH',
  'MORE', 'MOST', 'THAN', 'THAT', 'THEM', 'THEN', 'THEY', 'ALSO', 'JUST', 'ONLY',
  'OVER', 'SUCH', 'VERY', 'WELL', 'BEEN', 'INTO', 'LIKE', 'MAKE', 'MUCH', 'SOME',
  'WANT', 'WILL', 'ABOUT', 'DOING', 'HAVE', 'HERE', 'STATE', 'SCORE', 'TREND',
  'RATING', 'STOCK', 'SHARE', 'PRICE', 'HIGH', 'LOWS', 'WEAK', 'BOOK', 'HELD',
  'OWNS', 'OWN', 'NEXT', 'BACK', 'BEST', 'GOOD', 'BAD', 'SAME', 'ELSE', 'EVEN',
  'EVER', 'NEAR', 'NEED', 'LOOK', 'TELL', 'SHOW', 'GIVE', 'TAKE', 'COME', 'GONE',
  'KEEP', 'KNOW', 'MEAN', 'SAYS', 'SAID', 'SEEM', 'SEEN', 'SURE', 'THAN', 'THUS',
  'VIA', 'YET', 'AGO', 'ONE', 'TWO', 'TOP', 'BOT', 'LOW', 'MID', 'NEW', 'OLD',
  'BIG', 'HIT', 'RUN', 'PUT', 'BUY', 'SELL', 'LONG', 'SHORT', 'HOLD', 'THIS',
  'THAT', 'THESE', 'THOSE', 'THERE', 'THEIR', 'WHERE', 'WHICH', 'WHILE', 'AFTER',
  'BEFORE', 'UNDER', 'AGAIN', 'OTHER', 'EVERY', 'STILL', 'BEING', 'GOING',
]);

const TICKER_TABLES = ['market_segments', 'sectors', 'mega_caps', 'other_stocks'] as const;

/** Narrow select — common columns across ticker tables (avoids select('*') egress). */
const TICKER_SELECT =
  'ticker, last_updated, ' +
  'daily_current_price, weekly_current_price, ' +
  'daily_trend_score, daily_rating, daily_outlook, daily_trend_description, ' +
  'weekly_trend_score, weekly_rating, weekly_outlook, weekly_trend_description, ' +
  'performance_strength, distance_to_highs, ' +
  'daily_performance_summary, daily_performance_description, ' +
  '"1m_percent", "3m_percent", vs_1y_high, ' +
  'daily_price_vs_21ema, weekly_price_vs_30ema, ' +
  'daily_vs_spy_comparison, daily_vs_benchmark_comparison, ' +
  'weekly_vs_spy_comparison, weekly_vs_benchmark_comparison';

const TICKER_OUTPUT_KEYS = [
  'last_updated',
  'daily_current_price',
  'weekly_current_price',
  'daily_trend_score',
  'daily_rating',
  'daily_outlook',
  'daily_trend_description',
  'weekly_trend_score',
  'weekly_rating',
  'weekly_outlook',
  'weekly_trend_description',
  'performance_strength',
  'distance_to_highs',
  '1m_percent',
  '3m_percent',
  'vs_1y_high',
  'daily_performance_summary',
  'daily_performance_description',
  'daily_price_vs_21ema',
  'weekly_price_vs_30ema',
  'daily_vs_spy_comparison',
  'daily_vs_benchmark_comparison',
  'weekly_vs_spy_comparison',
  'weekly_vs_benchmark_comparison',
] as const;

const MAX_TICKERS = 16;

export type ExtractedTickers = {
  /** $-prefixed, ALL-CAPS, or name-alias matches — report if missing from MWS. */
  definite: string[];
  /** Lowercase symbol-like tokens — include only if found in MWS (silent miss). */
  candidates: string[];
};

export function looksLikeAdviceRequest(message: string): boolean {
  return ADVICE_RE.test(message);
}

export function buildRefusal(availableHint: string): string {
  return (
    'I can explain current MWS state, but I do not give buy/sell/hold advice or price targets. ' +
    availableHint
  );
}

/**
 * Pull ticker symbols from free-text questions ($NVDA, NVDA, nvidia, abt, …).
 * Lowercase candidates are validated against MWS later (silent miss if not a real ticker).
 */
export function extractTickersFromText(text: string): string[] {
  const { definite, candidates } = extractTickersDetailed(text);
  return [...new Set([...definite, ...candidates])];
}

/** Levenshtein distance — used only for short ticker typos (≤5 chars). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/**
 * Map a missed symbol to a unique 1-edit canonical ticker (e.g. APPL → AAPL).
 * Returns null when no unique match exists.
 */
export function suggestTickerCorrection(raw: string): string | null {
  const u = raw.trim().toUpperCase();
  if (!u || u.length > 5) return null;
  const aliasHit = NAME_ALIASES[u.toLowerCase()];
  if (aliasHit) return aliasHit;

  let match: string | null = null;
  for (const target of TYPO_CORRECTION_TARGETS) {
    if (editDistance(u, target) !== 1) continue;
    if (match && match !== target) return null; // ambiguous
    match = target;
  }
  return match;
}

export function extractTickersDetailed(text: string): ExtractedTickers {
  const definite = new Set<string>();
  const candidates = new Set<string>();
  const lower = text.toLowerCase();

  for (const [alias, ticker] of Object.entries(NAME_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`, 'i').test(lower)) definite.add(ticker);
  }

  for (const m of text.matchAll(/\$([A-Za-z]{1,5})\b/g)) {
    const t = m[1].toUpperCase();
    if (TICKER_STOPWORDS.has(t)) continue;
    definite.add(suggestTickerCorrection(t) ?? t);
  }

  for (const m of text.matchAll(/\b([A-Z]{1,5})\b/g)) {
    const t = m[1];
    if (TICKER_STOPWORDS.has(t)) continue;
    // APPL → AAPL when uniquely correctable; otherwise keep as typed.
    definite.add(suggestTickerCorrection(t) ?? t);
  }

  // Lowercase symbol-like tokens (abt, nvda) — DB-validated later.
  for (const m of text.matchAll(/\b([a-z]{1,5})\b/g)) {
    const raw = m[1];
    if (NAME_ALIASES[raw]) {
      definite.add(NAME_ALIASES[raw]);
      continue;
    }
    const t = raw.toUpperCase();
    if (TICKER_STOPWORDS.has(t)) continue;
    // Prefer a unique 1-edit correction over a likely-typo candidate (appl → AAPL).
    const corrected = suggestTickerCorrection(t);
    if (corrected && corrected !== t) {
      definite.add(corrected);
      continue;
    }
    candidates.add(t);
  }

  return {
    definite: [...definite],
    candidates: [...candidates].filter((t) => !definite.has(t)),
  };
}

function formatPct(v: unknown): string | null {
  if (typeof v !== 'number' || Number.isNaN(v)) return null;
  const pct = v * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function formatField(key: string, value: unknown): string | null {
  if (value == null || value === '') return null;
  if (
    key === '1m_percent' ||
    key === '3m_percent' ||
    key === 'vs_1y_high' ||
    key === 'daily_price_vs_21ema' ||
    key === 'weekly_price_vs_30ema' ||
    key.endsWith('_percent')
  ) {
    const pct = formatPct(typeof value === 'number' ? value : Number(value));
    if (pct) return `  ${key}: ${pct} (raw=${value})`;
  }
  return `  ${key}: ${value}`;
}

const QUADRANT_POSITION_LABEL: Record<Exclude<QuadrantId, 'UNKNOWN'>, string> = {
  SYNCED_UPTREND: 'Synced Uptrend — above 21-day & 30-week EMA',
  PULLBACK: 'Pullback — above 30-week EMA, below 21-day EMA',
  BROKEN_TREND: 'Broken Trend — below 21-day & 30-week EMA',
  TURNING: 'Turning — below 30-week EMA, above 21-day EMA',
};

function asFiniteNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
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

/**
 * Batch-load MWS snapshots for many tickers with only 4 table queries (`.in`),
 * narrow column select — same coverage as the web app, minimal egress.
 */
async function fetchTickerSnapshotsBatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  tickers: string[],
): Promise<Map<string, { table: string; data: Record<string, unknown> }>> {
  const uniq = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];
  const map = new Map<string, { table: string; data: Record<string, unknown> }>();
  if (uniq.length === 0) return map;

  // Exactly 4 parallel queries (one per universe table), then merge in web-app order.
  const settled = await Promise.all(
    TICKER_TABLES.map(async (table) => {
      const { data, error } = await client.from(table).select(TICKER_SELECT).in('ticker', uniq);
      if (error) {
        console.error(`[chat] ticker snapshot query failed on ${table}:`, error.message ?? error);
      }
      return { table, rows: error ? [] : ((data ?? []) as Record<string, unknown>[]) };
    }),
  );

  for (const table of TICKER_TABLES) {
    const block = settled.find((s) => s.table === table);
    for (const row of block?.rows ?? []) {
      const t = String(row.ticker ?? '').toUpperCase();
      if (t && !map.has(t)) map.set(t, { table, data: row });
    }
  }

  // Second pass: unique 1-edit typos of known names (APPL → AAPL).
  const missed = uniq.filter((t) => !map.has(t));
  const pendingRetry = new Map<string, string>(); // raw → fixed
  for (const raw of missed) {
    const fixed = suggestTickerCorrection(raw);
    if (!fixed || fixed === raw) continue;
    const existing = map.get(fixed);
    if (existing) {
      map.set(raw, existing);
    } else {
      pendingRetry.set(raw, fixed);
    }
  }
  if (pendingRetry.size > 0) {
    const retryMap = await fetchTickerSnapshotsExact(client, [...new Set(pendingRetry.values())]);
    for (const [raw, fixed] of pendingRetry) {
      const row = retryMap.get(fixed);
      if (!row) continue;
      map.set(raw, row);
      if (!map.has(fixed)) map.set(fixed, row);
    }
  }

  return map;
}

/** Inner batch without typo retry (avoids recursion). */
async function fetchTickerSnapshotsExact(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  tickers: string[],
): Promise<Map<string, { table: string; data: Record<string, unknown> }>> {
  const uniq = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];
  const map = new Map<string, { table: string; data: Record<string, unknown> }>();
  if (uniq.length === 0) return map;

  const settled = await Promise.all(
    TICKER_TABLES.map(async (table) => {
      const { data, error } = await client.from(table).select(TICKER_SELECT).in('ticker', uniq);
      if (error) {
        console.error(`[chat] ticker snapshot retry failed on ${table}:`, error.message ?? error);
      }
      return { table, rows: error ? [] : ((data ?? []) as Record<string, unknown>[]) };
    }),
  );

  for (const table of TICKER_TABLES) {
    const block = settled.find((s) => s.table === table);
    for (const row of block?.rows ?? []) {
      const t = String(row.ticker ?? '').toUpperCase();
      if (t && !map.has(t)) map.set(t, { table, data: row });
    }
  }
  return map;
}

function appendTickerBlock(
  lines: string[],
  ticker: string,
  table: string,
  data: Record<string, unknown>,
) {
  lines.push(`TICKER ${ticker} (from ${table}):`);
  const pct21 = asFiniteNumber(data.daily_price_vs_21ema);
  const pct30 = asFiniteNumber(data.weekly_price_vs_30ema);
  const q = quadrantFromPct(pct21, pct30);
  if (q !== 'UNKNOWN') {
    lines.push(`  quadrant_id: ${q}`);
    lines.push(`  quadrant_position: ${QUADRANT_POSITION_LABEL[q]}`);
  }
  for (const key of TICKER_OUTPUT_KEYS) {
    const line = formatField(key, data[key]);
    if (line) lines.push(line);
  }
}

function messageAsksAboutPortfolio(message?: string): boolean {
  if (!message) return false;
  return /\b(holding|holdings|portfolio|book|my (stocks|tickers|names))\b/i.test(message);
}

export async function loadMwsDataBlock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminOrUserClient: any,
  context: ChatContextRef,
  message?: string,
  userId?: string,
): Promise<string> {
  const lines: string[] = [];
  let holdingTickers: string[] = [];

  type HoldingRow = {
    ticker: string | null;
    shares: number | null;
    cost_basis: number | null;
    cash_invested: number | null;
    start_date: string | null;
    returns_pct: number | null;
    notes: string | null;
    display_name: string | null;
    status: string | null;
    exit_date: string | null;
    exit_price: number | null;
  };

  // ---- User portfolio (this user only): 1 portfolio + 1 holdings query ----
  if (userId) {
    let pq = adminOrUserClient
      .from('user_portfolios')
      .select('id, name, base_currency')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (context.userPortfolioId) {
      pq = adminOrUserClient
        .from('user_portfolios')
        .select('id, name, base_currency')
        .eq('user_id', userId)
        .eq('id', context.userPortfolioId)
        .limit(1);
    }
    const { data: portfolios } = await pq;
    const p = portfolios?.[0];
    if (p) {
      const { data: holdings } = await adminOrUserClient
        .from('user_portfolio_holdings')
        .select(
          'ticker, shares, cost_basis, cash_invested, start_date, returns_pct, notes, display_name, status, exit_date, exit_price',
        )
        .eq('portfolio_id', p.id)
        .order('sort_order');

      const rows = (holdings ?? []) as HoldingRow[];
      if (rows.length) {
        const openRows = rows.filter((h) => (h.status ?? 'open') !== 'closed');
        const cashTotal = openRows.reduce((s, h) => s + (Number(h.cash_invested) || 0), 0);
        const hasCash = openRows.some((h) => h.cash_invested != null);
        lines.push(
          `USER PORTFOLIO "${p.name}" (id=${p.id}, currency=${p.base_currency ?? 'USD'}):`,
        );
        if (hasCash) lines.push(`  book_cash_invested (open only): ${cashTotal}`);

        for (const h of rows) {
          const ticker = String(h.ticker ?? '').toUpperCase();
          if (!ticker) continue;
          const status = h.status === 'closed' ? 'closed' : 'open';
          if (status === 'open') holdingTickers.push(ticker);
          const cash = h.cash_invested != null ? Number(h.cash_invested) : null;
          const weight =
            status === 'open' && hasCash && cash != null && cashTotal > 0
              ? `${((cash / cashTotal) * 100).toFixed(1)}%`
              : 'n/a';
          lines.push(
            `  ${[
              ticker,
              `status=${status}`,
              `cash_invested=${cash ?? 'n/a'}`,
              `weight=${weight}`,
              `start_date=${h.start_date ?? 'n/a'}`,
              `shares=${h.shares ?? 'n/a'}`,
              `avg_entry=${h.cost_basis ?? 'n/a'}`,
              status === 'closed'
                ? `exit_date=${h.exit_date ?? 'n/a'} exit_price=${h.exit_price ?? 'n/a'}`
                : null,
            ]
              .filter(Boolean)
              .join(' | ')}`,
          );
        }
      }
    }
  } else if (context.userPortfolioId) {
    const { data: holdings } = await adminOrUserClient
      .from('user_portfolio_holdings')
      .select(
        'ticker, shares, cost_basis, cash_invested, start_date, returns_pct, notes, display_name, status, exit_date, exit_price',
      )
      .eq('portfolio_id', context.userPortfolioId)
      .order('sort_order');
    for (const h of (holdings ?? []) as HoldingRow[]) {
      const ticker = String(h.ticker ?? '').toUpperCase();
      const status = h.status === 'closed' ? 'closed' : 'open';
      if (ticker && status === 'open') holdingTickers.push(ticker);
      lines.push(
        `  ${ticker || '?'} status=${status} cash_invested=${h.cash_invested ?? 'n/a'} shares=${h.shares ?? 'n/a'} avg_entry=${h.cost_basis ?? 'n/a'}`,
      );
    }
  }

  const extracted = message
    ? extractTickersDetailed(message)
    : { definite: [] as string[], candidates: [] as string[] };
  const definite = [
    ...extracted.definite.map((t) => t.toUpperCase()),
    ...(context.ticker ? [context.ticker.toUpperCase()] : []),
  ];
  const candidates = extracted.candidates.map((t) => t.toUpperCase());

  const asksPortfolio = messageAsksAboutPortfolio(message) || (!message && holdingTickers.length > 0);
  const namedInQuestion = [...new Set([...definite, ...candidates])];

  // Snapshot policy (egress-aware):
  // - Named tickers in the question → load those (full MWS, any universe ticker).
  // - Portfolio/holdings questions (or no named ticker) → load holding snapshots.
  // - Never dump the whole MWS database.
  const snapshotTargets: string[] = [];
  if (namedInQuestion.length > 0) {
    snapshotTargets.push(...namedInQuestion);
    // If they also ask about the book, include holdings.
    if (asksPortfolio) snapshotTargets.push(...holdingTickers);
  } else {
    snapshotTargets.push(...holdingTickers);
    if (context.ticker) snapshotTargets.push(context.ticker.toUpperCase());
  }

  const uniqueOrdered = [...new Set(snapshotTargets.map((t) => t.toUpperCase()).filter(Boolean))];
  const toLoad = uniqueOrdered.slice(0, MAX_TICKERS);

  const snapshots = await fetchTickerSnapshotsBatch(adminOrUserClient, toLoad);
  const loaded: string[] = [];
  const missingDefinite: string[] = [];
  const seenCanonical = new Set<string>();

  for (const ticker of toLoad) {
    const row = snapshots.get(ticker);
    if (row) {
      const canonical = String(row.data.ticker ?? ticker).toUpperCase();
      if (seenCanonical.has(canonical)) continue;
      seenCanonical.add(canonical);
      appendTickerBlock(lines, canonical, row.table, row.data);
      loaded.push(canonical);
    } else if (definite.includes(ticker)) {
      missingDefinite.push(ticker);
    }
  }

  if (missingDefinite.length) {
    lines.push(`TICKERS NOT FOUND IN MWS UNIVERSE: ${missingDefinite.join(', ')}`);
  }

  if (context.portfolioPage) lines.push(`PORTFOLIO PAGE CONTEXT: ${context.portfolioPage}`);
  if (context.sector) lines.push(`SECTOR CONTEXT: ${context.sector}`);

  lines.push(
    'NOTES:',
    '  - Daily_* and Weekly_* are concurrent MWS timeframe analyses (EMA momentum), not calendar day/week returns.',
    '  - No prior-week Rating archive; only current Daily + Weekly snapshots.',
    '  - quadrant_position is the MWS Quadrant Analysis snapshot (21-day vs 30-week EMA). Prefer it when explaining trend state.',
    '  - User portfolio is THIS authenticated user only. MWS ticker blocks come from the same universe tables as the web app.',
    loaded.length
      ? `  - Loaded MWS snapshots for: ${loaded.join(', ')}`
      : '  - No ticker snapshots loaded.',
  );

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

export type ChatMessage = { role: string; content: string };
export type ChatModelResult =
  | { ok: true; text: string; provider: ChatProvider }
  | { ok: false; error: string; status: number; provider?: ChatProvider };

/** Active chat backends. Keep Modal separate for the own MWS-hosted model. */
export type ChatProvider = 'google_studio' | 'modal';

const DEFAULT_MODAL_BASE_URL =
  'https://adnanadilalpha--ep-mws-ai-server.us-west.modal.direct/v1';
const DEFAULT_MODAL_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash';

function isModalConfigured(): boolean {
  const id = process.env.MODAL_PROXY_TOKEN_ID?.trim();
  const secret = process.env.MODAL_PROXY_TOKEN_SECRET?.trim();
  if (id && secret) return true;
  // Legacy single-key / URL setup
  if (process.env.MODAL_CHAT_URL?.trim() && process.env.MODAL_CHAT_API_KEY?.trim()) return true;
  return false;
}

function getModalOpenAIConfig(): {
  baseURL: string;
  apiKey: string;
  model: string;
} | null {
  const id = process.env.MODAL_PROXY_TOKEN_ID?.trim();
  const secret = process.env.MODAL_PROXY_TOKEN_SECRET?.trim();
  if (id && secret) {
    return {
      baseURL: (process.env.MODAL_CHAT_BASE_URL ?? DEFAULT_MODAL_BASE_URL).trim().replace(/\/$/, ''),
      apiKey: `${id}.${secret}`,
      model: (process.env.MODAL_CHAT_MODEL ?? DEFAULT_MODAL_MODEL).trim(),
    };
  }

  // Legacy: full chat-completions URL + bearer key
  const legacyUrl = process.env.MODAL_CHAT_URL?.trim();
  const legacyKey = process.env.MODAL_CHAT_API_KEY?.trim();
  if (legacyUrl && legacyKey) {
    const baseURL = legacyUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
    return {
      baseURL: baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`,
      apiKey: legacyKey,
      model: (process.env.MODAL_CHAT_MODEL ?? DEFAULT_MODAL_MODEL).trim(),
    };
  }
  return null;
}

/**
 * Own Modal AI (DeepSeek via OpenAI-compatible Modal endpoint).
 * Uses the same `messages` (system = SYSTEM_PROMPT, user = MWS DATA + question)
 * that Google Studio receives via buildChatMessages().
 */
export async function callModalChat(messages: ChatMessage[]): Promise<ChatModelResult> {
  const cfg = getModalOpenAIConfig();
  if (!cfg) {
    return {
      ok: false,
      error:
        'Modal chat is not configured. Set MODAL_PROXY_TOKEN_ID + MODAL_PROXY_TOKEN_SECRET (or legacy MODAL_CHAT_URL + MODAL_CHAT_API_KEY).',
      status: 503,
      provider: 'modal',
    };
  }

  try {
    const client = new OpenAI({
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
    });

    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages
      .filter((m) => m.content?.trim())
      .map((m) => {
        if (m.role === 'system') return { role: 'system' as const, content: m.content };
        if (m.role === 'assistant' || m.role === 'model') {
          return { role: 'assistant' as const, content: m.content };
        }
        return { role: 'user' as const, content: m.content };
      });

    if (!openaiMessages.some((m) => m.role === 'user')) {
      return {
        ok: false,
        error: 'No user content to send to Modal',
        status: 400,
        provider: 'modal',
      };
    }

    // Non-stream for the existing JSON chat route (SSE is assembled server-side).
    // Same SYSTEM_PROMPT + MWS DATA messages as Google Studio (buildChatMessages).
    const completion = await client.chat.completions.create({
      model: cfg.model,
      messages: openaiMessages,
      temperature: 0.25,
      max_tokens: 768,
      top_p: 0.9,
      stream: false,
      // DeepSeek Modal endpoint: disable extra reasoning for deterministic MWS answers.
      reasoning_effort: 'none',
    } as OpenAI.ChatCompletionCreateParamsNonStreaming);

    const text = completion.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) {
      return { ok: false, error: 'Empty Modal model response', status: 502, provider: 'modal' };
    }
    return { ok: true, text, provider: 'modal' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Modal chat error: ${msg.slice(0, 240)}`,
      status: 502,
      provider: 'modal',
    };
  }
}

/**
 * Google AI Studio (Gemini) — free-tier testing path for real user chat UX.
 * Uses GOOGLE_STUDIO_AI_API_KEY; model defaults to a free Flash Lite variant.
 * Same SYSTEM_PROMPT / MWS DATA messages as Modal (via buildChatMessages).
 */
export async function callGoogleStudioChat(messages: ChatMessage[]): Promise<ChatModelResult> {
  const apiKey = process.env.GOOGLE_STUDIO_AI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: 'Google Studio API key is not configured (GOOGLE_STUDIO_AI_API_KEY).',
      status: 503,
      provider: 'google_studio',
    };
  }

  // Free-tier friendly default; override with GOOGLE_STUDIO_AI_MODEL if needed.
  const model =
    process.env.GOOGLE_STUDIO_AI_MODEL?.trim() || 'gemini-3.5-flash-lite';

  const systemParts = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content.trim())
    .filter(Boolean);
  const contents = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'model')
    .map((m) => ({
      role: m.role === 'assistant' || m.role === 'model' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    }));

  if (contents.length === 0) {
    return {
      ok: false,
      error: 'No user content to send to Google Studio',
      status: 400,
      provider: 'google_studio',
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: 0.25,
      maxOutputTokens: 768,
    },
  };
  if (systemParts.length > 0) {
    body.systemInstruction = { parts: [{ text: systemParts.join('\n\n') }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    const status = res.status === 429 ? 429 : res.status === 403 ? 403 : 502;
    return {
      ok: false,
      error: `Google Studio error ${res.status}: ${errBody.slice(0, 240)}`,
      status,
      provider: 'google_studio',
    };
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  };

  if (json.error?.message) {
    return {
      ok: false,
      error: `Google Studio error: ${json.error.message.slice(0, 240)}`,
      status: 502,
      provider: 'google_studio',
    };
  }

  const text =
    json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim() ?? '';

  if (!text) {
    return {
      ok: false,
      error: 'Empty Google Studio response',
      status: 502,
      provider: 'google_studio',
    };
  }
  return { ok: true, text, provider: 'google_studio' };
}

function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_STUDIO_AI_API_KEY?.trim());
}

/** Quota / rate-limit / overload — switch providers quietly. */
function isQuotaOrLimitError(result: ChatModelResult): boolean {
  if (result.ok) return false;
  const msg = result.error.toLowerCase();
  const status = result.status;
  if (status === 429 || status === 503) return true;
  return (
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests') ||
    msg.includes('exceeded') ||
    msg.includes('429') ||
    msg.includes('billing') ||
    msg.includes('limit: 0') ||
    msg.includes('free_tier')
  );
}

/**
 * Prefer Google free tier when available; own Modal model is the fallback.
 * Explicit MWS_CHAT_PROVIDER=modal|google_studio still forces one provider.
 */
function resolvePreferredProvider(): ChatProvider | null {
  const explicit = (process.env.MWS_CHAT_PROVIDER ?? '').trim().toLowerCase();
  if (explicit === 'modal') return isModalConfigured() ? 'modal' : null;
  if (explicit === 'google' || explicit === 'google_studio' || explicit === 'gemini') {
    return isGoogleConfigured() ? 'google_studio' : null;
  }
  // auto (default): Google free first, Modal own model as backup
  if (isGoogleConfigured()) return 'google_studio';
  if (isModalConfigured()) return 'modal';
  return null;
}

export function isChatModelConfigured(): boolean {
  return isGoogleConfigured() || isModalConfigured();
}

/**
 * Dispatch with silent failover:
 * 1) Google Studio (free) while quota works
 * 2) Own Modal model if Google hits limits or fails
 * User-facing route should not surface provider/limit errors when either succeeds.
 */
export async function callChatModel(messages: ChatMessage[]): Promise<ChatModelResult> {
  const preferred = resolvePreferredProvider();
  if (!preferred) {
    return {
      ok: false,
      error:
        'No chat model configured. Set GOOGLE_STUDIO_AI_API_KEY and/or MODAL_PROXY_TOKEN_ID + MODAL_PROXY_TOKEN_SECRET.',
      status: 503,
    };
  }

  // Default / auto: Google free tier first, then own Modal model.
  if (preferred === 'google_studio') {
    const google = await callGoogleStudioChat(messages);
    if (google.ok) return google;

    if (isModalConfigured()) {
      console.warn(
        '[chat] Google Studio unavailable; falling back to Modal.',
        google.status,
        isQuotaOrLimitError(google) ? '(quota/limit)' : '',
        google.error.slice(0, 160),
      );
      return callModalChat(messages);
    }
    return google;
  }

  // preferred === 'modal'
  const modal = await callModalChat(messages);
  if (modal.ok) return modal;

  if (isGoogleConfigured()) {
    console.warn(
      '[chat] Modal unavailable; falling back to Google Studio.',
      modal.status,
      modal.error.slice(0, 160),
    );
    return callGoogleStudioChat(messages);
  }
  return modal;
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
