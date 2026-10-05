import type { ClientCapBucket } from '@/lib/screening/client-ticker-meta';
import { CLIENT_CAP_LABELS } from '@/lib/screening/client-ticker-meta';

/** Market-cap buckets from client Sector and Industry Mapping.xlsx. */
export type MarketCapBucket = ClientCapBucket;

export const MARKET_CAP_LABELS: Record<MarketCapBucket, string> = CLIENT_CAP_LABELS;

export type ScreenerIndexId = 'sp500' | 'nasdaq100';

export const SCREENER_INDEX_LABELS: Record<ScreenerIndexId, string> = {
  sp500: 'S&P 500',
  nasdaq100: 'Nasdaq 100',
};

/** Extra fields attached to RS points for screener filtering. */
export type ScreenerMeta = {
  marketCap: MarketCapBucket | null;
  /** Client mapping sector (preferred), else GICS / sector-ETF label. */
  sector: string | null;
  /** Client mapping industry (preferred), else GICS sub-industry. */
  industry: string | null;
  sectorEtf: string | null;
  inSp500: boolean;
  inNasdaq100: boolean;
};
