// Shared stock edge implementation (deployed via thin entrypoints:
// `update-stock-data`, `collect-stock-data`, `import-candidates-data`).
// `forcedMode` prevents cross-invocation misuse: collect/import run as isolated functions.
//
// Auth: `x-edge-secret` matching EDGE_FN_SECRET, or Authorization bearer (service role / JWT).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_ENCRYPTION_KEY, EDGE_FN_SECRET

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { decryptApiKey, hexToBytes } from './crypto.ts';
import {
  ema,
  sma,
  pctFromSma,
  pctReturn,
  distanceFrom52wHigh,
  ratingLabel,
  trendComponentScore,
  trendSignalIcon,
  trendOutlook,
  type FormulaParams,
  type RatingLabelMap,
} from './compute.ts';
import {
  FinnhubProvider,
  TwelveDataProvider,
  FmpProvider,
  AlphaVantageProvider,
  PolygonProvider,
  YahooFinanceProvider,
  type MarketDataProvider,
} from './providers.ts';

type PerformanceTemplateMap = Record<string, { label: string; description: string }>;
type TrendTemplateMap = Record<string, string>;

const TICKER_TABLES = ['market_segments', 'sectors', 'mega_caps', 'other_stocks'] as const;
type TickerTable = (typeof TICKER_TABLES)[number];

const MIN_CALL_DELAY_MS = 450;
const MAX_TICKERS_PER_RUN = 40; // lower on free plan to avoid hitting per-invocation compute/time limits
const CANDIDATES_MAX_PER_RUN = 12; // candidate imports are heavier (quote + history + optional profile)
const IMPORT_MAX_PER_RUN = 100;
const IMPORT_BATCH_SIZE = 20;
const COLLECTION_BATCH_SIZE = 20;
const RUN_BUDGET_MS = 110_000; // keep well below ~150s gateway limits on free plan
const RUN_BUDGET_RESERVE_MS = 12_000;

// Minimum candles required to produce meaningful indicators.
// Fewer than this and we still write price + what we can, but log a warning.
const MIN_DAILY_CANDLES = 64; // 3-month return + EMA-21
const MIN_WEEKLY_CANDLES = 30; // 30-week EMA

const MARKET_SEGMENT_TICKERS = new Set(['SPY', 'QQQ', 'IWM', 'TLT', 'UUP', 'GLD', 'SLV', 'IBIT', 'ETHA', 'USO']);
const SECTOR_TICKERS = new Set(['XLK', 'XLC', 'SMH', 'XLY', 'XLF', 'XLI', 'XLE', 'XLB', 'XLRE', 'XLU', 'XLV', 'XLP']);
export type StockEdgeForcedMode = 'auto' | 'collect' | 'import_candidates';

// Prod-aligned benchmark mapping for market-segment tickers.
// first = primary broad comparison, second = segment peer comparison.
const MARKET_SEGMENT_BENCHMARKS: Record<string, { first: string; second: string }> = {
  SPY: { first: 'DIA', second: 'QQQ' },
  QQQ: { first: 'SPY', second: 'DIA' },
  IWM: { first: 'SPY', second: 'QQQ' },
  TLT: { first: 'SPY', second: 'BND' },
  UUP: { first: 'SPY', second: 'TLT' },
  GLD: { first: 'SPY', second: 'SLV' },
  SLV: { first: 'SPY', second: 'GLD' },
  IBIT: { first: 'SPY', second: 'ETHA' },
  ETHA: { first: 'SPY', second: 'IBIT' },
  USO: { first: 'SPY', second: 'XLE' },
};

function edgeSelfSlug(forcedMode: StockEdgeForcedMode): string {
  if (forcedMode === 'collect') return 'collect-stock-data';
  if (forcedMode === 'import_candidates') return 'import-candidates-data';
  return 'update-stock-data';
}

const MEGA_CAP_TICKERS = new Set([
  'NVDA','MSFT','AAPL','GOOG','AMZN','META','TSLA','JPM','WMT','LLY','AVGO','CSCO','MCD','V','WFC','C','ORCL','MS','APP','MA',
  'KO','ISRG','XOM','GS','LIN','JNJ','CAT','INTC','PLTR','IBM','DIS','NFLX','MRK','QCOM','BAC','AXP','PEP','COST','LRCX','BX',
  'MU','CRM','AMGN','HD','RTX','SCHW','GE','TMO','INTU','AMD','AMAT','GEV','PG','ABT','UBER','CVX','TMUS','BA','UNH','SHOP',
]);

// Hardcoded sector ETF for every mega-cap — no API call required.
const MEGA_CAP_SECTOR_ETF: Record<string, string> = {
  // Technology → XLK
  NVDA:'XLK', MSFT:'XLK', AAPL:'XLK', AVGO:'XLK', CSCO:'XLK', ORCL:'XLK', INTC:'XLK',
  PLTR:'XLK', IBM:'XLK', QCOM:'XLK', LRCX:'XLK', MU:'XLK', CRM:'XLK', INTU:'XLK',
  AMD:'XLK', AMAT:'XLK', APP:'XLK',
  // Communication Services → XLC
  GOOG:'XLC', META:'XLC', DIS:'XLC', NFLX:'XLC', TMUS:'XLC',
  // Consumer Discretionary → XLY
  AMZN:'XLY', TSLA:'XLY', HD:'XLY', MCD:'XLP', COST:'XLP', UBER:'XLY', SHOP:'XLY',
  // Consumer Staples → XLP
  WMT:'XLP', KO:'XLP', PEP:'XLP', PG:'XLP',
  // Financials → XLF
  JPM:'XLF', V:'XLF', MA:'XLF', WFC:'XLF', C:'XLF', GS:'XLF', MS:'XLF',
  BAC:'XLF', AXP:'XLF', SCHW:'XLF', BX:'XLF',
  // Healthcare → XLV
  LLY:'XLV', UNH:'XLV', JNJ:'XLV', ISRG:'XLV', MRK:'XLV', AMGN:'XLV', TMO:'XLV', ABT:'XLV',
  // Industrials → XLI
  CAT:'XLI', GE:'XLI', RTX:'XLI', BA:'XLI', GEV:'XLI',
  // Materials → XLB
  LIN:'XLB',
  // Energy → XLE
  XOM:'XLE', CVX:'XLE',
};

const SECTOR_ETF_NAMES: Record<string, string> = {
  SPY: '$SPY (S&P500)',
  QQQ: '$QQQ (Nasdaq)',
  DIA: '$DIA (Dow Jones)',
  BND: '$BND (Bonds)',
  IBIT: '$IBIT (Bitcoin)',
  ETHA: '$ETHA (Ehtereum)',
  GLD: '$GLD (Gold)',
  SLV: '$SLV (Silver)',
  TLT: '$TLT (Treasuries)',
  XLK: '$XLK (Technology)',
  XLC: '$XLC (Communication Services)',
  XLY: '$XLY (Consumer Discretionary)',
  XLP: '$XLP (Consumer Staples)',
  XLF: '$XLF (Financials)',
  XLV: '$XLV (Healthcare)',
  XLI: '$XLI (Industrials)',
  XLB: '$XLB (Materials)',
  XLE: '$XLE (Energy)',
  XLRE: '$XLRE (Real Estate)',
  XLU: '$XLU (Utilities)',
  SMH: '$SMH (Semiconductors)',
};

const TREND_SIGNAL_THRESHOLDS = {
  weekly: { short: 0.01, long: 0.02, cross: 0.015, slopeShort: 0.01, slopeLong: 0.01 },
  daily: { short: 0.01, long: 0.01, cross: 0.005, slopeShort: 0.01, slopeLong: 0.01 },
} as const;

// Map Finnhub industry strings to sector ETF tickers.
const INDUSTRY_TO_SECTOR_ETF: Record<string, string> = {
  'Technology': 'XLK',
  'Semiconductors': 'SMH',
  'Software—Application': 'XLK',
  'Software—Infrastructure': 'XLK',
  'Internet Content & Information': 'XLC',
  'Communication Services': 'XLC',
  'Media—Diversified': 'XLC',
  'Entertainment': 'XLC',
  'Telecom Services': 'XLC',
  'Financial Services': 'XLF',
  'Banks—Regional': 'XLF',
  'Banks—Diversified': 'XLF',
  'Asset Management': 'XLF',
  'Insurance—Diversified': 'XLF',
  'Insurance—Life': 'XLF',
  'Capital Markets': 'XLF',
  'Healthcare': 'XLV',
  'Biotechnology': 'XLV',
  'Drug Manufacturers—General': 'XLV',
  'Drug Manufacturers—Specialty & Generic': 'XLV',
  'Medical Devices': 'XLV',
  'Medical Instruments & Supplies': 'XLV',
  'Healthcare Plans': 'XLV',
  'Consumer Cyclical': 'XLY',
  'Retail—Apparel': 'XLY',
  'Retail—Specialty': 'XLY',
  'Auto Manufacturers': 'XLY',
  'Auto Parts': 'XLY',
  'Restaurants': 'XLY',
  'Lodging': 'XLY',
  'Consumer Defensive': 'XLP',
  'Consumer Staples': 'XLP',
  'Packaged Foods': 'XLP',
  'Packaged Foods & Meats': 'XLP',
  'Beverages—Non-Alcoholic': 'XLP',
  'Household & Personal Products': 'XLP',
  'Food Distribution': 'XLP',
  'Grocery Stores': 'XLP',
  'Discount Stores': 'XLP',
  'Consumer Discretionary': 'XLY',
  'Financials': 'XLF',
  'Health Care': 'XLV',
  'Information Technology': 'XLK',
  'Materials': 'XLB',
  'Energy': 'XLE',
  'Oil & Gas E&P': 'XLE',
  'Oil & Gas Integrated': 'XLE',
  'Oil & Gas Refining & Marketing': 'XLE',
  'Industrials': 'XLI',
  'Aerospace & Defense': 'XLI',
  'Airlines': 'XLI',
  'Farm & Heavy Construction Machinery': 'XLI',
  'Industrial Distribution': 'XLI',
  'Electrical Equipment & Parts': 'XLI',
  'Basic Materials': 'XLB',
  'Chemicals': 'XLB',
  'Specialty Chemicals': 'XLB',
  'Real Estate': 'XLRE',
  'REIT—Diversified': 'XLRE',
  'REIT—Industrial': 'XLRE',
  'REIT—Office': 'XLRE',
  'REIT—Residential': 'XLRE',
  'Utilities—Regulated Electric': 'XLU',
  'Utilities—Renewable': 'XLU',
  'Utilities—Diversified': 'XLU',
};

// --------------------------------------------------------------------------
// Benchmark snapshot — pre-fetched once per run, reused for every ticker.
// --------------------------------------------------------------------------
type BenchmarkSnapshot = {
  ticker: string;
  name: string;
  ret1m: number | null; // decimal, e.g. 0.05 = +5 %
  ret3m: number | null;
};

type BenchmarkSnapshots = {
  spy: BenchmarkSnapshot;
  qqq: BenchmarkSnapshot;
  byTicker: Record<string, BenchmarkSnapshot>;
};

