// Market data providers. Each provider implements the same interface and returns
// a normalized shape. Callers try providers in priority order.

export type ProviderQuote = {
  ticker: string;
  currentPrice: number;
  fetchedAt: string;
};

export type ProviderHistory = {
  ticker: string;
  /** Daily close prices, chronological (oldest → newest). */
  dailyCloses: number[];
  /**
   * Weekly close prices: last available close per calendar week (ISO week),
   * chronological (oldest → newest).
   */
  weeklyCloses: number[];
  /** 52-week high across the most-recent 252 trading days (or full range). */
  high52w: number;
  /** Most-recent day's trading volume (shares). Null if provider does not supply it. */
  volume: number | null;
};

export type ProviderProfile = {
  ticker: string;
  name: string | null;
  /** Finnhub industry label, e.g. "Technology", "Airlines", "Banks—Regional". */
  industry: string | null;
};

export type ProviderSymbol = {
  ticker: string;
  name: string | null;
  /** Exchange MIC code: XNYS = NYSE, XNAS = NASDAQ */
  mic: string | null;
  /** Finnhub/TwelveData instrument type: "ETP", "Common Stock", "ADR", etc. */
  type: string | null;
};

export interface MarketDataProvider {
  readonly name: string;
  getQuote(ticker: string): Promise<ProviderQuote | null>;
  /** Fetch ~13 months of daily closes + volume. Returns null if unsupported on current plan. */
  getHistory(ticker: string): Promise<ProviderHistory | null>;
  /** Fetch broad symbol universe for one-time catalog import. */
  listSymbols(limit?: number): Promise<ProviderSymbol[]>;
  /** Fetch company profile (industry, name). Optional — only implemented by Finnhub. */
  getProfile?(ticker: string): Promise<ProviderProfile | null>;
}

// Per-request timeout. Prevents a stalled provider from blocking the whole run.
const FETCH_TIMEOUT_MS = 12_000;

