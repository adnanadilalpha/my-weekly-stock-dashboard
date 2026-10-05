import {
  FAROUK_SECTOR_TO_ETF,
  faroukSectorEtf,
  getClientTickerMeta,
} from './client-ticker-meta';
import { SECTOR_ETF_LABELS, sectorEtfLabel } from './sector-labels';

/** Known sector ETF tickers used as the secondary benchmark for stocks. */
export const SECTOR_ETF_TICKERS = new Set([
  ...Object.keys(SECTOR_ETF_LABELS),
  ...Object.values(FAROUK_SECTOR_TO_ETF),
  'SMH',
]);

/** Display labels aligned with Farouk's sector naming. */
export const SECTOR_ETF_DISPLAY_NAMES: Record<string, string> = {
  XLY: '$XLY (Consumer Cyclical)',
  XLP: '$XLP (Consumer Defensive)',
  XLC: '$XLC (Communication Services)',
  XLE: '$XLE (Energy)',
  XLF: '$XLF (Financial)',
  XLV: '$XLV (Healthcare)',
  XLI: '$XLI (Industrials)',
  XLB: '$XLB (Basic Materials)',
  XLRE: '$XLRE (Real Estate)',
  XLK: '$XLK (Technology)',
  XLU: '$XLU (Utilities)',
  SMH: '$SMH (Semiconductors)',
};

export function normalizeSectorEtf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().toUpperCase();
  return SECTOR_ETF_TICKERS.has(t) ? t : null;
}

export function sectorEtfFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  return faroukSectorEtf(name) ?? normalizeSectorEtf(name);
}

export function sectorEtfDisplayName(etf: string): string {
  const u = etf.trim().toUpperCase();
  return SECTOR_ETF_DISPLAY_NAMES[u] ?? `$${u} (${sectorEtfLabel(u) ?? u})`;
}

/**
 * Farouk rule — other stocks only (not segment / sector / mega-cap / ETF pages):
 * 1st benchmark = SPY, 2nd = sector ETF from his sector→ETF table.
 */
export function resolveFaroukStockSectorEtf(ticker: string): string | null {
  const meta = getClientTickerMeta(ticker);
  if (!meta) return null;
  if (meta.cap === 'ETF') return null;
  return faroukSectorEtf(meta.sector);
}

/**
 * Resolve sector ETF for a stock row.
 * Prefer Farouk sector mapping; fall back to DB `sector_etf` if mapping missing.
 */
export function resolveStockSectorEtf(input: {
  ticker: string;
  sectorEtf?: string | null;
  secondBenchmarkTicker?: string | null;
}): string | null {
  const fromFarouk = resolveFaroukStockSectorEtf(input.ticker);
  if (fromFarouk) return fromFarouk;

  const fromField = normalizeSectorEtf(input.sectorEtf);
  if (fromField) return fromField;

  return normalizeSectorEtf(input.secondBenchmarkTicker);
}

/** Leading / lagging vs a benchmark (same thresholds as the collect edge). */
export function benchmarkComparisonLabel(
  tickerRet1m: number | null,
  tickerRet3m: number | null,
  benchRet1m: number | null,
  benchRet3m: number | null,
  benchTicker: string,
  leading = 0.03,
  lagging = 0.03,
): string {
  const sym = benchTicker.trim().toUpperCase() || 'BENCH';
  if (
    tickerRet1m == null ||
    tickerRet3m == null ||
    benchRet1m == null ||
    benchRet3m == null ||
    !Number.isFinite(tickerRet1m) ||
    !Number.isFinite(tickerRet3m) ||
    !Number.isFinite(benchRet1m) ||
    !Number.isFinite(benchRet3m)
  ) {
    return `$${sym}: In line`;
  }
  const score = (diff: number) => {
    if (diff > leading) return 3;
    if (diff < -lagging) return 0;
    return 1;
  };
  const total = score(tickerRet1m - benchRet1m) + score(tickerRet3m - benchRet3m);
  if (total > 4) return `$${sym}: Leading`;
  if (total <= 1.1) return `$${sym}: Lagging`;
  return `$${sym}: In line`;
}