export function startStockDataEdge(forcedMode: StockEdgeForcedMode = 'auto') {
  Deno.serve(async (req) => {
  const started = Date.now();
  let importMode = false;
  let importFromCandidatesMode = false;
  let importLimit = MAX_TICKERS_PER_RUN;
  let runLogId: number | null = null;
  // Session timestamp: set on first run, passed through every chained batch.
  // Only tickers with updated_at < sessionStartedAt are eligible for this session,
  // ensuring the chain stops naturally once all stale tickers are refreshed.
  let sessionStartedAt: string = new Date().toISOString();
  let targetTickers: string[] | null = null;

  // --- Auth -----------------------------------------------------------------
  const secret = Deno.env.get('EDGE_FN_SECRET');
  const provided = req.headers.get('x-edge-secret');
  const authHeader = req.headers.get('authorization') ?? '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const hasSecretAuth = Boolean(secret) && provided === secret;
  const hasBearerAuth = bearer.length > 20;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const masterKey = Deno.env.get('APP_ENCRYPTION_KEY');
  if (!masterKey) {
    return new Response(JSON.stringify({ error: 'APP_ENCRYPTION_KEY missing.' }), { status: 500 });
  }
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  if (!hasSecretAuth && !hasBearerAuth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let triggeredBy = hasBearerAuth ? 'admin' : 'cron';
  let preferredProvider: string | null = null;
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    if (typeof (body as { triggered_by?: unknown }).triggered_by === 'string') {
      triggeredBy = String((body as { triggered_by: string }).triggered_by).slice(0, 64);
    }
    importMode = Boolean((body as { import_universe?: unknown }).import_universe);
    if (typeof (body as { import_limit?: unknown }).import_limit === 'number') {
      const v = Math.floor((body as { import_limit: number }).import_limit);
      if (Number.isFinite(v) && v >= 1 && v <= IMPORT_MAX_PER_RUN) importLimit = v;
    }
    if (typeof (body as { run_log_id?: unknown }).run_log_id === 'number') {
      const raw = Number((body as { run_log_id: number }).run_log_id);
      if (Number.isFinite(raw) && raw > 0) runLogId = Math.floor(raw);
    }
    if (typeof (body as { preferred_provider?: unknown }).preferred_provider === 'string') {
      const p = String((body as { preferred_provider: string }).preferred_provider).trim().toLowerCase();
      if (p) preferredProvider = p;
    }
    if (typeof (body as { session_started_at?: unknown }).session_started_at === 'string') {
      const v = String((body as { session_started_at: string }).session_started_at).trim();
      if (v) sessionStartedAt = v;
    }
    importFromCandidatesMode = Boolean((body as { import_from_candidates?: unknown }).import_from_candidates);
    if (Array.isArray((body as { target_tickers?: unknown }).target_tickers)) {
      const raw = (body as { target_tickers: unknown[] }).target_tickers;
      const parsed = raw
        .filter((t) => typeof t === 'string' && (t as string).length > 0)
        .slice(0, 20)
        .map((t) => String(t).toUpperCase().trim())
        .filter(Boolean);
      if (parsed.length > 0) targetTickers = parsed;
    }
  } catch { /* no body is fine */ }

  if (forcedMode === 'collect') {
    importFromCandidatesMode = false;
  } else if (forcedMode === 'import_candidates') {
    importFromCandidatesMode = true;
    importMode = false;
  }

  // --- Load providers -------------------------------------------------------
  const providers: MarketDataProvider[] = [];
  let decryptFailures = 0;
  const { data: keys } = await db
    .from('api_keys')
    .select('provider, key_ciphertext, key_iv, key_auth_tag, is_active')
    .eq('is_active', true);

  for (const row of keys ?? []) {
    try {
      const ciphertext = coerceBytes(row.key_ciphertext);
      const iv = coerceBytes(row.key_iv);
      const tag = coerceBytes(row.key_auth_tag);
      const raw = await decryptApiKey(ciphertext, iv, tag, masterKey);
      if (row.provider === 'finnhub') providers.push(new FinnhubProvider(raw));
      else if (row.provider === 'twelve_data') providers.push(new TwelveDataProvider(raw));
      else if (row.provider === 'fmp') providers.push(new FmpProvider(raw));
      else if (row.provider === 'alpha_vantage') providers.push(new AlphaVantageProvider(raw));
      else if (row.provider === 'polygon') providers.push(new PolygonProvider(raw));
      else if (row.provider === 'yahoo') providers.push(new YahooFinanceProvider(raw));
    } catch (e) {
      decryptFailures += 1;
      console.error('[providers] key decrypt failed for', row.provider, e);
    }
  }

  if (providers.length === 0) {
    const activeCount = keys?.length ?? 0;
    const reason =
      activeCount === 0
        ? 'No active API keys configured.'
        : decryptFailures > 0
          ? `Active API keys found but failed to decrypt (${decryptFailures}/${activeCount}). Check APP_ENCRYPTION_KEY in edge secrets.`
          : 'No usable API providers available.';
    await logRun(db, { provider: 'none', status: 'error', error: reason, triggeredBy, durationMs: Date.now() - started });
    return new Response(JSON.stringify({ error: reason }), { status: 400 });
  }

  const { data: cfg } = await db.from('admin_api_config').select('preferred_provider,rate_limit_rpm').eq('id', 1).maybeSingle();
  if (!preferredProvider) {
    preferredProvider = typeof cfg?.preferred_provider === 'string' ? cfg.preferred_provider.toLowerCase() : null;
  }
  const callDelayMs = resolveCallDelayMs(typeof cfg?.rate_limit_rpm === 'number' ? cfg.rate_limit_rpm : null);
  const sortedProviders = [...providers].sort((a, b) => {
    if (preferredProvider && a.name === preferredProvider) return -1;
    if (preferredProvider && b.name === preferredProvider) return 1;
    if (a.name === 'finnhub') return -1;
    if (b.name === 'finnhub') return 1;
    return 0;
  });
  const primary = sortedProviders[0];
  const mode: 'collect' | 'import' = importMode ? 'import' : 'collect';

  // --- Load formula params --------------------------------------------------
  const params = await loadParams(db);
  if (!params) {
    await logRun(db, { provider: primary.name, status: 'error', error: 'Formula settings missing.', triggeredBy, durationMs: Date.now() - started });
    return new Response(JSON.stringify({ error: 'Formula settings missing.' }), { status: 500 });
  }
  const ratingLabels = await loadRatingLabels(db);
  const performanceLabels = await loadPerformanceLabels(db);
  const trendTemplates = await loadTrendTemplates(db);

  // --- Pre-fetch benchmark snapshots (once per run, reused per ticker) ------
  // These two calls happen before the main collection loop so every ticker
  // gets real SPY / QQQ return data for comparison instead of static text.
  const benchmarks = await loadBenchmarkSnapshots(sortedProviders, callDelayMs);
  console.info('[benchmarks]', {
    spy: { ret1m: benchmarks.spy.ret1m, ret3m: benchmarks.spy.ret3m },
    qqq: { ret1m: benchmarks.qqq.ret1m, ret3m: benchmarks.qqq.ret3m },
  });

  let imported = 0;
  let skipped = 0;
  let importFailed = 0;
  let importEnriched = 0;

  // --- Import from candidates (Excel list) —————————————————————————————————
  if (importFromCandidatesMode) {
    let candImported = 0, candFailed = 0, candSkipped = 0, hadMore = false;
    try {
      const result = await importFromCandidates(db, sortedProviders, params, ratingLabels, performanceLabels, trendTemplates, benchmarks, callDelayMs, {
        runLogId, startedAt: started, triggeredBy, providerName: primary.name,
      });
      candImported = result.imported;
      candFailed = result.failed;
      candSkipped = result.skipped;
      hadMore = result.hadMore;
    } catch (e) {
      await logRun(db, {
        runLogId,
        provider: primary.name,
        status: 'error',
        error: `Candidates import failed: ${e instanceof Error ? e.message : String(e)}`,
        triggeredBy,
        durationMs: Date.now() - started,
      });
      return new Response(JSON.stringify({ error: 'Candidates import failed.' }), { status: 500 });
    }
    const status: 'ok' | 'partial' | 'error' = candFailed === 0 ? 'ok' : candImported === 0 ? 'error' : 'partial';
    if (hadMore) {
      // Keep __progress__ on the same row (do not call logRun here). Do not set `duration_ms`:
      // live runs use `duration_ms: null` from `updateRunProgress`; setting it here made the
      // admin UI treat the job as stuck when the chained request never ran.
      await db
        .from('api_health_log')
        .update({
          provider: primary.name,
          status: 'partial',
          triggered_by: triggeredBy,
          tickers_updated: candImported,
          tickers_failed: candFailed,
        })
        .eq('id', runLogId ?? -1);
      const selfUrl = `${supabaseUrl}/functions/v1/${edgeSelfSlug(forcedMode)}`;
      const chainPromise = fetch(selfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { 'x-edge-secret': secret } : {}),
        },
        body: JSON.stringify({
          triggered_by: 'chain',
          import_from_candidates: true,
          run_log_id: runLogId ?? undefined,
        }),
      })
        .then(async (res) => {
          if (res?.ok) return;
          if (!runLogId) return;
          const detail = res
            ? `${res.status} ${(await res.text().catch(() => '')).slice(0, 400)}`.trim()
            : 'no response';
          await logRun(db, {
            runLogId,
            provider: primary.name,
            status: 'error',
            error: `Chained import failed to start: ${detail || 'unknown'}`.slice(0, 900),
            triggeredBy,
            durationMs: Date.now() - started,
            tickersUpdated: candImported,
            tickersFailed: candFailed,
          });
        })
        .catch(async (e) => {
          if (!runLogId) return;
          console.warn('[chain] candidates self-invoke failed', e);
          await logRun(db, {
            runLogId,
            provider: primary.name,
            status: 'error',
            error: `Chained import request failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 900),
            triggeredBy,
            durationMs: Date.now() - started,
            tickersUpdated: candImported,
            tickersFailed: candFailed,
          });
        });
      try {
        // @ts-ignore – Supabase Deno runtime global
        EdgeRuntime.waitUntil(chainPromise);
      } catch { /* fire-and-forget */ }
      console.info('[chain] more candidates remain, next batch triggered');
    } else {
      await logRun(db, {
        runLogId,
        provider: primary.name,
        status,
        error: candFailed > 0 ? `failed=${candFailed},skipped=${candSkipped}` : null,
        triggeredBy,
        durationMs: Date.now() - started,
        tickersUpdated: candImported,
        tickersFailed: candFailed,
      });
      await notifyAdminTickerSessionComplete(db, {
        kind: 'candidates_import',
        provider: primary.name,
        status,
        triggeredBy,
        durationMs: Date.now() - started,
        tickersUpdated: candImported,
        tickersFailed: candFailed,
        imported: candImported,
        skipped: candSkipped,
        diagSummary: candFailed > 0 ? `failed=${candFailed}, skipped=${candSkipped}` : null,
      });
      console.info('[chain] candidates import session complete');
    }
    return new Response(
      JSON.stringify({ status, imported: candImported, failed: candFailed, skipped: candSkipped, durationMs: Date.now() - started, chaining: hadMore }),
      { headers: { 'content-type': 'application/json' } }
    );
  }

  if (importMode) {
    try {
      const catalog = await importTickerUniverse(db, sortedProviders, params, ratingLabels, performanceLabels, trendTemplates, benchmarks, importLimit, callDelayMs, {
        runLogId,
        startedAt: started,
        mode,
      });
      imported = catalog.imported;
      skipped = catalog.skipped;
      importFailed = catalog.failed;
      importEnriched = catalog.enriched;
    } catch (e) {
      await logRun(db, {
        provider: primary.name,
        status: 'error',
        error: `Universe import failed: ${e instanceof Error ? e.message : String(e)}`,
        triggeredBy,
        durationMs: Date.now() - started,
      });
      return new Response(JSON.stringify({ error: 'Universe import failed.' }), { status: 500 });
    }
  }

  // --- Load tickers ---------------------------------------------------------
  type Row = { id: string; ticker: string; updated_at?: string | null; sector_etf?: string | null };
  const tickers: { table: TickerTable; rows: Row[] }[] = [];
  let totalLoaded = 0;

  if (targetTickers && targetTickers.length > 0) {
    // Targeted update: look up only the specified tickers across all tables
    console.info('[load-tickers] targeted mode', { tickers: targetTickers });
    for (const table of TICKER_TABLES) {
      const selectCols =
        table === 'mega_caps' || table === 'other_stocks'
          ? 'id, ticker, updated_at, sector_etf'
          : 'id, ticker, updated_at';
      const { data, error } = await db
        .from(table)
        .select(selectCols)
        .in('ticker', targetTickers);
      if (error) { console.error('[load-tickers] failed for', table, error.message); continue; }
      const rows = (data ?? []).filter((r) => typeof r.ticker === 'string' && r.ticker.length > 0) as Row[];
      if (rows.length > 0) tickers.push({ table, rows });
      totalLoaded += rows.length;
    }
  } else {
    for (const table of TICKER_TABLES) {
      if (totalLoaded >= MAX_TICKERS_PER_RUN) break;
      const remaining = MAX_TICKERS_PER_RUN - totalLoaded;
      const selectCols =
        table === 'mega_caps' || table === 'other_stocks'
          ? 'id, ticker, updated_at, sector_etf'
          : 'id, ticker, updated_at';
      const { data, error } = await db
        .from(table)
        .select(selectCols)
        .lt('updated_at', sessionStartedAt)
        .order('updated_at', { ascending: true })
        .limit(remaining);
      if (error) {
        console.error('[load-tickers] failed for', table, error.message);
        continue;
      }
      const rows = (data ?? []).filter((r) => typeof r.ticker === 'string' && r.ticker.length > 0) as Row[];
      totalLoaded += rows.length;
      tickers.push({ table, rows });
    }
  }
  await updateRunProgress(db, {
    runLogId,
    mode,
    provider: primary.name,
    triggeredBy,
    startedAt: started,
    done: 0,
    total: totalLoaded,
    updated: importEnriched,
    failed: importFailed,
    imported,
    skipped,
    phase: 'collection-started',
  });

  let updated = 0;
  let failed = 0;
  let missingHistory = 0;
  let fallbackUsed = 0;
  let stoppedForBudget = false;
  const errors: string[] = [];
  updated += importEnriched;
  failed += importFailed;
  let processed = 0;

  collect_loop:
  for (const bucket of tickers) {
    for (let i = 0; i < bucket.rows.length; i += COLLECTION_BATCH_SIZE) {
      const rows = bucket.rows.slice(i, i + COLLECTION_BATCH_SIZE);
      for (const row of rows) {
        if (shouldStopForBudget(started)) {
          stoppedForBudget = true;
          console.warn('[collect] budget reached, stopping early to chain safely', {
            processed,
            totalLoaded,
            elapsedMs: Date.now() - started,
          });
          break collect_loop;
        }
        try {
          console.info('[collect:start]', { table: bucket.table, ticker: row.ticker });
          const result = await fetchTickerWithFallback(sortedProviders, row.ticker, callDelayMs);
          if (!result) {
            failed += 1;
            errors.push(`${bucket.table}/${row.ticker}: quote_unavailable`);
            console.warn('[collect:fail] QUOTE_UNAVAILABLE', { table: bucket.table, ticker: row.ticker });
            processed += 1;
            continue;
          }
          if (!result.history) {
            missingHistory += 1;
            console.warn('[collect] no history', {
              table: bucket.table,
              ticker: row.ticker,
              quoteProvider: result.quoteProvider,
            });
          } else {
            // Guard: log when history is thin so you can diagnose sparse tickers.
            const dLen = result.history.dailyCloses.length;
            const wLen = result.history.weeklyCloses.length;
            if (dLen < MIN_DAILY_CANDLES) {
              console.warn('[collect] thin daily history', { ticker: row.ticker, daily: dLen, needed: MIN_DAILY_CANDLES });
            }
            if (wLen < MIN_WEEKLY_CANDLES) {
              console.warn('[collect] thin weekly history', { ticker: row.ticker, weekly: wLen, needed: MIN_WEEKLY_CANDLES });
            }
          }
          if (result.quoteProvider !== result.historyProvider && result.historyProvider) {
            fallbackUsed += 1;
          }
          const rowSectorEtf =
            typeof row.sector_etf === 'string' && row.sector_etf.trim()
              ? row.sector_etf.trim().toUpperCase()
              : null;
          const patch = buildUpdatePatch(
            result,
            params,
            ratingLabels,
            performanceLabels,
            trendTemplates,
            benchmarks,
            bucket.table,
            row.ticker,
            rowSectorEtf,
          );
          // Keep sector_etf current for mega_caps on every collect cycle (hardcoded, no extra API call).
          if (bucket.table === 'mega_caps') {
            const etf = MEGA_CAP_SECTOR_ETF[row.ticker];
            if (etf) (patch as Record<string, unknown>).sector_etf = etf;
          }
          const { error: upErr } = await db.from(bucket.table).update(patch).eq('id', row.id);
          if (upErr) {
            failed += 1;
            errors.push(`${bucket.table}/${row.ticker}: ${upErr.message}`);
          } else {
            updated += 1;
            if (result.history) {
              await upsertPriceHistory(db, row.ticker, result.history);
            }
          }
          // Detailed per-ticker log so you can see exactly what was fetched and computed.
          console.info('[collect]', {
            table: bucket.table,
            ticker: row.ticker,
            quoteProvider: result.quoteProvider,
            historyProvider: result.historyProvider ?? null,
            price: result.quote.currentPrice,
            dailyCandles: result.history?.dailyCloses.length ?? 0,
            weeklyCandles: result.history?.weeklyCloses.length ?? 0,
            high52w: result.history?.high52w ?? null,
            ret1m: typeof patch.daily_1m_percent === 'number' ? Number(patch.daily_1m_percent.toFixed(4)) : null,
            ret3m: typeof patch.daily_3m_percent === 'number' ? Number(patch.daily_3m_percent.toFixed(4)) : null,
            vs1yHigh: typeof patch.daily_vs_1y_high === 'number' ? Number(patch.daily_vs_1y_high.toFixed(4)) : null,
            dailyScore: patch.daily_trend_score ?? null,
            dailyRating: patch.daily_rating ?? null,
            weeklyScore: patch.weekly_trend_score ?? null,
            weeklyRating: patch.weekly_rating ?? null,
            spyComparison: patch.daily_vs_spy_comparison ?? null,
            qqqComparison: patch.daily_vs_benchmark_comparison ?? null,
            dbWriteOk: !upErr,
          });
        } catch (e) {
          failed += 1;
          errors.push(`${bucket.table}/${row.ticker}: ${e instanceof Error ? e.message : String(e)}`);
        }
        processed += 1;
        await sleep(callDelayMs);
      }
      await updateRunProgress(db, {
        runLogId,
        mode,
        provider: primary.name,
        triggeredBy,
        startedAt: started,
        done: processed,
        total: totalLoaded,
        updated,
        failed,
        imported,
        skipped,
        phase: `collecting-${bucket.table}`,
      });
    }
  }

  const status: 'ok' | 'partial' | 'error' = failed === 0 ? 'ok' : updated === 0 ? 'error' : 'partial';
  const runDiag =
    [
      `diag:missing_history=${missingHistory},fallback_used=${fallbackUsed},stopped_for_budget=${stoppedForBudget ? 1 : 0}`,
      errors.slice(0, 3).join(' | ') || null,
      importMode ? `imported=${imported},skipped=${skipped}` : null,
    ]
      .filter(Boolean)
      .join(' | ') || null;
  await logRun(db, {
    runLogId,
    provider: primary.name,
    status,
    error: runDiag,
    triggeredBy,
    durationMs: Date.now() - started,
    tickersUpdated: updated,
    tickersFailed: failed,
  });

  // --- Self-chain if more stale tickers remain in this session ---------------
  // A full batch (totalLoaded === MAX_TICKERS_PER_RUN) means there may be more.
  // Pass session_started_at so the next batch uses the same staleness cutoff
  // and the chain stops automatically when all stale tickers are processed.
  const willChain = !targetTickers && (stoppedForBudget || totalLoaded >= MAX_TICKERS_PER_RUN);
  if (!willChain) {
    await notifyAdminTickerSessionComplete(db, {
      kind: 'collect_session',
      provider: primary.name,
      status,
      triggeredBy,
      durationMs: Date.now() - started,
      tickersUpdated: updated,
      tickersFailed: failed,
      imported: importMode ? imported : undefined,
      skipped: importMode ? skipped : undefined,
      importMode,
      diagSummary: runDiag,
    });
  }
  if (willChain) {
    const selfUrl = `${supabaseUrl}/functions/v1/${edgeSelfSlug(forcedMode)}`;
    const chainFetch = fetch(selfUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'x-edge-secret': secret } : {}),
      },
      body: JSON.stringify({
        triggered_by: 'chain',
        session_started_at: sessionStartedAt,
        run_log_id: runLogId ?? undefined,
      }),
    }).catch((e) => console.warn('[chain] self-invoke failed', e));
    // Keep the process alive long enough for the HTTP request to be dispatched.
    try {
      // @ts-ignore – Supabase Deno runtime global
      EdgeRuntime.waitUntil(chainFetch);
    } catch {
      // Fallback: fire-and-forget (request is still sent at network level)
    }
    console.info('[chain] next batch triggered', { sessionStartedAt, triggeredBy });
  } else {
    console.info('[chain] session complete — all stale tickers processed', { sessionStartedAt, triggeredBy });
  }

  return new Response(
    JSON.stringify({ status, updated, failed, imported, skipped, durationMs: Date.now() - started, chaining: willChain, sessionStartedAt }),
    { headers: { 'content-type': 'application/json' } }
  );
  });
}

// -----------------------------------------------------------------------------
// Formula params + labels
// -----------------------------------------------------------------------------
async function loadParams(db: ReturnType<typeof createClient>): Promise<FormulaParams | null> {
  const { data, error } = await db.from('formula_settings').select('key, value');
  if (error || !data) return null;
  const map: Record<string, number> = {};
  for (const row of data) map[(row as { key: string }).key] = Number((row as { value: number }).value);
  const keys: (keyof FormulaParams)[] = [
    'weight_1m_return','weight_3m_return','weight_vs_1y_high','weight_vs_9ema','weight_vs_30ema',
    'threshold_1m_bull','threshold_1m_bear','threshold_3m_bull','threshold_3m_bear','threshold_1yh_strong','threshold_1yh_weak',
    'ema_weekly_short','ema_weekly_long','ema_daily_short','ema_daily_long',
    'score_strong','score_mixed_high','score_mixed_low','score_weak',
    'extended_threshold','benchmark_leading','benchmark_lagging',
  ];
  for (const k of keys) if (!(k in map)) return null;
  return map as unknown as FormulaParams;
}

async function loadRatingLabels(db: ReturnType<typeof createClient>): Promise<Partial<RatingLabelMap>> {
  const { data } = await db.from('formula_rating_labels').select('tier,label');
  const out: Partial<RatingLabelMap> = {};
  for (const row of data ?? []) {
    const t = (row as { tier: string }).tier;
    const l = (row as { label: string }).label;
    if (t === 'strong_bull' || t === 'bull' || t === 'neutral' || t === 'bear' || t === 'strong_bear') {
      out[t] = l;
    }
  }
  return out;
}

async function loadPerformanceLabels(db: ReturnType<typeof createClient>): Promise<PerformanceTemplateMap> {
  const out: PerformanceTemplateMap = {};
  const { data, error } = await db
    .from('formula_performance_templates')
    .select('strength,distance_to_highs,benchmark_relation,label,description');
  if (!error) {
    for (const row of data ?? []) {
      const strength = String((row as { strength: string }).strength ?? '').trim();
      const distance = String((row as { distance_to_highs: string }).distance_to_highs ?? '').trim();
      const relation = String((row as { benchmark_relation: string }).benchmark_relation ?? '').trim();
      const key = `${strength}|${distance}|${relation}`;
      out[key] = {
        label: String((row as { label: string }).label ?? '').trim() || `${strength} performer`,
        description: String((row as { description: string }).description ?? '').trim(),
      };
    }
  }
  return out;
}

async function loadTrendTemplates(db: ReturnType<typeof createClient>): Promise<TrendTemplateMap> {
  const out: TrendTemplateMap = {};
  const { data } = await db.from('formula_trend_templates').select('tier,outlook,timeframe,description');
  for (const row of data ?? []) {
    const tier = String((row as { tier: string }).tier ?? '').trim();
    const outlook = String((row as { outlook: string }).outlook ?? '').trim();
    const timeframe = String((row as { timeframe: string }).timeframe ?? '').trim();
    const description = String((row as { description: string }).description ?? '').trim();
    if (!tier || !outlook || !timeframe) continue;
    out[`${tier}|${outlook}|${timeframe}`] = description;
  }
  return out;
}

// -----------------------------------------------------------------------------
// Benchmark snapshots
// -----------------------------------------------------------------------------

/**
 * Pre-fetch SPY and QQQ return data once per run.
 * All tickers use these values to build real comparison strings and populate
 * the benchmark percentage columns in the DB instead of static placeholders.
 */
async function loadBenchmarkSnapshots(
  providers: MarketDataProvider[],
  callDelayMs: number
): Promise<BenchmarkSnapshots> {
  const fetchOne = async (ticker: string, name: string): Promise<BenchmarkSnapshot> => {
    try {
      const result = await fetchTickerWithFallback(providers, ticker, callDelayMs);
      if (!result?.history) {
        console.warn('[benchmarks] history unavailable for', ticker);
        return { ticker, name, ret1m: null, ret3m: null };
      }
      const daily = result.history.dailyCloses;
      const now = result.quote.currentPrice;
      const d21 = daily.length >= 22 ? daily[daily.length - 22] : null;
      const d63 = daily.length >= 64 ? daily[daily.length - 64] : null;
      const ret1m = d21 !== null ? pctReturn(now, d21) : null;
      const ret3m = d63 !== null ? pctReturn(now, d63) : null;
      return { ticker, name, ret1m, ret3m };
    } catch (e) {
      console.warn('[benchmarks] failed to load', ticker, (e as Error).message);
      return { ticker, name, ret1m: null, ret3m: null };
    }
  };

  const toName = (ticker: string): string => SECTOR_ETF_NAMES[ticker] ?? `$${ticker}`;
  const tickers = Array.from(new Set([
    'SPY',
    'QQQ',
    'DIA',
    'BND',
    ...Object.values(MARKET_SEGMENT_BENCHMARKS).flatMap((v) => [v.first, v.second]),
    ...Object.values(MEGA_CAP_SECTOR_ETF),
    ...SECTOR_TICKERS,
  ]));
  const byTicker: Record<string, BenchmarkSnapshot> = {};
  for (const ticker of tickers) {
    byTicker[ticker] = await fetchOne(ticker, toName(ticker));
    await sleep(callDelayMs);
  }
  return {
    spy: byTicker.SPY ?? { ticker: 'SPY', name: '$SPY (S&P500)', ret1m: null, ret3m: null },
    qqq: byTicker.QQQ ?? { ticker: 'QQQ', name: '$QQQ (Nasdaq)', ret1m: null, ret3m: null },
    byTicker,
  };
}

// -----------------------------------------------------------------------------
// Provider fetch with independent quote + history fallback
// -----------------------------------------------------------------------------
type TickerFetchResult = {
  quoteProvider: string;
  historyProvider: string | null;
  quote: { currentPrice: number; fetchedAt: string };
  history: { dailyCloses: number[]; weeklyCloses: number[]; high52w: number; volume: number | null } | null;
};

async function fetchTickerWithFallback(
  providers: MarketDataProvider[],
  ticker: string,
  callDelayMs: number,
): Promise<TickerFetchResult | null> {
  let quoteProvider: string | null = null;
  let quote: { currentPrice: number; fetchedAt: string } | null = null;
  const providerErrors: string[] = [];

  // Step 1: resolve quote from the first provider that responds.
  for (const p of providers) {
    try {
      const maybeQuote = await p.getQuote(ticker);
      if (!maybeQuote) {
        providerErrors.push(`${p.name}:quote_none`);
        continue;
      }
      quoteProvider = p.name;
      quote = maybeQuote;
      break;
    } catch (e) {
      providerErrors.push(`${p.name}:quote_error:${e instanceof Error ? e.message : String(e)}`);
      console.error('[fetch] quote error', p.name, ticker, e);
    }
  }

  if (!quote || !quoteProvider) {
    if (providerErrors.length > 0) {
      console.warn('[fetch] quote failed', { ticker, details: providerErrors.slice(0, 4) });
    }
    return null;
  }

  // Rate-limit gap between quote and history — both count against the same per-minute limit.
  await sleep(callDelayMs);

  // Step 2: resolve history — try the quote provider first, then fall back.
  const historyOrder = [
    ...providers.filter((p) => p.name === quoteProvider),
    ...providers.filter((p) => p.name !== quoteProvider),
  ];
  let historyProvider: string | null = null;
  let history: TickerFetchResult['history'] = null;

  for (const p of historyOrder) {
    try {
      const maybeHistory = await p.getHistory(ticker);
      if (!maybeHistory) {
        providerErrors.push(`${p.name}:history_none`);
        continue;
      }
      historyProvider = p.name;
      history = maybeHistory;
      break;
    } catch (e) {
      providerErrors.push(`${p.name}:history_error:${e instanceof Error ? e.message : String(e)}`);
      console.error('[fetch] history error', p.name, ticker, e);
    }
  }

  if (!history && providerErrors.length > 0) {
    console.warn('[fetch] history missing', {
      ticker,
      quoteProvider,
      details: providerErrors.slice(0, 6),
    });
  }

  return { quoteProvider, historyProvider, quote, history };
}

// -----------------------------------------------------------------------------
// Import universe
// -----------------------------------------------------------------------------
async function importTickerUniverse(
  db: ReturnType<typeof createClient>,
  providers: MarketDataProvider[],
  params: FormulaParams,
  ratingLabels: Partial<RatingLabelMap>,
  performanceLabels: PerformanceTemplateMap,
  trendTemplates: TrendTemplateMap,
  benchmarks: BenchmarkSnapshots,
  limit: number,
  callDelayMs: number,
  progress: { runLogId: number | null; startedAt: number; mode: 'collect' | 'import' }
): Promise<{ imported: number; skipped: number; failed: number; enriched: number }> {
  const provider = providers[0];
  const universe = await provider.listSymbols(Math.min(limit, IMPORT_MAX_PER_RUN));
  if (universe.length === 0) return { imported: 0, skipped: 0, failed: 0, enriched: 0 };
  const existing = await loadExistingTickerSet(db);
  const candidates = universe.filter((s) => !existing.has(s.ticker.toUpperCase()));
  let skipped = universe.length - candidates.length;
  if (candidates.length === 0) return { imported: 0, skipped, failed: 0, enriched: 0 };

  let imported = 0;
  let failed = 0;
  let enriched = 0;
  let processed = 0;
  await updateRunProgress(db, {
    runLogId: progress.runLogId,
    mode: progress.mode,
    provider: provider.name,
    triggeredBy: 'admin',
    startedAt: progress.startedAt,
    done: 0,
    total: candidates.length,
    updated: 0,
    failed: 0,
    imported: 0,
    skipped,
    phase: 'import-started',
  });

  // Quality thresholds for import eligibility.
  // ETFs get a lower price floor since bond/commodity ETFs can be legitimately cheap.
  const MIN_PRICE_ETF    = 1;
  const MIN_PRICE_STOCK  = 5;
  const MIN_DAILY_CANDLES_IMPORT = 64; // enough to compute all indicators

  for (let i = 0; i < candidates.length; i += IMPORT_BATCH_SIZE) {
    const chunk = candidates.slice(i, i + IMPORT_BATCH_SIZE);

    for (const s of chunk) {
      const ticker   = s.ticker.toUpperCase();
      const isEtf    = s.type === 'ETP';
      const minPrice = isEtf ? MIN_PRICE_ETF : MIN_PRICE_STOCK;
      const table    = tableForTicker(ticker);

      try {
        // --- Step 1: fetch data BEFORE inserting anything ---
        const result = await fetchTickerWithFallback(providers, ticker, callDelayMs);

        if (!result) {
          skipped += 1;
          console.warn('[import:skip] NO_QUOTE', { ticker, type: s.type, mic: s.mic });
          processed += 1;
          await sleep(callDelayMs);
          continue;
        }

        // --- Step 2: quality gates ---
        const price   = result.quote.currentPrice;
        const candles = result.history?.dailyCloses.length ?? 0;

        if (price < minPrice) {
          skipped += 1;
          console.warn('[import:skip] PRICE_TOO_LOW', { ticker, price, minPrice, type: s.type });
          processed += 1;
          await sleep(callDelayMs);
          continue;
        }

        if (candles < MIN_DAILY_CANDLES_IMPORT) {
          skipped += 1;
          console.warn('[import:skip] INSUFFICIENT_HISTORY', { ticker, candles, needed: MIN_DAILY_CANDLES_IMPORT, type: s.type });
          processed += 1;
          await sleep(callDelayMs);
          continue;
        }

        // --- Step 3: all data valid — insert row + write full patch atomically ---
        const now     = new Date().toISOString();
        const payload = seedRowForTable(table, ticker, s.name ?? ticker, now);
        const { error: seedErr } = await db.from(table).upsert(payload as never, { onConflict: 'ticker', ignoreDuplicates: true });
        if (seedErr) {
          failed += 1;
          console.warn('[import:fail] SEED_ERROR', { ticker, error: seedErr.message });
          processed += 1;
          await sleep(callDelayMs);
          continue;
        }

        const patch = buildUpdatePatch(
          result,
          params,
          ratingLabels,
          performanceLabels,
          trendTemplates,
          benchmarks,
          table,
          ticker,
          MEGA_CAP_SECTOR_ETF[ticker] ?? null,
        );
        const { error: upErr } = await db.from(table).update(patch).eq('ticker', ticker);
        if (upErr) {
          failed += 1;
          console.warn('[import:fail] UPDATE_ERROR', { ticker, error: upErr.message });
          processed += 1;
          await sleep(callDelayMs);
          continue;
        }

        imported += 1;
        enriched += 1;
        console.info('[import:ok]', {
          table,
          ticker,
          type: s.type,
          mic: s.mic,
          quoteProvider: result.quoteProvider,
          historyProvider: result.historyProvider ?? null,
          price,
          dailyCandles: candles,
          ret1m: typeof patch.daily_1m_percent === 'number' ? Number(patch.daily_1m_percent.toFixed(4)) : null,
          ret3m: typeof patch.daily_3m_percent === 'number' ? Number(patch.daily_3m_percent.toFixed(4)) : null,
          vs1yHigh: typeof patch.daily_vs_1y_high === 'number' ? Number(patch.daily_vs_1y_high.toFixed(4)) : null,
          dailyScore: patch.daily_trend_score ?? null,
          weeklyScore: patch.weekly_trend_score ?? null,
        });

      } catch (e) {
        failed += 1;
        console.error('[import:fail] EXCEPTION', ticker, e instanceof Error ? e.message : String(e));
      }

      processed += 1;
      await sleep(callDelayMs);
    }

    await updateRunProgress(db, {
      runLogId: progress.runLogId,
      mode: progress.mode,
      provider: provider.name,
      triggeredBy: 'admin',
      startedAt: progress.startedAt,
      done: processed,
      total: candidates.length,
      updated: enriched,
      failed,
      imported,
      skipped,
      phase: 'importing',
    });
  }
  return { imported, skipped, failed, enriched };
}

async function loadExistingTickerSet(db: ReturnType<typeof createClient>): Promise<Set<string>> {
  const out = new Set<string>();
  for (const table of TICKER_TABLES) {
    const { data } = await db.from(table).select('ticker').limit(50000);
    for (const row of data ?? []) {
      const t = String((row as { ticker?: string }).ticker ?? '').toUpperCase().trim();
      if (t) out.add(t);
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
// Import from ticker_import_candidates table
// -----------------------------------------------------------------------------

async function importFromCandidates(
  db: ReturnType<typeof createClient>,
  providers: MarketDataProvider[],
  params: FormulaParams,
  ratingLabels: Partial<RatingLabelMap>,
  performanceLabels: PerformanceTemplateMap,
  trendTemplates: TrendTemplateMap,
  benchmarks: BenchmarkSnapshots,
  callDelayMs: number,
  progress: { runLogId: number | null; startedAt: number; triggeredBy: string; providerName: string }
): Promise<{ imported: number; failed: number; skipped: number; hadMore: boolean }> {
  const progressSeed = await loadImportProgressSeed(db, progress.runLogId);
  const previousDone = progressSeed.done;
  const previousImported = progressSeed.imported;
  const previousFailed = progressSeed.failed;
  const previousSkipped = progressSeed.skipped;

  // Count remaining queue at run start so progress reflects whole chained session, not only current chunk.
  const { count: remainingCount, error: remainingErr } = await db
    .from('ticker_import_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('provider_status', 'found')
    .eq('import_status', 'pending')
    .not('import_target_table', 'is', null);
  if (remainingErr) throw new Error(`Failed to count candidate queue: ${remainingErr.message}`);
  const queueRemaining = Math.max(0, Number(remainingCount ?? 0));
  const overallTotal = Math.max(progressSeed.total, previousDone + queueRemaining);

  // Fetch one extra to detect if more remain after this batch
  const { data: candidates, error: fetchErr } = await db
    .from('ticker_import_candidates')
    .select('id, ticker, provider_name, import_target_table, is_in_system, existing_table')
    .eq('provider_status', 'found')
    .eq('import_status', 'pending')
    .not('import_target_table', 'is', null)
    .order('created_at', { ascending: true })
    .limit(CANDIDATES_MAX_PER_RUN + 1);

  if (fetchErr) throw new Error(`Failed to load candidates: ${fetchErr.message}`);
  const rows = (candidates ?? []) as {
    id: string;
    ticker: string;
    provider_name: string | null;
    import_target_table: string;
    is_in_system: boolean | null;
    existing_table: string | null;
  }[];
  const hadMore = rows.length > CANDIDATES_MAX_PER_RUN;
  const batch = rows.slice(0, CANDIDATES_MAX_PER_RUN);

  if (batch.length === 0) return { imported: 0, failed: 0, skipped: 0, hadMore: false };

  let imported = 0;
  let failed = 0;
  let skipped = 0;
  let processed = 0;
  let stoppedForBudget = false;
  const recentFailures: string[] = [];

  const recordFailure = (ticker: string, reason: string) => {
    const msg = `${ticker}: ${reason}`;
    recentFailures.unshift(msg);
    if (recentFailures.length > 5) recentFailures.length = 5;
  };

  await updateRunProgress(db, {
    runLogId: progress.runLogId,
    mode: 'import',
    provider: progress.providerName,
    triggeredBy: progress.triggeredBy,
    startedAt: progress.startedAt,
    done: previousDone,
    total: overallTotal,
    updated: previousImported,
    failed: previousFailed,
    imported: previousImported,
    skipped: previousSkipped,
    phase: 'import-candidates-started',
  });

  for (const candidate of batch) {
    if (shouldStopForBudget(progress.startedAt)) {
      stoppedForBudget = true;
      console.warn('[import-candidates] budget reached, chaining next batch', {
        processed,
        total: batch.length,
        elapsedMs: Date.now() - progress.startedAt,
      });
      break;
    }
    const ticker = candidate.ticker.toUpperCase();
    const targetTable = candidate.import_target_table as TickerTable;

    if (candidate.is_in_system) {
      skipped += 1;
      const existing = candidate.existing_table ? `Already in ${candidate.existing_table}` : 'Already in system';
      console.info('[import-candidates:skip] ALREADY_IN_SYSTEM', { ticker, existingTable: candidate.existing_table });
      await db
        .from('ticker_import_candidates')
        .update({ import_status: 'skipped', notes: existing })
        .eq('id', candidate.id);
      processed += 1;
      continue;
    }

    if (!TICKER_TABLES.includes(targetTable as (typeof TICKER_TABLES)[number])) {
      skipped += 1;
      console.warn('[import-candidates:skip] INVALID_TABLE', { ticker, table: targetTable });
      await db.from('ticker_import_candidates').update({ import_status: 'skipped', notes: 'Invalid target table' }).eq('id', candidate.id);
      processed += 1;
      continue;
    }

    try {
      const result = await fetchTickerWithFallback(providers, ticker, callDelayMs);

      if (!result) {
        failed += 1;
        console.warn('[import-candidates:fail] NO_QUOTE', { ticker });
        recordFailure(ticker, 'No quote available');
        await db.from('ticker_import_candidates').update({ notes: 'No quote available from provider' }).eq('id', candidate.id);
        processed += 1;
        await sleep(callDelayMs);
        continue;
      }

      // Quality gate: require enough history to compute all indicators.
      const candles = result.history?.dailyCloses.length ?? 0;
      if (!result.history || candles < MIN_DAILY_CANDLES) {
        failed += 1;
        console.warn('[import-candidates:fail] INSUFFICIENT_HISTORY', { ticker, candles, needed: MIN_DAILY_CANDLES });
        recordFailure(ticker, `Insufficient history (${candles}/${MIN_DAILY_CANDLES} candles)`);
        await db.from('ticker_import_candidates').update({
          notes: `Insufficient price history (${candles} candles, need ${MIN_DAILY_CANDLES}). Will retry on next import run.`,
        }).eq('id', candidate.id);
        processed += 1;
        await sleep(callDelayMs);
        continue;
      }

      // Resolve sector ETF: hardcoded for mega_caps, profile API call for other_stocks.
      let sectorEtf: string | null = null;
      if (targetTable === 'mega_caps') {
        sectorEtf = MEGA_CAP_SECTOR_ETF[ticker] ?? null;
      } else if (targetTable === 'other_stocks') {
        await sleep(callDelayMs); // rate-limit gap before profile call
        const primaryProvider = providers[0];
        if (primaryProvider.getProfile) {
          const profile = await primaryProvider.getProfile(ticker);
          if (profile?.industry) {
            sectorEtf = INDUSTRY_TO_SECTOR_ETF[profile.industry] ?? null;
          }
          if (!sectorEtf && profile?.sector) {
            sectorEtf = INDUSTRY_TO_SECTOR_ETF[profile.sector] ?? null;
          }
          console.info('[import-candidates:profile]', {
            ticker,
            industry: profile?.industry ?? null,
            sector: profile?.sector ?? null,
            sectorEtf,
          });
        }
      }

      const now = new Date().toISOString();
      const name = candidate.provider_name ?? ticker;
      const seed = seedRowForTable(targetTable, ticker, name, now);
      const { error: seedErr } = await db.from(targetTable).upsert(seed as never, { onConflict: 'ticker', ignoreDuplicates: true });

      if (seedErr) {
        failed += 1;
        console.warn('[import-candidates:fail] SEED_ERROR', { ticker, error: seedErr.message });
        recordFailure(ticker, `Seed error (${seedErr.message})`);
        await db.from('ticker_import_candidates').update({ notes: `Seed error: ${seedErr.message}` }).eq('id', candidate.id);
        processed += 1;
        await sleep(callDelayMs);
        continue;
      }

      const patch = buildUpdatePatch(
        result,
        params,
        ratingLabels,
        performanceLabels,
        trendTemplates,
        benchmarks,
        targetTable,
        ticker,
        sectorEtf,
      );
      // Write sector ETF for tables that carry the column.
      if (sectorEtf && (targetTable === 'mega_caps' || targetTable === 'other_stocks')) {
        (patch as Record<string, unknown>).sector_etf = sectorEtf;
      }
      const { error: upErr } = await db.from(targetTable).update(patch).eq('ticker', ticker);

      if (upErr) {
        failed += 1;
        console.warn('[import-candidates:fail] UPDATE_ERROR', { ticker, error: upErr.message });
        recordFailure(ticker, `Update error (${upErr.message})`);
        await db.from('ticker_import_candidates').update({ notes: `Update error: ${upErr.message}` }).eq('id', candidate.id);
        processed += 1;
        await sleep(callDelayMs);
        continue;
      }

      await db.from('ticker_import_candidates').update({
        import_status: 'imported',
        import_target_table: targetTable,
        is_in_system: true,
        existing_table: targetTable,
        notes: null,
        imported_at: now,
      }).eq('id', candidate.id);

      imported += 1;
      console.info('[import-candidates:ok]', {
        ticker, table: targetTable,
        quoteProvider: result.quoteProvider,
        historyProvider: result.historyProvider ?? null,
        price: result.quote.currentPrice,
        dailyCandles: candles,
        weeklyCandles: result.history.weeklyCloses.length,
        sectorEtf,
        volume: result.history.volume,
      });

    } catch (e) {
      failed += 1;
      const reason = e instanceof Error ? e.message : String(e);
      recordFailure(ticker, `Exception (${reason})`);
      console.error('[import-candidates:fail] EXCEPTION', ticker, reason);
      await db.from('ticker_import_candidates').update({ notes: `Exception: ${reason}` }).eq('id', candidate.id);
    }

    processed += 1;
    await sleep(callDelayMs);

    await updateRunProgress(db, {
      runLogId: progress.runLogId,
      mode: 'import',
      provider: progress.providerName,
      triggeredBy: progress.triggeredBy,
      startedAt: progress.startedAt,
      done: previousDone + processed,
      total: overallTotal,
      updated: previousImported + imported,
      failed: previousFailed + failed,
      imported: previousImported + imported,
      skipped: previousSkipped + skipped,
      phase: 'importing-candidates',
      recentFailures,
    });
  }

  await updateRunProgress(db, {
    runLogId: progress.runLogId,
    mode: 'import',
    provider: progress.providerName,
    triggeredBy: progress.triggeredBy,
    startedAt: progress.startedAt,
    done: previousDone + processed,
    total: overallTotal,
    updated: previousImported + imported,
    failed: previousFailed + failed,
    imported: previousImported + imported,
    skipped: previousSkipped + skipped,
    phase: 'importing-candidates',
    recentFailures,
  });

  return { imported, failed, skipped, hadMore: hadMore || stoppedForBudget || processed < batch.length };
}

// -----------------------------------------------------------------------------
// Core patch builder
// -----------------------------------------------------------------------------

/**
 * Compute the benchmark comparison string.
 *
 * Uses the `benchmark_leading` / `benchmark_lagging` thresholds from formula
 * settings (stored as decimals, e.g. 0.03 = 3 percentage points).
 * A ticker is "Leading" when its 1-month return exceeds the benchmark by at
 * least `benchmark_leading`, "Lagging" when it trails by `benchmark_lagging`.
 */
function benchmarkComparisonText(
  tickerRet1m: number | null,
  tickerRet3m: number | null,
  benchRet1m: number | null,
  benchRet3m: number | null,
  benchTicker: string,
  params: FormulaParams
): string {
  if (tickerRet1m === null || tickerRet3m === null || benchRet1m === null || benchRet3m === null) {
    return `$${benchTicker}: In line`;
  }
  const s1m = benchmarkComponentScore(tickerRet1m - benchRet1m, params.benchmark_leading, params.benchmark_lagging);
  const s3m = benchmarkComponentScore(tickerRet3m - benchRet3m, params.benchmark_leading, params.benchmark_lagging);
  const total = s1m + s3m;
  if (total > 4) return `$${benchTicker}: Leading`;
  if (total <= 1.1) return `$${benchTicker}: Lagging`;
  return `$${benchTicker}: In line`;
}

// Tables that have a sector-comparison column (vs QQQ/sector ETF).
// market_segments and sectors do not have this column.
const TABLES_WITH_SECTOR_COMPARISON = new Set<TickerTable>(['mega_caps', 'other_stocks']);

function buildUpdatePatch(
  result: TickerFetchResult,
  params: FormulaParams,
  ratingLabels: Partial<RatingLabelMap>,
  performanceLabels: PerformanceTemplateMap,
  trendTemplates: TrendTemplateMap,
  benchmarks: BenchmarkSnapshots,
  table: TickerTable,
  ticker: string,
  sectorEtfHint: string | null = null,
): Record<string, unknown> {
  const hasSectorCol = TABLES_WITH_SECTOR_COMPARISON.has(table);
  const marketBench = table === 'market_segments' ? MARKET_SEGMENT_BENCHMARKS[ticker] : null;
  const resolvedSectorEtf =
    (sectorEtfHint && SECTOR_TICKERS.has(sectorEtfHint) ? sectorEtfHint : null) ??
    MEGA_CAP_SECTOR_ETF[ticker] ??
    null;
  const firstBenchmarkTicker = marketBench?.first ?? benchmarks.spy.ticker;
  // Stocks: sector ETF as second benchmark. Segments keep their peer map. QQQ only as last resort.
  const secondBenchmarkTicker =
    marketBench?.second ?? resolvedSectorEtf ?? benchmarks.qqq.ticker;
  const firstBenchmark = benchmarks.byTicker[firstBenchmarkTicker] ?? benchmarks.spy;
  const secondBenchmark =
    (secondBenchmarkTicker ? benchmarks.byTicker[secondBenchmarkTicker] : null) ??
    (resolvedSectorEtf
      ? {
          ticker: resolvedSectorEtf,
          name: SECTOR_ETF_NAMES[resolvedSectorEtf] ?? `$${resolvedSectorEtf}`,
          ret1m: null,
          ret3m: null,
        }
      : benchmarks.qqq);

  const patch: Record<string, unknown> = {
    daily_current_price: result.quote.currentPrice,
    weekly_current_price: result.quote.currentPrice,
    last_updated: result.quote.fetchedAt,
    updated_at: new Date().toISOString(),
    // Always write benchmark identity fields so the UI never shows "$N/A".
    first_benchmark_ticker: firstBenchmark.ticker,
    first_benchmark_name: firstBenchmark.name,
    second_benchmark_ticker: secondBenchmark.ticker,
    second_benchmark_name: secondBenchmark.name,
    first_benchmark_1m_percent: firstBenchmark.ret1m,
    first_benchmark_3m_percent: firstBenchmark.ret3m,
    second_benchmark_1m_percent: secondBenchmark.ret1m,
    second_benchmark_3m_percent: secondBenchmark.ret3m,
  };

  // Benchmark comparison strings are written even without ticker history so
  // rows always have meaningful text in those columns.
  const firstComparison = benchmarkComparisonText(
    null,
    null,
    firstBenchmark.ret1m,
    firstBenchmark.ret3m,
    firstBenchmark.ticker,
    params
  );
  const secondComparison = benchmarkComparisonText(
    null,
    null,
    secondBenchmark.ret1m,
    secondBenchmark.ret3m,
    secondBenchmark.ticker,
    params
  );
  patch.daily_vs_spy_comparison       = firstComparison;
  patch.daily_vs_benchmark_comparison = secondComparison;
  patch.weekly_vs_spy_comparison       = firstComparison;
  patch.weekly_vs_benchmark_comparison = secondComparison;
  if (hasSectorCol) {
    patch.daily_vs_sector_comparison  = secondComparison;
    patch.weekly_vs_sector_comparison = secondComparison;
  }

  if (!result.history) return patch;

  const daily = result.history.dailyCloses;
  const weekly = result.history.weeklyCloses;
  const high52w = result.history.high52w;
  const now = result.quote.currentPrice;

  // Returns: 21 trading days ≈ 1 month, 63 ≈ 3 months.
  const d21 = daily.length >= 22 ? daily[daily.length - 22] : null;
  const d63 = daily.length >= 64 ? daily[daily.length - 64] : null;
  const ret1m = d21 !== null ? pctReturn(now, d21) : null;
  const ret3m = d63 !== null ? pctReturn(now, d63) : null;
  const vs1yHigh = distanceFrom52wHigh(now, high52w);

  const dailyEmaShort = ema(daily, params.ema_daily_short);
  const dailyEmaLong  = ema(daily, params.ema_daily_long);
  const weeklyEmaShort = ema(weekly, params.ema_weekly_short);
  const weeklyEmaLong  = ema(weekly, params.ema_weekly_long);

  const dailyPriceVsShort  = dailyEmaShort  !== null ? pctReturn(now, dailyEmaShort)  : null;
  const dailyPriceVsLong   = dailyEmaLong   !== null ? pctReturn(now, dailyEmaLong)   : null;
  const weeklyPriceVsShort = weeklyEmaShort !== null ? pctReturn(now, weeklyEmaShort) : null;
  const weeklyPriceVsLong  = weeklyEmaLong  !== null ? pctReturn(now, weeklyEmaLong)  : null;

  const dailyEmaCross  = emaCross(dailyEmaShort, dailyEmaLong);
  const weeklyEmaCross = emaCross(weeklyEmaShort, weeklyEmaLong);
  // Client sheet (27.04.2026): slope = EMA_now / EMA_5_bars_ago - 1
  // Daily = 5 trading days; weekly = 5 weeks.
  const dailySlope9Pct = emaSlopePct(daily, params.ema_daily_short, 5);
  const dailySlope21Pct = emaSlopePct(daily, params.ema_daily_long, 5);
  const weeklySlope9Pct = emaSlopePct(weekly, params.ema_weekly_short, 5);
  const weeklySlope30Pct = emaSlopePct(weekly, params.ema_weekly_long, 5);

  const dailyScore = trendScoreFromSignals(
    {
      priceVsShortEma: dailyPriceVsShort,
      priceVsLongEma: dailyPriceVsLong,
      emaCross: dailyEmaCross,
      slopeShortPct: dailySlope9Pct,
      slopeLongPct: dailySlope21Pct,
    },
    params,
    TREND_SIGNAL_THRESHOLDS.daily
  );
  const weeklyScore = trendScoreFromSignals(
    {
      priceVsShortEma: weeklyPriceVsShort,
      priceVsLongEma: weeklyPriceVsLong,
      emaCross: weeklyEmaCross,
      slopeShortPct: weeklySlope9Pct,
      slopeLongPct: weeklySlope30Pct,
    },
    params,
    TREND_SIGNAL_THRESHOLDS.weekly
  );

  const daily1mScore   = perfComponentScore(ret1m,    params.threshold_1m_bull,  params.threshold_1m_bear);
  const daily3mScore   = perfComponentScore(ret3m,    params.threshold_3m_bull,  params.threshold_3m_bear);
  const dailyVs1yScore = perfComponentScore(vs1yHigh, params.threshold_1yh_strong, params.threshold_1yh_weak);
  const perfStrength   = performanceStrength(daily1mScore, daily3mScore);
  const distToHighs    = distanceLabel(vs1yHigh);

  const dailySlope9    = slopeStateFromPct(dailySlope9Pct, TREND_SIGNAL_THRESHOLDS.daily.slopeShort);
  const dailySlope21   = slopeStateFromPct(dailySlope21Pct, TREND_SIGNAL_THRESHOLDS.daily.slopeLong);
  const weeklySlope9   = slopeStateFromPct(weeklySlope9Pct, TREND_SIGNAL_THRESHOLDS.weekly.slopeShort);
  const weeklySlope30  = slopeStateFromPct(weeklySlope30Pct, TREND_SIGNAL_THRESHOLDS.weekly.slopeLong);
  const dailyRatingLabel = ratingLabel(dailyScore, params, ratingLabels);
  const weeklyRatingLabel = ratingLabel(weeklyScore, params, ratingLabels);
  const dailyOutlook   = trendOutlook(dailyScore, {
    priceVsShortEma: dailyPriceVsShort,
    priceVsLongEma: dailyPriceVsLong,
    emaCross: dailyEmaCross,
  }, params);
  const weeklyOutlook  = trendOutlook(weeklyScore, {
    priceVsShortEma: weeklyPriceVsShort,
    priceVsLongEma: weeklyPriceVsLong,
    emaCross: weeklyEmaCross,
  }, params);
  const dailyMonth     = rollingHighLow(daily,  21);
  const weeklyQuarter  = rollingHighLow(weekly, 13);

  // --- Performance fields ---
  patch.daily_1m_percent = ret1m;
  patch.daily_3m_percent = ret3m;
  patch.daily_vs_1y_high = vs1yHigh;
  patch['1m_percent'] = ret1m;
  patch['3m_percent'] = ret3m;
  patch['vs_1y_high'] = vs1yHigh;
  patch.daily_1m_score   = daily1mScore;
  patch.daily_3m_score   = daily3mScore;
  patch.daily_vs_1y_score = dailyVs1yScore;
  patch['1m_score'] = daily1mScore;
  patch['3m_score'] = daily3mScore;
  patch['vs_1y_score'] = dailyVs1yScore;
  patch.daily_performance_strength = perfStrength;
  patch.daily_distance_to_highs    = distToHighs;
  patch.performance_strength       = perfStrength;
  patch.distance_to_highs          = distToHighs;
  const firstComp = benchmarkComparisonText(
    ret1m,
    ret3m,
    firstBenchmark.ret1m,
    firstBenchmark.ret3m,
    firstBenchmark.ticker,
    params
  );
  const secondComp = benchmarkComparisonText(
    ret1m,
    ret3m,
    secondBenchmark.ret1m,
    secondBenchmark.ret3m,
    secondBenchmark.ticker,
    params
  );
  const benchmarkRelation = relationFromComparison(secondComp);
  const perfText = performanceText(perfStrength, distToHighs, benchmarkRelation, ticker, performanceLabels);
  patch.daily_performance_summary = `${perfText.label} | ${benchmarkRelation} vs benchmarks`;
  patch.daily_performance_description = perfText.description;

  // --- Benchmark comparisons — now computed from real provider data ---
  patch.daily_vs_spy_comparison        = firstComp;
  patch.daily_vs_benchmark_comparison  = secondComp;
  patch.weekly_vs_spy_comparison       = firstComp;
  patch.weekly_vs_benchmark_comparison = secondComp;
  if (hasSectorCol) {
    patch.daily_vs_sector_comparison  = secondComp;
    patch.weekly_vs_sector_comparison = secondComp;
  }

  // --- Daily trend ---
  patch.daily_price_vs_9ema  = dailyPriceVsShort;
  patch.daily_price_vs_21ema = dailyPriceVsLong;
  patch.daily_ema9_vs_21ema  = dailyEmaCross;
  patch.daily_slope_9ema     = dailySlope9;
  patch.daily_slope_21ema    = dailySlope21;
  patch.daily_ema_9          = dailyEmaShort;
  patch.daily_ema_21         = dailyEmaLong;
  patch.daily_month_high     = dailyMonth.high;
  patch.daily_month_low      = dailyMonth.low;
  patch.daily_trend_score       = Number(dailyScore.toFixed(2));
  patch.daily_rating            = dailyRatingLabel;
  patch.daily_outlook           = dailyOutlook;
  patch.daily_rating_stars      = starRating(dailyScore);
  patch.daily_trend_description = trendDescription(
    dailyScore,
    dailyOutlook,
    String(patch.daily_rating ?? ''),
    'Daily',
    trendTemplates
  );
  const dailyTh = TREND_SIGNAL_THRESHOLDS.daily;
  const weeklyTh = TREND_SIGNAL_THRESHOLDS.weekly;
  patch.daily_price_vs_9ema_icon   = trendSignalIcon(dailyPriceVsShort, dailyTh.short);
  patch.daily_price_vs_21ema_icon  = trendSignalIcon(dailyPriceVsLong, dailyTh.long);
  patch.daily_ema9_vs_21ema_icon   = trendSignalIcon(dailyEmaCross, dailyTh.cross);
  patch.daily_slope_9ema_icon      = trendSignalIcon(dailySlope9Pct, dailyTh.slopeShort);
  patch.daily_slope_21ema_icon     = trendSignalIcon(dailySlope21Pct, dailyTh.slopeLong);

  // --- Weekly trend ---
  patch.weekly_price_vs_9ema  = weeklyPriceVsShort;
  patch.weekly_price_vs_30ema = weeklyPriceVsLong;
  patch.weekly_ema9_vs_30ema  = weeklyEmaCross;
  patch.weekly_slope_9ema     = weeklySlope9;
  patch.weekly_slope_30ema    = weeklySlope30;
  patch.weekly_ema_9          = weeklyEmaShort;
  patch.weekly_ema_30         = weeklyEmaLong;
  patch.weekly_month_high     = weeklyQuarter.high;
  patch.weekly_month_low      = weeklyQuarter.low;
  patch.weekly_trend_score       = Number(weeklyScore.toFixed(2));
  patch.weekly_rating            = weeklyRatingLabel;
  patch.weekly_outlook           = weeklyOutlook;
  patch.weekly_rating_stars      = starRating(weeklyScore);
  patch.weekly_trend_description = trendDescription(
    weeklyScore,
    weeklyOutlook,
    String(patch.weekly_rating ?? ''),
    'Weekly',
    trendTemplates
  );
  patch.weekly_price_vs_9ema_icon   = trendSignalIcon(weeklyPriceVsShort, weeklyTh.short);
  patch.weekly_price_vs_30ema_icon  = trendSignalIcon(weeklyPriceVsLong, weeklyTh.long);
  patch.weekly_ema9_vs_30ema_icon   = trendSignalIcon(weeklyEmaCross, weeklyTh.cross);
  patch.weekly_slope_9ema_icon      = trendSignalIcon(weeklySlope9Pct, weeklyTh.slopeShort);
  patch.weekly_slope_30ema_icon     = trendSignalIcon(weeklySlope30Pct, weeklyTh.slopeLong);

  // Volume — sourced from the most-recent candle (Finnhub only; null for TwelveData).
  if (result.history.volume != null) {
    patch.volume = result.history.volume;
  }

  // Relative strength vs SMA 50 / SMA 200 (additive; does not affect Trend Score).
  const sma50 = sma(daily, 50);
  const sma200 = sma(daily, 200);
  patch.pct_from_sma50 = pctFromSma(now, sma50);
  patch.pct_from_sma200 = pctFromSma(now, sma200);

  return patch;
}

// -----------------------------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------------------------

function perfComponentScore(value: number | null, bull: number, bear: number): number {
  if (value === null) return 1;
  if (value >= bull) return 3;
  if (value <= bear) return 0;
  return 1;
}

function trendScoreFromSignals(
  inputs: {
    priceVsShortEma: number | null;
    priceVsLongEma: number | null;
    emaCross: number | null;
    slopeShortPct: number | null;
    slopeLongPct: number | null;
  },
  p: FormulaParams,
  thresholds: { short: number; long: number; cross: number; slopeShort: number; slopeLong: number }
): number {
  const components = [
    { score: trendComponentScore(inputs.priceVsShortEma, thresholds.short), weight: p.weight_1m_return },
    { score: trendComponentScore(inputs.priceVsLongEma, thresholds.long), weight: p.weight_3m_return },
    { score: trendComponentScore(inputs.emaCross, thresholds.cross), weight: p.weight_vs_1y_high },
    { score: trendComponentScore(inputs.slopeShortPct, thresholds.slopeShort), weight: p.weight_vs_9ema },
    { score: trendComponentScore(inputs.slopeLongPct, thresholds.slopeLong), weight: p.weight_vs_30ema },
  ];
  const sumProduct = components.reduce((s, c) => s + c.score * c.weight, 0);
  const raw = (sumProduct / 3) * (5 / components.reduce((s, c) => s + c.weight, 0));
  return Math.max(0, Math.min(5, Number.isFinite(raw) ? raw : 0));
}

function benchmarkComponentScore(diff: number | null, leading: number, lagging: number): number {
  if (diff === null) return 1;
  if (diff > leading) return 3;
  if (diff < -lagging) return 0;
  return 1;
}

function performanceStrength(s1: number, s3: number): string {
  const total = s1 + s3;
  if (total > 4) return 'Strong';
  if (total <= 1.1) return 'Weak';
  return 'Mixed';
}

function distanceLabel(v: number | null): string {
  if (v === null) return 'N/A';
  if (v > -0.05) return 'Close to Highs';
  if (v > -0.1)  return 'Medium distance to Highs';
  return 'Far from Highs';
}

function emaCross(shortEma: number | null, longEma: number | null): number | null {
  if (shortEma === null || longEma === null) return null;
  return pctReturn(shortEma, longEma);
}

function emaSlopePct(values: number[], period: number, lookback = 5): number | null {
  if (!Array.isArray(values) || values.length < period + lookback) return null;
  const now = ema(values, period);
  const prev = ema(values.slice(0, values.length - lookback), period);
  if (now === null || prev === null || prev === 0) return null;
  return now / prev - 1;
}

function slopeStateFromPct(v: number | null, threshold: number): 'Rising' | 'Flat' | 'Falling' | null {
  if (v === null) return null;
  if (v > threshold) return 'Rising';
  if (v < -threshold) return 'Falling';
  return 'Flat';
}

function emaSlope(
  values: number[],
  period: number,
  lookback: number
): 'Rising' | 'Flat' | 'Falling' | null {
  if (!Array.isArray(values) || values.length < period + lookback + 2) return null;
  const now  = ema(values, period);
  const prev = ema(values.slice(0, values.length - lookback), period);
  if (now === null || prev === null) return null;
  const delta = now - prev;
  if (delta >  0.0001) return 'Rising';
  if (delta < -0.0001) return 'Falling';
  return 'Flat';
}

function rollingHighLow(
  values: number[],
  window: number
): { high: number | null; low: number | null } {
  if (!Array.isArray(values) || values.length === 0) return { high: null, low: null };
  const slice = values.slice(-window);
  if (slice.length === 0) return { high: null, low: null };
  return { high: Math.max(...slice), low: Math.min(...slice) };
}

function starRating(score: number): string {
  const rounded = Math.max(0, Math.min(5, score));
  const full = Math.floor(rounded);
  const hasHalf = rounded - full >= 0.5;
  return '*'.repeat(full) + (hasHalf ? '+' : '') + '-'.repeat(5 - full - (hasHalf ? 1 : 0));
}

function trendDescription(
  score: number,
  outlook: 'Extended' | 'Stable' | 'Cooling' | 'Reversing' | 'Firming' | 'Softening' | 'Warming',
  rating: string,
  timeframe: 'Daily' | 'Weekly',
  templates: TrendTemplateMap
): string {
  const outlookKey = trendTemplateOutlookKey(rating, outlook);
  const tierKey = ratingTierFromText(rating);
  if (tierKey && outlookKey) {
    const templated = templates[`${tierKey}|${outlookKey}|${timeframe}`];
    if (templated && templated.trim()) return templated.trim();
  }
  const o = outlook.toLowerCase();
  if (score >= 4.2) return `Momentum is strongly bullish with aligned signals. Signal is ${o}.`;
  if (score >= 3.0) return `Trend is constructive and above key moving averages. Signal is ${o}.`;
  if (score >= 1.8) return `Trend is mixed with balanced bullish and bearish inputs. Signal is ${o}.`;
  return `Trend is weak with downside pressure across key signals. Signal is ${o}.`;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function performanceText(
  strength: string,
  distance: string,
  relation: 'Leading' | 'In line' | 'Lagging',
  ticker: string,
  templates: PerformanceTemplateMap
): { label: string; description: string } {
  const strengthKey: 'Strong' | 'Mixed' | 'Weak' = strength === 'Strong' ? 'Strong' : strength === 'Mixed' ? 'Mixed' : 'Weak';
  const distanceKey =
    distance === 'Close to Highs' || distance === 'Medium distance to Highs' || distance === 'Far from Highs'
      ? distance
      : 'Medium distance to Highs';
  const key = `${strengthKey}|${distanceKey}|${relation}`;
  const picked = templates[key];
  if (picked) {
    const description = (picked.description || '')
      .replace(/\{\{\s*ticker\s*\}\}/gi, `$${ticker.toUpperCase()}`)
      .replace(/\{\{\s*distance\s*\}\}/gi, distanceKey.toLowerCase())
      .replace(/\{\{\s*strength\s*\}\}/gi, strengthKey.toLowerCase())
      .replace(/\{\{\s*benchmark_relation\s*\}\}/gi, relation.toLowerCase());
    return { label: picked.label || `${strengthKey} performer`, description };
  }
  const lowerDistance = distanceKey.toLowerCase();
  return {
    label: `${strengthKey} performer`,
    description: `$${ticker.toUpperCase()} is currently showing ${strengthKey.toLowerCase()} performance, is ${lowerDistance}, and is ${relation.toLowerCase()} vs benchmarks.`,
  };
}

function relationFromComparison(text: string): 'Leading' | 'In line' | 'Lagging' {
  const s = text.toLowerCase();
  if (s.includes('leading')) return 'Leading';
  if (s.includes('lagging')) return 'Lagging';
  return 'In line';
}

function ratingTierFromText(rating: string): 'strong_bull' | 'bull' | 'neutral' | 'bear' | 'strong_bear' | null {
  const s = rating.toLowerCase();
  if (s.includes('strong performer') || (s.includes('strong') && s.includes('uptrend'))) return 'strong_bull';
  if (s.includes('uptrend') || s.includes('bull')) return 'bull';
  if (s.includes('sideways') || s.includes('neutral')) return 'neutral';
  if (s.includes('strong downtrend') || (s.includes('strong') && s.includes('bear'))) return 'strong_bear';
  if (s.includes('downtrend') || s.includes('bear')) return 'bear';
  return null;
}

function trendTemplateOutlookKey(
  _rating: string,
  outlook: 'Extended' | 'Stable' | 'Cooling' | 'Reversing' | 'Firming' | 'Softening' | 'Warming'
): 'Extended' | 'Stable' | 'Cooling' | 'Reversing' | 'Firming' | 'Softening' | 'Warming' | null {
  return outlook;
}

// -----------------------------------------------------------------------------
// Run logging
// -----------------------------------------------------------------------------

async function logRun(
  db: ReturnType<typeof createClient>,
  r: {
    runLogId?: number | null;
    provider: string;
    status: 'ok' | 'partial' | 'error';
    error: string | null;
    triggeredBy: string;
    durationMs: number;
    tickersUpdated?: number;
    tickersFailed?: number;
  }
) {
  const payload = {
    provider: r.provider,
    status: r.status,
    error_message: r.error,
    triggered_by: r.triggeredBy,
    duration_ms: r.durationMs,
    tickers_updated: r.tickersUpdated ?? 0,
    tickers_failed: r.tickersFailed ?? 0,
    run_at: new Date().toISOString(),
  };
  if (r.runLogId) {
    await db.from('api_health_log').update(payload).eq('id', r.runLogId);
    return;
  }
  await db.from('api_health_log').insert(payload);
}

/** One in-app admin notification when a ticker session fully completes (not per chained batch). */
async function notifyAdminTickerSessionComplete(
  db: ReturnType<typeof createClient>,
  input: {
    kind: 'collect_session' | 'candidates_import';
    provider: string;
    status: 'ok' | 'partial' | 'error';
    triggeredBy: string;
    durationMs: number;
    tickersUpdated: number;
    tickersFailed: number;
    imported?: number;
    skipped?: number;
    importMode?: boolean;
    diagSummary?: string | null;
  },
) {
  const title =
    input.kind === 'candidates_import' ? 'Ticker import (candidates) complete' : 'Ticker data refresh complete';
  const parts: string[] = [
    `${input.provider}: ${input.status}.`,
    `Tickers updated: ${input.tickersUpdated}, failed: ${input.tickersFailed}.`,
  ];
  if (input.kind === 'candidates_import' && (input.imported != null || input.skipped != null)) {
    parts.push(`Imported: ${input.imported ?? 0}, skipped: ${input.skipped ?? 0}.`);
  }
  if (input.diagSummary) parts.push(input.diagSummary);
  parts.push(`Run by: ${input.triggeredBy}.`, `Duration: ${Math.round(input.durationMs)} ms.`);
  const body = parts.join(' ');
  const { error } = await db.from('admin_notifications').insert({
    type: 'ticker_update_complete',
    title,
    body,
    metadata: {
      kind: input.kind,
      provider: input.provider,
      status: input.status,
      tickers_updated: input.tickersUpdated,
      tickers_failed: input.tickersFailed,
      duration_ms: input.durationMs,
      triggered_by: input.triggeredBy,
      imported: input.imported ?? null,
      skipped: input.skipped ?? null,
      import_mode: Boolean(input.importMode),
    },
  });
  if (error) console.warn('[admin-notify] admin_notifications insert failed', error.message);
}

async function updateRunProgress(
  db: ReturnType<typeof createClient>,
  input: {
    runLogId: number | null;
    mode: 'collect' | 'import';
    provider: string;
    triggeredBy: string;
    startedAt: number;
    done: number;
    total: number;
    updated: number;
    failed: number;
    imported: number;
    skipped: number;
    phase: string;
    recentFailures?: string[];
  }
) {
  if (!input.runLogId) return;
  const total = Math.max(0, input.total);
  const done  = Math.min(Math.max(0, input.done), total || input.done);
  const pct   = total <= 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
  const payload = {
    type: 'progress', mode: input.mode, phase: input.phase,
    done, total, percent: pct,
    heartbeat_at: Date.now(),
    updated: input.updated, failed: input.failed,
    imported: input.imported, skipped: input.skipped,
    elapsedMs: Date.now() - input.startedAt,
    recent_failures: (input.recentFailures ?? []).slice(0, 5),
  };
  await db
    .from('api_health_log')
    .update({
      provider: input.provider,
      status: 'partial',
      error_message: `__progress__${JSON.stringify(payload)}`,
      triggered_by: input.triggeredBy,
      duration_ms: null,
      tickers_updated: input.updated,
      tickers_failed: input.failed,
    })
    .eq('id', input.runLogId);
}

async function loadImportProgressSeed(
  db: ReturnType<typeof createClient>,
  runLogId: number | null
): Promise<{ done: number; total: number; imported: number; failed: number; skipped: number }> {
  if (!runLogId) return { done: 0, total: 0, imported: 0, failed: 0, skipped: 0 };
  const { data, error } = await db
    .from('api_health_log')
    .select('error_message')
    .eq('id', runLogId)
    .maybeSingle();
  if (error || !data) return { done: 0, total: 0, imported: 0, failed: 0, skipped: 0 };
  const raw = String((data as { error_message?: string | null }).error_message ?? '');
  const idx = raw.indexOf('__progress__');
  if (idx < 0) return { done: 0, total: 0, imported: 0, failed: 0, skipped: 0 };
  try {
    const parsed = JSON.parse(raw.slice(idx + '__progress__'.length).trim()) as {
      done?: unknown;
      total?: unknown;
      imported?: unknown;
      failed?: unknown;
      skipped?: unknown;
    };
    return {
      done: Math.max(0, Number(parsed.done ?? 0) || 0),
      total: Math.max(0, Number(parsed.total ?? 0) || 0),
      imported: Math.max(0, Number(parsed.imported ?? 0) || 0),
      failed: Math.max(0, Number(parsed.failed ?? 0) || 0),
      skipped: Math.max(0, Number(parsed.skipped ?? 0) || 0),
    };
  } catch {
    return { done: 0, total: 0, imported: 0, failed: 0, skipped: 0 };
  }
}

// -----------------------------------------------------------------------------
// Misc utilities
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Price history helpers — persist daily + weekly closes for chart rendering
// -----------------------------------------------------------------------------

/**
 * Convert a flat array of closes (oldest → newest) into price_history rows.
 * Dates are approximated by walking back from `anchorDate` by trading days
 * (weekends skipped, public holidays not accounted for — close enough for charts).
 */
function closesToRows(
  ticker: string,
  closes: number[],
  interval: 'daily' | 'weekly',
  anchorDate: Date,
  maxRows: number,
): Array<{ ticker: string; bar_date: string; interval: string; close: number }> {
  const rows: Array<{ ticker: string; bar_date: string; interval: string; close: number }> = [];
  // How many calendar days to step back per bar.
  const stepCalendarDays = interval === 'weekly' ? 7 : 1;

  // Start from anchor and walk backward, collecting one date per bar.
  // For weekly bars we normalize to the ISO week start (Monday) so each week
  // has one stable key and repeated intraday runs upsert the same row.
  const dates: string[] = [];
  let cursor = new Date(anchorDate);
  if (interval === 'weekly') {
    const day = cursor.getUTCDay() || 7; // Mon=1..Sun=7
    cursor.setUTCDate(cursor.getUTCDate() - (day - 1)); // move to Monday
  }
  const slice = closes.slice(-maxRows);

  for (let i = 0; i < slice.length; i++) {
    // For daily: skip Sat/Sun when stepping back.
    if (interval === 'daily') {
      // Step back by 1 calendar day, skip weekend.
      cursor.setDate(cursor.getDate() - (i === 0 ? 0 : 1));
      while (cursor.getDay() === 0 || cursor.getDay() === 6) {
        cursor.setDate(cursor.getDate() - 1);
      }
    } else {
      if (i > 0) cursor.setDate(cursor.getDate() - stepCalendarDays);
    }
    dates.push(cursor.toISOString().slice(0, 10));
  }
  // dates[0] = most recent, dates[N-1] = oldest; slice[N-1] = oldest close, slice[0] = newest
  // We want dates[i] ↔ slice[slice.length - 1 - i]
  for (let i = 0; i < slice.length; i++) {
    rows.push({
      ticker,
      bar_date: dates[i],
      interval,
      close: slice[slice.length - 1 - i],
    });
  }
  return rows;
}

/**
 * Upsert daily + weekly closes for one ticker into price_history.
 * Fire-and-forget errors so a write failure never stops the main collect run.
 */
async function upsertPriceHistory(
  db: ReturnType<typeof createClient>,
  ticker: string,
  history: { dailyCloses: number[]; weeklyCloses: number[] },
): Promise<void> {
  try {
    const anchor = new Date();
    const dailyRows  = closesToRows(ticker, history.dailyCloses,  'daily',  anchor, 252);
    const weeklyRows = closesToRows(ticker, history.weeklyCloses, 'weekly', anchor, 78);
    const rows = [...dailyRows, ...weeklyRows];
    if (rows.length === 0) return;
    const { error } = await db
      .from('price_history')
      .upsert(rows, { onConflict: 'ticker,bar_date,interval', ignoreDuplicates: false });
    if (error) {
      console.warn('[price_history] upsert error', { ticker, error: error.message });
    }
  } catch (e) {
    console.warn('[price_history] upsert threw', { ticker, err: String(e) });
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveCallDelayMs(rateLimitRpm: number | null): number {
  if (!rateLimitRpm || !Number.isFinite(rateLimitRpm) || rateLimitRpm <= 0) return MIN_CALL_DELAY_MS;
  const fromLimit = Math.ceil(60_000 / rateLimitRpm) + 50;
  return Math.max(MIN_CALL_DELAY_MS, fromLimit);
}

function shouldStopForBudget(startedAtMs: number): boolean {
  return Date.now() - startedAtMs >= (RUN_BUDGET_MS - RUN_BUDGET_RESERVE_MS);
}

function coerceBytes(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v;
  if (typeof v === 'string') return hexToBytes(v);
  throw new Error('Unexpected bytea value type.');
}

function tableForTicker(ticker: string): TickerTable {
  if (MARKET_SEGMENT_TICKERS.has(ticker)) return 'market_segments';
  if (SECTOR_TICKERS.has(ticker))         return 'sectors';
  if (MEGA_CAP_TICKERS.has(ticker))       return 'mega_caps';
  return 'other_stocks';
}

function seedRowForTable(
  table: TickerTable,
  ticker: string,
  name: string,
  now: string
): Record<string, unknown> {
  const base = { ticker, last_updated: now, updated_at: now };
  if (table === 'market_segments') return { ...base, name };
  if (table === 'sectors')         return { ...base, sector_name: name };
  return { ...base, company_name: name };
}