function timedFetch(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

// -----------------------------------------------------------------------------
// Finnhub
// -----------------------------------------------------------------------------
export class FinnhubProvider implements MarketDataProvider {
  readonly name = 'finnhub';
  private readonly base = 'https://finnhub.io/api/v1';
  constructor(private readonly apiKey: string) {}

  async getQuote(ticker: string): Promise<ProviderQuote | null> {
    const url = `${this.base}/quote?symbol=${encodeURIComponent(ticker)}&token=${this.apiKey}`;
    let r: Response;
    try {
      r = await timedFetch(url);
    } catch (e) {
      console.warn('[finnhub:quote] NETWORK_ERROR', { ticker, error: (e as Error).message });
      return null;
    }
    if (r.status === 429) {
      console.warn('[finnhub:quote] RATE_LIMITED', { ticker });
      return null;
    }
    if (!r.ok) {
      console.warn('[finnhub:quote] HTTP_ERROR', { ticker, status: r.status });
      return null;
    }
    const j = (await r.json()) as { c?: number; pc?: number; h?: number; l?: number; o?: number; d?: number; dp?: number; t?: number };

    // Use current price (c). When market is closed Finnhub may return c=0 —
    // fall back to previous close (pc) which is always populated.
    const price = (j.c && Number.isFinite(j.c) && j.c > 0)
      ? j.c
      : (j.pc && Number.isFinite(j.pc) && j.pc > 0 ? j.pc : null);

    console.info('[finnhub:quote] RAW', {
      ticker,
      c: j.c ?? null,
      pc: j.pc ?? null,
      h: j.h ?? null,
      l: j.l ?? null,
      d: j.d ?? null,
      dp: j.dp ?? null,
      t: j.t ?? null,
      usedPrice: price,
      usedField: price === j.c ? 'c' : price === j.pc ? 'pc(market_closed_fallback)' : 'none',
    });

    if (price === null) {
      console.warn('[finnhub:quote] NO_PRICE', { ticker, c: j.c, pc: j.pc, reason: 'both c and pc are 0 or missing' });
      return null;
    }

    return {
      ticker,
      currentPrice: price,
      fetchedAt: new Date((j.t ?? Date.now() / 1000) * 1000).toISOString(),
    };
  }

  async getHistory(ticker: string): Promise<ProviderHistory | null> {
    const to = Math.floor(Date.now() / 1000);
    const from = to - 400 * 24 * 60 * 60; // ~13 months
    const url = `${this.base}/stock/candle?symbol=${encodeURIComponent(ticker)}&resolution=D&from=${from}&to=${to}&token=${this.apiKey}`;
    let r: Response;
    try {
      r = await timedFetch(url);
    } catch (e) {
      console.warn('[finnhub:history] NETWORK_ERROR', { ticker, error: (e as Error).message });
      return null;
    }
    if (r.status === 429) {
      console.warn('[finnhub:history] RATE_LIMITED', { ticker });
      return null;
    }
    if (!r.ok) {
      console.warn('[finnhub:history] HTTP_ERROR', { ticker, status: r.status });
      return null;
    }
    const j = (await r.json()) as { s?: string; c?: number[]; v?: number[]; t?: number[] };
    const rawCandles = Array.isArray(j.c) ? j.c.length : 0;
    const daily: number[] = [];
    const dailyDates: string[] = [];
    if (Array.isArray(j.c)) {
      for (let i = 0; i < j.c.length; i++) {
        const close = Number(j.c[i]);
        const ts = Array.isArray(j.t) ? Number(j.t[i]) : NaN;
        if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(ts) || ts <= 0) continue;
        daily.push(close);
        dailyDates.push(new Date(ts * 1000).toISOString().slice(0, 10));
      }
    }
    const vols = Array.isArray(j.v) ? j.v : [];
    const latestVolume = vols.length > 0 && Number.isFinite(vols[vols.length - 1]) && vols[vols.length - 1] > 0
      ? Math.round(vols[vols.length - 1])
      : null;

    console.info('[finnhub:history] RAW', {
      ticker,
      status: j.s ?? 'missing',
      rawCandles,
      validCandles: daily.length,
      latestVolume,
      firstClose: daily[0] ?? null,
      lastClose: daily[daily.length - 1] ?? null,
      firstDate: Array.isArray(j.t) && j.t[0] ? new Date(j.t[0] * 1000).toISOString().slice(0, 10) : null,
      lastDate: Array.isArray(j.t) && j.t.length ? new Date(j.t[j.t.length - 1] * 1000).toISOString().slice(0, 10) : null,
    });

    if (j.s !== 'ok' || daily.length === 0) {
      console.warn('[finnhub:history] NO_DATA', { ticker, s: j.s, reason: j.s !== 'ok' ? 'status_not_ok' : 'no_valid_candles' });
      return null;
    }
    if (daily.length < 10) {
      console.warn('[finnhub:history] TOO_FEW_CANDLES', { ticker, validCandles: daily.length, minimum: 10 });
      return null;
    }
    return buildHistory(ticker, daily, latestVolume, dailyDates);
  }

  async listSymbols(limit = 50_000): Promise<ProviderSymbol[]> {
    const out: ProviderSymbol[] = [];
    const seen = new Set<string>();
    const url = `${this.base}/stock/symbol?exchange=US&token=${this.apiKey}`;
    let r: Response;
    try {
      r = await timedFetch(url);
    } catch {
      return out;
    }
    if (!r.ok) return out;
    const rows = (await r.json()) as Array<{ symbol?: string; description?: string; mic?: string; type?: string }>;

    // ETFs first, then Common Stock — sort so ETPs come before others.
    const sorted = [...(rows ?? [])].sort((a, b) => {
      const aEtf = a.type === 'ETP' ? 0 : 1;
      const bEtf = b.type === 'ETP' ? 0 : 1;
      return aEtf - bEtf;
    });

    for (const row of sorted) {
      const symbol = String(row.symbol ?? '').toUpperCase().trim();
      const mic    = String(row.mic  ?? '').toUpperCase().trim() || null;
      const type   = String(row.type ?? '').trim() || null;

      if (!isImportableTicker(symbol)) continue;
      // Only NYSE (XNYS) and NASDAQ (XNAS) — no OTC, foreign, or regional exchanges.
      if (mic !== 'XNYS' && mic !== 'XNAS') continue;
      // Only ETFs and Common Stocks — skip ADRs, warrants, rights, etc.
      if (type !== 'ETP' && type !== 'Common Stock') continue;

      if (seen.has(symbol)) continue;
      seen.add(symbol);
      out.push({ ticker: symbol, name: row.description?.trim() || null, mic, type });
      if (out.length >= limit) break;
    }

    console.info('[finnhub:listSymbols]', { total: rows?.length ?? 0, filtered: out.length });
    return out;
  }

  async getProfile(ticker: string): Promise<ProviderProfile | null> {
    const url = `${this.base}/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${this.apiKey}`;
    let r: Response;
    try {
      r = await timedFetch(url);
    } catch (e) {
      console.warn('[finnhub:profile] NETWORK_ERROR', { ticker, error: (e as Error).message });
      return null;
    }
    if (r.status === 429) {
      console.warn('[finnhub:profile] RATE_LIMITED', { ticker });
      return null;
    }
    if (!r.ok) {
      console.warn('[finnhub:profile] HTTP_ERROR', { ticker, status: r.status });
      return null;
    }
    const j = (await r.json()) as { name?: string; finnhubIndustry?: string; ticker?: string };
    if (!j.name && !j.finnhubIndustry) {
      console.warn('[finnhub:profile] EMPTY', { ticker });
      return null;
    }
    console.info('[finnhub:profile] OK', { ticker, industry: j.finnhubIndustry ?? null });
    return { ticker, name: j.name ?? null, industry: j.finnhubIndustry ?? null };
  }
}

