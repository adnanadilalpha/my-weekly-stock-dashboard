/** Universe / market-cap style buckets used by Quadrant Screener filters. */
export type MarketCapBucket = 'large' | 'mid_small' | 'sector_etf' | 'segment';

export const MARKET_CAP_LABELS: Record<MarketCapBucket, string> = {
  large: 'Large caps',
  mid_small: 'Mid / small',
  sector_etf: 'Sector ETFs',
  segment: 'Market segments',
};

export type ScreenerIndexId = 'sp500' | 'nasdaq100';

export const SCREENER_INDEX_LABELS: Record<ScreenerIndexId, string> = {
  sp500: 'S&P 500',
  nasdaq100: 'Nasdaq 100',
};

/** Extra fields attached to RS points for screener filtering. */
export type ScreenerMeta = {
  marketCap: MarketCapBucket;
  /** GICS sector or sector-ETF label. */
  sector: string | null;
  /** GICS sub-industry when known. */
  industry: string | null;
  sectorEtf: string | null;
  inSp500: boolean;
  inNasdaq100: boolean;
};
