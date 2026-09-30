import { supabase } from '@/lib/supabase-client';

export type HoldingStatus = 'open' | 'closed';

export type UserPortfolio = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  base_currency: string;
  created_at: string;
  updated_at: string;
};

export type UserPortfolioHolding = {
  id: string;
  portfolio_id: string;
  ticker: string;
  display_name: string | null;
  /** Number of shares. */
  shares: number | null;
  /** Average entry cost per share. */
  cost_basis: number | null;
  notes: string | null;
  sort_order: number;
  start_date: string | null;
  /** Derived or legacy cash invested (shares × avg when both set). */
  cash_invested: number | null;
  returns_pct: number | null;
  hit_rate: number | null;
  avg_gain: number | null;
  avg_loss: number | null;
  net_avg_return: number | null;
  cagr: number | null;
  holding_days: number | null;
  status: HoldingStatus;
  closed_at: string | null;
  exit_date: string | null;
  exit_price: number | null;
  exit_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type HoldingPerformancePatch = {
  start_date?: string | null;
  cash_invested?: number | null;
  shares?: number | null;
  cost_basis?: number | null;
  returns_pct?: number | null;
  hit_rate?: number | null;
  avg_gain?: number | null;
  avg_loss?: number | null;
  net_avg_return?: number | null;
  cagr?: number | null;
  holding_days?: number | null;
};

export type MwsOverlay = {
  ticker: string;
  daily_rating: string | null;
  daily_outlook: string | null;
  daily_trend_score: number | null;
  daily_trend_description: string | null;
  daily_performance_description: string | null;
  daily_performance_summary: string | null;
  performance_strength: string | null;
  daily_performance_strength: string | null;
  pct_from_sma50: number | null;
  pct_from_sma200: number | null;
  daily_price_vs_21ema: number | null;
  weekly_price_vs_30ema: number | null;
  daily_current_price: number | null;
  '1m_percent': number | null;
  '3m_percent': number | null;
  vs_1y_high: number | null;
  in_mws_coverage: boolean;
};

/** Price return since Start: current / start_close − 1 (lump-sum assumption). */
export type HoldingSinceStart = {
  ticker: string;
  startClose: number | null;
  currentPrice: number | null;
  sinceStartReturn: number | null;
  holdingDays: number | null;
  cagr: number | null;
};

function emptyOverlay(ticker: string): MwsOverlay {
  return {
    ticker,
    daily_rating: null,
    daily_outlook: null,
    daily_trend_score: null,
    daily_trend_description: null,
    daily_performance_description: null,
    daily_performance_summary: null,
    performance_strength: null,
    daily_performance_strength: null,
    pct_from_sma50: null,
    pct_from_sma200: null,
    daily_price_vs_21ema: null,
    weekly_price_vs_30ema: null,
    daily_current_price: null,
    '1m_percent': null,
    '3m_percent': null,
    vs_1y_high: null,
    in_mws_coverage: false,
  };
}

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function daysBetween(startIso: string, end = new Date()): number | null {
  const start = new Date(`${startIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/** cash_invested = shares × avg entry when both present. */
export function deriveCashInvested(
  shares: number | null | undefined,
  avgEntry: number | null | undefined,
): number | null {
  if (
    shares == null ||
    avgEntry == null ||
    !Number.isFinite(shares) ||
    !Number.isFinite(avgEntry) ||
    shares <= 0 ||
    avgEntry < 0
  ) {
    return null;
  }
  return shares * avgEntry;
}

/** Realized return vs avg entry when closed. */
export function computeRealizedReturn(
  avgEntry: number | null | undefined,
  exitPrice: number | null | undefined,
): number | null {
  if (
    avgEntry == null ||
    exitPrice == null ||
    !Number.isFinite(avgEntry) ||
    !Number.isFinite(exitPrice) ||
    avgEntry === 0
  ) {
    return null;
  }
  return exitPrice / avgEntry - 1;
}

export function computeSinceStartReturn(
  startClose: number | null | undefined,
  currentPrice: number | null | undefined,
  startDate: string | null | undefined,
): Pick<HoldingSinceStart, 'sinceStartReturn' | 'holdingDays' | 'cagr'> {
  const holdingDays = startDate ? daysBetween(startDate) : null;
  if (
    startClose == null ||
    currentPrice == null ||
    !Number.isFinite(startClose) ||
    !Number.isFinite(currentPrice) ||
    startClose === 0
  ) {
    return { sinceStartReturn: null, holdingDays, cagr: null };
  }
  const sinceStartReturn = currentPrice / startClose - 1;
  let cagr: number | null = null;
  if (holdingDays != null && holdingDays >= 30 && sinceStartReturn > -1) {
    cagr = Math.pow(1 + sinceStartReturn, 365 / holdingDays) - 1;
  }
  return { sinceStartReturn, holdingDays, cagr };
}

/**
 * Nearest daily close on or before each as-of date (from `price_history`).
 * Key: `${TICKER}|YYYY-MM-DD`.
 */
export async function fetchNearestDailyCloses(
  requests: Array<{ ticker: string; asOfDate: string }>,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const seen = new Set<string>();
  const jobs: Array<{ ticker: string; asOfDate: string; key: string }> = [];
  for (const r of requests) {
    const ticker = r.ticker.trim().toUpperCase();
    const asOfDate = r.asOfDate.slice(0, 10);
    if (!ticker || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) continue;
    const key = `${ticker}|${asOfDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({ ticker, asOfDate, key });
  }
  await Promise.all(
    jobs.map(async ({ ticker, asOfDate, key }) => {
      const { data, error } = await supabase
        .from('price_history')
        .select('close')
        .eq('ticker', ticker)
        .eq('interval', 'daily')
        .lte('bar_date', asOfDate)
        .order('bar_date', { ascending: false })
        .limit(1);
      if (error) throw error;
      const close = asNumber(data?.[0]?.close);
      if (close != null) map.set(key, close);
    }),
  );
  return map;
}

/** Cash-weighted book return over holdings with a computable since-start %. */
export function cashWeightedReturn(
  rows: Array<{ cash: number | null; ret: number | null }>,
): { bookReturn: number | null; counted: number; total: number } {
  let weighted = 0;
  let cashSum = 0;
  let counted = 0;
  for (const r of rows) {
    if (r.ret == null || !Number.isFinite(r.ret)) continue;
    const cash = r.cash != null && Number.isFinite(r.cash) && r.cash > 0 ? r.cash : null;
    if (cash == null) continue;
    weighted += cash * r.ret;
    cashSum += cash;
    counted += 1;
  }
  return {
    bookReturn: cashSum > 0 ? weighted / cashSum : null,
    counted,
    total: rows.length,
  };
}

function normalizeHolding(row: Record<string, unknown>): UserPortfolioHolding {
  const status = row.status === 'closed' ? 'closed' : 'open';
  return {
    ...(row as unknown as UserPortfolioHolding),
    status,
    closed_at: (row.closed_at as string | null) ?? null,
    exit_date: (row.exit_date as string | null) ?? null,
    exit_price: asNumber(row.exit_price),
    exit_notes: (row.exit_notes as string | null) ?? null,
    shares: asNumber(row.shares),
    cost_basis: asNumber(row.cost_basis),
    cash_invested: asNumber(row.cash_invested),
  };
}

export async function listUserPortfolios(): Promise<UserPortfolio[]> {
  const { data, error } = await supabase
    .from('user_portfolios')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserPortfolio[];
}

export async function createUserPortfolio(input: {
  name: string;
  description?: string;
  base_currency?: string;
}): Promise<UserPortfolio> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('user_portfolios')
    .insert({
      user_id: userId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      base_currency: input.base_currency ?? 'USD',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as UserPortfolio;
}

export async function deleteUserPortfolio(id: string): Promise<void> {
  const { error } = await supabase.from('user_portfolios').delete().eq('id', id);
  if (error) throw error;
}

export async function listHoldings(
  portfolioId: string,
  opts?: { status?: HoldingStatus | 'all' },
): Promise<UserPortfolioHolding[]> {
  const status = opts?.status ?? 'all';
  let q = supabase
    .from('user_portfolio_holdings')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('sort_order', { ascending: true })
    .order('ticker', { ascending: true });
  if (status === 'open' || status === 'closed') {
    q = q.eq('status', status);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => normalizeHolding(r as Record<string, unknown>));
}

/** Open holdings across all of the user's portfolios (deduped tickers). */
export async function listAllOpenHoldingTickers(): Promise<string[]> {
  const portfolios = await listUserPortfolios();
  if (portfolios.length === 0) return [];
  const batches = await Promise.all(
    portfolios.map((p) => listHoldings(p.id, { status: 'open' })),
  );
  const out = new Set<string>();
  for (const holdings of batches) {
    for (const h of holdings) {
      const t = h.ticker.trim().toUpperCase();
      if (t) out.add(t);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

export async function addHolding(input: {
  portfolio_id: string;
  ticker: string;
  display_name?: string;
  shares?: number | null;
  cost_basis?: number | null;
  notes?: string;
}): Promise<UserPortfolioHolding> {
  const shares = input.shares ?? null;
  const cost_basis = input.cost_basis ?? null;
  const { data, error } = await supabase
    .from('user_portfolio_holdings')
    .insert({
      portfolio_id: input.portfolio_id,
      ticker: input.ticker.trim().toUpperCase(),
      display_name: input.display_name?.trim() || null,
      shares,
      cost_basis,
      cash_invested: deriveCashInvested(shares, cost_basis),
      notes: input.notes?.trim() || null,
      status: 'open',
    })
    .select('*')
    .single();
  if (error) throw error;
  return normalizeHolding(data as Record<string, unknown>);
}

/** Insert many holdings; skips tickers that already have an open row. */
export async function addHoldingsBatch(
  portfolioId: string,
  tickers: string[],
): Promise<UserPortfolioHolding[]> {
  const wanted = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  if (wanted.length === 0) return [];

  const existing = await listHoldings(portfolioId, { status: 'all' });
  const openHeld = new Set(
    existing.filter((h) => h.status === 'open').map((h) => h.ticker.toUpperCase()),
  );
  const toInsert = wanted.filter((t) => !openHeld.has(t));
  if (toInsert.length === 0) return [];

  const openCount = existing.filter((h) => h.status === 'open').length;
  const { data, error } = await supabase
    .from('user_portfolio_holdings')
    .insert(
      toInsert.map((ticker, i) => ({
        portfolio_id: portfolioId,
        ticker,
        sort_order: openCount + i,
        status: 'open',
      })),
    )
    .select('*');
  if (error) throw error;
  return (data ?? []).map((r) => normalizeHolding(r as Record<string, unknown>));
}

/** Lightweight counts for list cards (open holdings only). */
export async function countHoldingsByPortfolio(
  portfolioIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const id of portfolioIds) map.set(id, 0);
  if (portfolioIds.length === 0) return map;

  const { data, error } = await supabase
    .from('user_portfolio_holdings')
    .select('portfolio_id, status')
    .in('portfolio_id', portfolioIds);
  if (error) throw error;
  for (const row of data ?? []) {
    if (row.status != null && row.status !== 'open') continue;
    const id = String(row.portfolio_id);
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

export async function updateHoldingPerformance(
  holdingId: string,
  patch: HoldingPerformancePatch,
): Promise<UserPortfolioHolding> {
  const payload: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  // Keep cash_invested in sync when shares / avg entry change.
  if ('shares' in patch || 'cost_basis' in patch) {
    const shares = patch.shares;
    const cost = patch.cost_basis;
    const derived = deriveCashInvested(shares ?? null, cost ?? null);
    if (derived != null) {
      payload.cash_invested = derived;
    } else if (patch.cash_invested !== undefined) {
      payload.cash_invested = patch.cash_invested;
    } else if (shares != null || cost != null) {
      // Cleared one side — only override cash if both sides provided as nulls intentionally.
      if (shares === null && cost === null) payload.cash_invested = null;
    }
  }

  const { data, error } = await supabase
    .from('user_portfolio_holdings')
    .update(payload)
    .eq('id', holdingId)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeHolding(data as Record<string, unknown>);
}

/** Batch-update performance fields for several holdings. */
export async function updateHoldingsPerformanceBatch(
  rows: Array<{ id: string } & HoldingPerformancePatch>,
): Promise<void> {
  for (const row of rows) {
    const { id, ...patch } = row;
    await updateHoldingPerformance(id, patch);
  }
}

/** Soft-close a holding into the past-positions archive. */
export async function closeHolding(
  holdingId: string,
  input: { exit_date?: string | null; exit_price?: number | null; exit_notes?: string | null },
): Promise<UserPortfolioHolding> {
  const exitDate = input.exit_date?.trim() || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('user_portfolio_holdings')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      exit_date: exitDate,
      exit_price: input.exit_price ?? null,
      exit_notes: input.exit_notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', holdingId)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeHolding(data as Record<string, unknown>);
}

export async function removeHolding(id: string): Promise<void> {
  const { error } = await supabase.from('user_portfolio_holdings').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchMwsOverlays(tickers: string[]): Promise<Map<string, MwsOverlay>> {
  const uniq = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];
  const map = new Map<string, MwsOverlay>();
  for (const t of uniq) map.set(t, emptyOverlay(t));
  if (uniq.length === 0) return map;

  const select =
    'ticker, daily_rating, daily_outlook, daily_trend_score, daily_trend_description, daily_performance_description, daily_performance_summary, performance_strength, daily_performance_strength, pct_from_sma50, pct_from_sma200, daily_price_vs_21ema, weekly_price_vs_30ema, daily_current_price, "1m_percent", daily_1m_percent, "3m_percent", daily_3m_percent, vs_1y_high, daily_vs_1y_high';
  const tables = ['market_segments', 'sectors', 'mega_caps', 'other_stocks'] as const;

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select(select).in('ticker', uniq);
    if (error) throw error;
    for (const row of data ?? []) {
      const t = String(row.ticker).toUpperCase();
      map.set(t, {
        ticker: t,
        daily_rating: row.daily_rating ?? null,
        daily_outlook: row.daily_outlook ?? null,
        daily_trend_score: asNumber(row.daily_trend_score),
        daily_trend_description: row.daily_trend_description ?? null,
        daily_performance_description: row.daily_performance_description ?? null,
        daily_performance_summary: row.daily_performance_summary ?? null,
        performance_strength: row.performance_strength ?? null,
        daily_performance_strength: row.daily_performance_strength ?? null,
        pct_from_sma50: asNumber(row.pct_from_sma50),
        pct_from_sma200: asNumber(row.pct_from_sma200),
        daily_price_vs_21ema: asNumber(row.daily_price_vs_21ema),
        weekly_price_vs_30ema: asNumber(row.weekly_price_vs_30ema),
        daily_current_price: asNumber(row.daily_current_price),
        '1m_percent': asNumber(row['1m_percent'] ?? row.daily_1m_percent),
        '3m_percent': asNumber(row['3m_percent'] ?? row.daily_3m_percent),
        vs_1y_high: asNumber(row.vs_1y_high ?? row.daily_vs_1y_high),
        in_mws_coverage: true,
      });
    }
  }
  return map;
}

export async function getUserPortfolio(id: string): Promise<UserPortfolio | null> {
  const { data, error } = await supabase.from('user_portfolios').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as UserPortfolio) ?? null;
}