// -----------------------------------------------------------------------------
// Twelve Data (fallback)
// -----------------------------------------------------------------------------
export class TwelveDataProvider implements MarketDataProvider {
  readonly name = 'twelve_data';
  private readonly base = 'https://api.twelvedata.com';
  constructor(private readonly apiKey: string) {}

  async getQuote(ticker: string): Promise<ProviderQuote | null> {
    const url = `${this.base}/price?symbol=${encodeURIComponent(ticker)}&apikey=${this.apiKey}`;
    let r: Response;
    try {
      r = await timedFetch(url);
    } catch (e) {
      console.warn('[twelve_data:quote] NETWORK_ERROR', { ticker, error: (e as Error).message });
      return null;
    }
    if (!r.ok) {
      console.warn('[twelve_data:quote] HTTP_ERROR', { ticker, status: r.status });
      return null;
    }
    const j = (await r.json()) as { price?: string; code?: number; message?: string };
    if (typeof j.code === 'number' && j.code >= 400) {
      console.warn('[twelve_data:quote] API_ERROR', { ticker, code: j.code, message: j.message ?? null });
      return null;
    }
    const price = Number(j.price);

    console.info('[twelve_data:quote] RAW', {
      ticker,
      rawPrice: j.price ?? null,
      parsedPrice: Number.isFinite(price) ? price : null,
    });

    if (!j.price || !Number.isFinite(price) || price <= 0) {
      console.warn('[twelve_data:quote] NO_PRICE', { ticker, rawPrice: j.price });
      return null;
    }
    return { ticker, currentPrice: price, fetchedAt: new Date().toISOString() };
  }

