import { SP500_BY_TICKER } from '@/lib/screening/sp500-constituents';
import { NASDAQ100_TICKERS } from '@/lib/screening/nasdaq100-constituents';
import { sectorEtfLabel } from '@/lib/screening/sector-labels';
import type { MarketCapBucket, ScreenerMeta } from '@/lib/screening/types';

export type UniverseSourceTable =
  | 'market_segments'
  | 'sectors'
  | 'mega_caps'
  | 'other_stocks';

function marketCapForTable(table: UniverseSourceTable): MarketCapBucket {
  if (table === 'mega_caps') return 'large';
  if (table === 'sectors') return 'sector_etf';
  if (table === 'market_segments') return 'segment';
  return 'mid_small';
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
  const spMeta = keys.map((k) => SP500_BY_TICKER[k]).find(Boolean) ?? null;
  const inSp500 = spMeta != null;
  const inNasdaq100 = keys.some((k) => NASDAQ100_TICKERS.has(k));
  const etf = input.sectorEtf?.trim().toUpperCase() || null;
  const sector =
    spMeta?.sector ??
    sectorEtfLabel(etf) ??
    (input.sourceTable === 'sectors' ? sectorEtfLabel(input.ticker) : null);
  const industry = spMeta?.industry ?? (input.industry?.trim() || null);

  return {
    marketCap: marketCapForTable(input.sourceTable),
    sector,
    industry,
    sectorEtf: etf,
    inSp500,
    inNasdaq100,
  };
}
