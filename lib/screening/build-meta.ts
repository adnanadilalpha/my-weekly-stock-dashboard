import { SP500_BY_TICKER } from '@/lib/screening/sp500-constituents';
import { NASDAQ100_TICKERS } from '@/lib/screening/nasdaq100-constituents';
import { getClientTickerMeta } from '@/lib/screening/client-ticker-meta';
import { sectorEtfLabel } from '@/lib/screening/sector-labels';
import type { MarketCapBucket, ScreenerMeta } from '@/lib/screening/types';

export type UniverseSourceTable =
  | 'market_segments'
  | 'sectors'
  | 'mega_caps'
  | 'other_stocks';

/** Fallback only when ticker is missing from the client mapping file. */
function marketCapFallback(table: UniverseSourceTable): MarketCapBucket {
  if (table === 'mega_caps') return 'Large Cap';
  if (table === 'sectors' || table === 'market_segments') return 'ETF';
  return 'Small Cap';
}

function lookupKeys(ticker: string): string[] {
  const u = ticker.trim().toUpperCase();
  if (!u) return [];
  return [...new Set([u, u.replace(/-/g, '.'), u.replace(/\./g, '-')])];
}

export function buildScreenerMeta(input: {
  ticker: string;
  sourceTable: UniverseSourceTable;
  sectorEtf?: string | null;
  industry?: string | null;
}): ScreenerMeta {
  const keys = lookupKeys(input.ticker);
  const client = getClientTickerMeta(input.ticker);
  const spMeta = keys.map((k) => SP500_BY_TICKER[k]).find(Boolean) ?? null;
  const inSp500 = spMeta != null;
  const inNasdaq100 = keys.some((k) => NASDAQ100_TICKERS.has(k));
  const etf = input.sectorEtf?.trim().toUpperCase() || null;

  // Prefer Farouk's Sector / Industry / Cap mapping when present.
  const sector =
    client?.sector ||
    spMeta?.sector ||
    sectorEtfLabel(etf) ||
    (input.sourceTable === 'sectors' ? sectorEtfLabel(input.ticker) : null);

  const industry =
    client?.industry || spMeta?.industry || (input.industry?.trim() || null);

  const marketCap: MarketCapBucket | null =
    client?.cap ?? marketCapFallback(input.sourceTable);

  return {
    marketCap,
    sector: sector || null,
    industry: industry || null,
    sectorEtf: etf,
    inSp500,
    inNasdaq100,
  };
}