  async getHistory(ticker: string): Promise<ProviderHistory | null> {
    // 390 bars ≈ 15 months — enough for 30-week EMA and 3-month return
    const url = `${this.base}/time_series?symbol=${encodeURIComponent(ticker)}&interval=1day&outputsize=390&apikey=${this.apiKey}`;
    let r: Response;
    try {
      r = await timedFetch(url);
    } catch (e) {
      console.warn('[twelve_data:history] NETWORK_ERROR', { ticker, error: (e as Error).message });
      return null;
    }
    if (!r.ok) {
      console.warn('[twelve_data:history] HTTP_ERROR', { ticker, status: r.status });
      return null;
    }
    const j = (await r.json()) as { values?: { datetime: string; close: string }[]; status?: string; code?: number; message?: string };
    if (typeof j.code === 'number' && j.code >= 400) {
      console.warn('[twelve_data:history] API_ERROR', { ticker, code: j.code, message: j.message ?? null });
      return null;
    }
    if (j.status === 'error') {
      console.warn('[twelve_data:history] STATUS_ERROR', { ticker });
      return null;
    }

    const rawRows = Array.isArray(j.values) ? j.values.length : 0;
    const parsed = (j.values ?? [])
      .map((v) => ({ close: Number(v.close), date: String(v.datetime ?? '').slice(0, 10) }))
      .filter((row) => Number.isFinite(row.close) && row.close > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.date))
      .reverse(); // newest-first → chronological
    const daily = parsed.map((row) => row.close);
    const dailyDates = parsed.map((row) => row.date);

    console.info('[twelve_data:history] RAW', {
      ticker,
      status: j.status ?? 'missing',
      rawRows,
      validCandles: daily.length,
      firstClose: daily[0] ?? null,
      lastClose: daily[daily.length - 1] ?? null,
      firstDate: j.values?.length ? j.values[j.values.length - 1]?.datetime : null,
      lastDate: j.values?.length ? j.values[0]?.datetime : null,
    });

