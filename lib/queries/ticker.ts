import { getMarketSegmentByTicker, MarketSegment } from './segments';
import { getSectorByTicker, Sector } from './sectors';
import { getMegaCapByTicker, MegaCap } from './mega-caps';
import { getOtherStockByTicker, OtherStock } from './other-stocks';
import { supabase } from '../supabase-client';

export type TickerData = MarketSegment | Sector | MegaCap | OtherStock;
export type TickerType = 'segment' | 'sector' | 'mega_cap' | 'other_stock';

export interface TickerResult {
  data: TickerData | null;
  type: TickerType | null;
}

/**
 * Unified function to find and fetch any ticker across all tables
 */
export async function getTickerData(ticker: string): Promise<TickerResult> {
  const upperTicker = ticker.toUpperCase();

  // Try market segments first
  const segment = await getMarketSegmentByTicker(upperTicker);
  if (segment) {
    return { data: segment, type: 'segment' };
  }

  // Try sectors
  const sector = await getSectorByTicker(upperTicker);
  if (sector) {
    return { data: sector, type: 'sector' };
  }

  // Try mega caps
  const megaCap = await getMegaCapByTicker(upperTicker);
  if (megaCap) {
    return { data: megaCap, type: 'mega_cap' };
  }

  // Try other stocks
  const otherStock = await getOtherStockByTicker(upperTicker);
  if (otherStock) {
    return { data: otherStock, type: 'other_stock' };
  }

  return { data: null, type: null };
}

/**
 * Get all available tickers from all tables
 */
export async function getAllTickers(): Promise<string[]> {
  const { data: segmentsData } = await supabase.from('market_segments').select('ticker');
  const { data: sectorsData } = await supabase.from('sectors').select('ticker');
  const { data: megaCapsData } = await supabase.from('mega_caps').select('ticker');
  const { data: otherStocksData } = await supabase.from('other_stocks').select('ticker');

  const allTickers = [
    ...(segmentsData?.map(s => s.ticker) || []),
    ...(sectorsData?.map(s => s.ticker) || []),
    ...(megaCapsData?.map(s => s.ticker) || []),
    ...(otherStocksData?.map(s => s.ticker) || [])
  ];

  return [...new Set(allTickers)].sort();
}