    if (daily.length < 10) {
      console.warn('[twelve_data:history] TOO_FEW_CANDLES', { ticker, validCandles: daily.length, minimum: 10 });
      return null;
    }
    return buildHistory(ticker, daily, null, dailyDates); // TwelveData time_series doesn't include volume
  }

  async getProfile(_ticker: string): Promise<ProviderProfile | null> {
    return null; // Not implemented for TwelveData
  }

  async listSymbols(limit = 50_000): Promise<ProviderSymbol[]> {
    const out: ProviderSymbol[] = [];
    const seen = new Set<string>();
    // ETF endpoint first (prioritized), then stocks.
    const endpoints: { url: string; type: 'ETP' | 'Common Stock' }[] = [
      { url: `${this.base}/etf?country=United States&apikey=${this.apiKey}`,    type: 'ETP' },
      { url: `${this.base}/stocks?country=United States&apikey=${this.apiKey}`, type: 'Common Stock' },
    ];
    for (const { url, type } of endpoints) {
      let r: Response;
      try {
        r = await timedFetch(url);
      } catch {
        continue;
      }
      if (!r.ok) continue;
      const j = (await r.json()) as { data?: Array<{ symbol?: string; name?: string; exchange?: string; mic_code?: string }> };
      for (const row of j.data ?? []) {
        const symbol = String(row.symbol ?? '').toUpperCase().trim();
        // TwelveData uses mic_code or exchange field
        const mic = String(row.mic_code ?? row.exchange ?? '').toUpperCase().trim() || null;
        if (!isImportableTicker(symbol)) continue;
        // Only NYSE and NASDAQ
        if (mic !== 'XNYS' && mic !== 'XNAS' && mic !== 'NYSE' && mic !== 'NASDAQ') continue;
        if (seen.has(symbol)) continue;
        seen.add(symbol);
        out.push({ ticker: symbol, name: row.name?.trim() || null, mic, type });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }
}

/**
 * Build the ProviderHistory shape from a chronological array of daily closes.
 *
 * Weekly construction: sample every 5th day counting back from the end of the
 * array. This guarantees the most-recent weekly data point is always the latest
 * available close, so indicators computed on the current (incomplete) week are
 * based on the most recent price rather than a 5-day-old one.
 */
function buildHistory(
  ticker: string,
  daily: number[],
  volume: number | null = null,
  dailyDates: string[] = [],
): ProviderHistory {
  const weekly: number[] = [];
  if (dailyDates.length === daily.length) {
    let currentWeekKey: string | null = null;
    for (let i = 0; i < daily.length; i++) {
      const weekKey = isoWeekKeyFromDateString(dailyDates[i]);
      if (!weekKey) continue;
      if (weekKey !== currentWeekKey) {
        weekly.push(daily[i]);
        currentWeekKey = weekKey;
      } else {
        // Same week: keep replacing so this lands on the week's last trading close.
        weekly[weekly.length - 1] = daily[i];
      }
    }
  }
  if (weekly.length === 0) {
    // Fallback for providers that don't give reliable dates.
    for (let i = daily.length - 1; i >= 0; i -= 5) {
      weekly.push(daily[i]);
    }
    weekly.reverse(); // restore chronological order
  }

  // 52-week high from the most-recent 252 trading sessions.
  const lookback = Math.min(252, daily.length);
  const high52w = lookback > 0 ? Math.max(...daily.slice(-lookback)) : 0;
  return { ticker, dailyCloses: daily, weeklyCloses: weekly, high52w, volume };
}

function isoWeekKeyFromDateString(dateStr: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // ISO week date algorithm.
  const day = d.getUTCDay() || 7; // 1..7 (Mon..Sun)
  d.setUTCDate(d.getUTCDate() + 4 - day); // nearest Thursday defines ISO year
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

// -----------------------------------------------------------------------------
// Financial Modeling Prep (FMP)
// -----------------------------------------------------------------------------
export class FmpProvider implements MarketDataProvider {
  readonly name = 'fmp';
  private readonly base = 'https://financialmodelingprep.com/stable';
  constructor(private readonly apiKey: string) {}

  async getQuote(ticker: string): Promise<ProviderQuote | null> {
    const url = `${this.base}/quote?symbol=${encodeURIComponent(ticker)}&apikey=${this.apiKey}`;
    let r: Response;
    try { r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }); } catch (e) {
      console.warn('[fmp:quote] NETWORK_ERROR', { ticker, error: (e as Error).message });
      return null;
    }
    if (r.status === 429) { console.warn('[fmp:quote] RATE_LIMITED', { ticker }); return null; }
    if (!r.ok) { console.warn('[fmp:quote] HTTP_ERROR', { ticker, status: r.status }); return null; }
    const j = (await r.json()) as Array<{ price?: number }>;
    const price = Array.isArray(j) && j[0]?.price && Number.isFinite(j[0].price) && j[0].price > 0 ? j[0].price : null;
    console.info('[fmp:quote] RAW', { ticker, price });
    if (!price) { console.warn('[fmp:quote] NO_PRICE', { ticker }); return null; }
    return { ticker, currentPrice: price, fetchedAt: new Date().toISOString() };
  }

  async getHistory(ticker: string): Promise<ProviderHistory | null> {
    const url = `${this.base}/historical-price-eod/full?symbol=${encodeURIComponent(ticker)}&apikey=${this.apiKey}`;
    let r: Response;
    try { r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }); } catch (e) {
      console.warn('[fmp:history] NETWORK_ERROR', { ticker, error: (e as Error).message });
      return null;
    }
    if (r.status === 429) { console.warn('[fmp:history] RATE_LIMITED', { ticker }); return null; }
    if (!r.ok) { console.warn('[fmp:history] HTTP_ERROR', { ticker, status: r.status }); return null; }
    const j = (await r.json()) as { historical?: Array<{ close?: number; volume?: number; date?: string }> };
    const raw = j.historical ?? [];
    // FMP returns newest-first — reverse for chronological order
    const parsed = raw
      .map((d) => ({ close: Number(d.close), date: String(d.date ?? '').slice(0, 10) }))
      .filter((row) => Number.isFinite(row.close) && row.close > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.date))
      .reverse();
    const daily = parsed.map((row) => row.close);
    const dailyDates = parsed.map((row) => row.date);
    const vols = raw.map((d) => Number(d.volume)).reverse();
    const latestVolume = vols.length > 0 && Number.isFinite(vols[vols.length - 1]) && vols[vols.length - 1] > 0
      ? Math.round(vols[vols.length - 1]) : null;
    console.info('[fmp:history] RAW', { ticker, rawRows: raw.length, validCandles: daily.length, latestVolume });
    if (daily.length < 10) { console.warn('[fmp:history] TOO_FEW_CANDLES', { ticker, validCandles: daily.length }); return null; }
    return buildHistory(ticker, daily, latestVolume, dailyDates);
  }

  async listSymbols(): Promise<ProviderSymbol[]> { return []; }
}

// -----------------------------------------------------------------------------
// Yahoo Finance (public API — no key required)
// -----------------------------------------------------------------------------
/** Suffixes Finnhub / DB often append; Yahoo chart path wants the pure symbol (no .US / .NYSE). */
const YAHOO_STRIP_DOT_SUFFIX = new Set([
  'US',
  'NYSE',
  'NASDAQ',
  'NMS',
  'NYQ',
  'ASE',
  'PCX',
  'ARCA',
  'NASDAQGS',
  'NASDAQCM',
  'OTC',
  'OOTC',
  'PINK',
  'STEX',
  'LSE',
  'TO',
  'TSE',
  'TSX',
  'CN',
  'HK',
  'DE',
  'F',
  'SW',
  'PA',
  'AS',
  'MI',
  'VI',
  'BR',
  'MX',
]);

/**
 * Yahoo v8 chart path: strip trailing exchange segment(s), then replace `.` with `-` for share classes
 * (BF.A → BF-A). Example: BF.A.NYSE → BF.A → BF-A.
 */
function yahooChartSymbol(ticker: string): string {
  let s = ticker.trim().toUpperCase();
  const parts = s.split('.');
  while (parts.length >= 2) {
    const last = parts[parts.length - 1]!;
    if (last.length >= 2 && YAHOO_STRIP_DOT_SUFFIX.has(last)) {
      parts.pop();
      s = parts.join('.');
      continue;
    }
    break;
  }
  return s.replace(/\./g, '-');
}

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};

export class YahooFinanceProvider implements MarketDataProvider {
  readonly name = 'yahoo';
  private readonly base = 'https://query1.finance.yahoo.com/v8/finance/chart';
  // apiKey is unused — Yahoo Finance is public. Stored as a placeholder in api_keys.
  constructor(private readonly _apiKey: string) {}

  private yFetch(url: string): Promise<Response> {
    return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: YAHOO_HEADERS });
  }

  async getQuote(ticker: string): Promise<ProviderQuote | null> {
    const sym = yahooChartSymbol(ticker);
    const url = `${this.base}/${encodeURIComponent(sym)}?interval=1d&range=5d`;
    let r: Response;
    try { r = await this.yFetch(url); } catch (e) {
      console.warn('[yahoo:quote] NETWORK_ERROR', { ticker, error: (e as Error).message });
      return null;
    }
    if (r.status === 429) { console.warn('[yahoo:quote] RATE_LIMITED', { ticker }); return null; }
    if (!r.ok) {
      console.warn('[yahoo:quote] HTTP_ERROR', { ticker, yahooSymbol: sym, status: r.status });
      return null;
    }
    const j = (await r.json()) as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; regularMarketTime?: number } }> } };
    const meta = j.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice && Number.isFinite(meta.regularMarketPrice) && meta.regularMarketPrice > 0 ? meta.regularMarketPrice : null;
    console.info('[yahoo:quote] RAW', { ticker, price });
    if (!price) { console.warn('[yahoo:quote] NO_PRICE', { ticker }); return null; }
    return { ticker, currentPrice: price, fetchedAt: new Date().toISOString() };
  }

  async getHistory(ticker: string): Promise<ProviderHistory | null> {
    const sym = yahooChartSymbol(ticker);
    const url = `${this.base}/${encodeURIComponent(sym)}?interval=1d&range=2y`;
    let r: Response;
    try { r = await this.yFetch(url); } catch (e) {
      console.warn('[yahoo:history] NETWORK_ERROR', { ticker, error: (e as Error).message });
      return null;
    }
    if (r.status === 429) { console.warn('[yahoo:history] RATE_LIMITED', { ticker }); return null; }
    if (!r.ok) {
      console.warn('[yahoo:history] HTTP_ERROR', { ticker, yahooSymbol: sym, status: r.status });
      return null;
    }
    const j = (await r.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: (number | null)[]; volume?: (number | null)[] }> };
        }>;
      };
    };
    const quoteData = j.chart?.result?.[0]?.indicators?.quote?.[0];
    const timestamps = j.chart?.result?.[0]?.timestamp ?? [];
    const closes = quoteData?.close ?? [];
    const vols = quoteData?.volume ?? [];
    const daily: number[] = [];
    const dailyDates: string[] = [];
    for (let i = 0; i < closes.length; i++) {
      const close = closes[i];
      const ts = Number(timestamps[i]);
      if (close === null || !Number.isFinite(close) || close <= 0 || !Number.isFinite(ts) || ts <= 0) continue;
      daily.push(close);
      dailyDates.push(new Date(ts * 1000).toISOString().slice(0, 10));
    }
    const latestVolume = vols.length > 0 && vols[vols.length - 1] != null && Number.isFinite(vols[vols.length - 1]!) && vols[vols.length - 1]! > 0
      ? Math.round(vols[vols.length - 1]!) : null;
    console.info('[yahoo:history] RAW', { ticker, rawRows: closes.length, validCandles: daily.length, latestVolume });
    if (daily.length < 10) { console.warn('[yahoo:history] TOO_FEW_CANDLES', { ticker, validCandles: daily.length }); return null; }
    return buildHistory(ticker, daily, latestVolume, dailyDates);
  }

  async listSymbols(): Promise<ProviderSymbol[]> { return []; }
}

// -----------------------------------------------------------------------------
// Alpha Vantage
// -----------------------------------------------------------------------------
export class AlphaVantageProvider implements MarketDataProvider {
  readonly name = 'alpha_vantage';
  private readonly base = 'https://www.alphavantage.co/query';
  constructor(private readonly apiKey: string) {}

  async getQuote(ticker: string): Promise<ProviderQuote | null> {
    const url = `${this.base}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${this.apiKey}`;
    let r: Response;
    try { r = await timedFetch(url); } catch (e) {
      console.warn('[alpha_vantage:quote] NETWORK_ERROR', { ticker, error: (e as Error).message });
      return null;
    }
    if (!r.ok) { console.warn('[alpha_vantage:quote] HTTP_ERROR', { ticker, status: r.status }); return null; }
    const j = (await r.json()) as { 'Global Quote'?: Record<string, string>; Note?: string; Information?: string };
    if (j.Note || j.Information) { console.warn('[alpha_vantage:quote] RATE_LIMITED', { ticker }); return null; }
    const price = Number(j['Global Quote']?.['05. price']);
    console.info('[alpha_vantage:quote] RAW', { ticker, price: Number.isFinite(price) ? price : null });
    if (!Number.isFinite(price) || price <= 0) { console.warn('[alpha_vantage:quote] NO_PRICE', { ticker }); return null; }
    return { ticker, currentPrice: price, fetchedAt: new Date().toISOString() };
  }

  async getHistory(ticker: string): Promise<ProviderHistory | null> {
    const url = `${this.base}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=full&apikey=${this.apiKey}`;
    let r: Response;
    try { r = await timedFetch(url); } catch (e) {
      console.warn('[alpha_vantage:history] NETWORK_ERROR', { ticker, error: (e as Error).message });
      return null;
    }
    if (!r.ok) { console.warn('[alpha_vantage:history] HTTP_ERROR', { ticker, status: r.status }); return null; }
    const j = (await r.json()) as { 'Time Series (Daily)'?: Record<string, Record<string, string>>; Note?: string; Information?: string };
    if (j.Note || j.Information) { console.warn('[alpha_vantage:history] RATE_LIMITED', { ticker }); return null; }
    const ts = j['Time Series (Daily)'] ?? {};
    const parsed = Object.entries(ts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ close: Number(v['4. close']), date }))
      .filter((row) => Number.isFinite(row.close) && row.close > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.date));
    const daily = parsed.map((row) => row.close);
    const dailyDates = parsed.map((row) => row.date);
    console.info('[alpha_vantage:history] RAW', { ticker, validCandles: daily.length });
    if (daily.length < 10) { console.warn('[alpha_vantage:history] TOO_FEW_CANDLES', { ticker, validCandles: daily.length }); return null; }
    return buildHistory(ticker, daily, null, dailyDates);
  }

  async listSymbols(): Promise<ProviderSymbol[]> { return []; }
}

// -----------------------------------------------------------------------------
// Polygon.io
// -----------------------------------------------------------------------------
export class PolygonProvider implements MarketDataProvider {
  readonly name = 'polygon';
  private readonly base = 'https://api.polygon.io';
  constructor(private readonly apiKey: string) {}

  async getQuote(ticker: string): Promise<ProviderQuote | null> {
    const url = `${this.base}/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?adjusted=true&apikey=${this.apiKey}`;
    let r: Response;
    try { r = await timedFetch(url); } catch (e) {
      console.warn('[polygon:quote] NETWORK_ERROR', { ticker, error: (e as Error).message });
      return null;
    }
    if (r.status === 429) { console.warn('[polygon:quote] RATE_LIMITED', { ticker }); return null; }
    if (!r.ok) { console.warn('[polygon:quote] HTTP_ERROR', { ticker, status: r.status }); return null; }
    const j = (await r.json()) as { results?: Array<{ c?: number; t?: number }> };
    const item = j.results?.[0];
    const price = item?.c && Number.isFinite(item.c) && item.c > 0 ? item.c : null;
    console.info('[polygon:quote] RAW', { ticker, price });
    if (!price) { console.warn('[polygon:quote] NO_PRICE', { ticker }); return null; }
    const fetchedAt = item?.t ? new Date(item.t).toISOString() : new Date().toISOString();
    return { ticker, currentPrice: price, fetchedAt };
  }

  async getHistory(ticker: string): Promise<ProviderHistory | null> {
    const toDate = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const url = `${this.base}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${fromDate}/${toDate}?adjusted=true&limit=400&sort=asc&apikey=${this.apiKey}`;
    let r: Response;
    try { r = await timedFetch(url); } catch (e) {
      console.warn('[polygon:history] NETWORK_ERROR', { ticker, error: (e as Error).message });
      return null;
    }
    if (r.status === 429) { console.warn('[polygon:history] RATE_LIMITED', { ticker }); return null; }
    if (!r.ok) { console.warn('[polygon:history] HTTP_ERROR', { ticker, status: r.status }); return null; }
    const j = (await r.json()) as { results?: Array<{ c?: number; v?: number; t?: number }> };
    const raw = j.results ?? [];
    const parsed = raw
      .map((d) => ({ close: Number(d.c), ts: Number(d.t) }))
      .filter((row) => Number.isFinite(row.close) && row.close > 0 && Number.isFinite(row.ts) && row.ts > 0);
    const daily = parsed.map((row) => row.close);
    const dailyDates = parsed.map((row) => new Date(row.ts).toISOString().slice(0, 10));
    const vols = raw.map((d) => Number(d.v));
    const latestVolume = vols.length > 0 && Number.isFinite(vols[vols.length - 1]) && vols[vols.length - 1] > 0
      ? Math.round(vols[vols.length - 1]) : null;
    console.info('[polygon:history] RAW', { ticker, rawRows: raw.length, validCandles: daily.length, latestVolume });
    if (daily.length < 10) { console.warn('[polygon:history] TOO_FEW_CANDLES', { ticker, validCandles: daily.length }); return null; }
    return buildHistory(ticker, daily, latestVolume, dailyDates);
  }

  async listSymbols(): Promise<ProviderSymbol[]> { return []; }
}

function isImportableTicker(symbol: string): boolean {
  if (!symbol) return false;
  if (symbol.length < 1 || symbol.length > 12) return false;
  return /^[A-Z0-9.\-]+$/.test(symbol);
}
