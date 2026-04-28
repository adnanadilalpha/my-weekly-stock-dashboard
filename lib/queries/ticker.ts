import { getMarketSegmentByTicker, MarketSegment } from './segments';
import { getSectorByTicker, Sector } from './sectors';
import { getMegaCapByTicker, MegaCap } from './mega-caps';
import { getOtherStockByTicker, OtherStock } from './other-stocks';
import { supabase } from '../supabase-client';
import { USER_TICKER_ACTIVE_OR } from './user-ticker-visibility';

export type TickerData = MarketSegment | Sector | MegaCap | OtherStock;
export type TickerType = 'segment' | 'sector' | 'mega_cap' | 'other_stock';

export interface TickerResult {
  data: TickerData | null;
  type: TickerType | null;
}

const POSTGREST_PAGE = 1000;

function tickerLookupVariants(raw: string): string[] {
  const u = raw.trim().toUpperCase();
  if (!u) return [];
  const dotted = u.replace(/-/g, '.');
  const hyphened = u.replace(/\./g, '-');
  return [...new Set([u, dotted, hyphened])];
}

/** Loosen search so BF.A matches BF-A and vice versa (display names unchanged). */
function normTickerSearchKey(s: string): string {
  return s.trim().toLowerCase().replace(/-/g, '.');
}

export function tickerMatchesSearchQuery(item: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const ql = q.toLowerCase();
  const tl = item.toLowerCase();
  if (tl.includes(ql)) return true;
  const tKey = normTickerSearchKey(item);
  const qKey = normTickerSearchKey(q);
  return tKey.includes(qKey);
}

async function selectAllTickersFromTable(table: string): Promise<string[]> {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('ticker')
      .or(USER_TICKER_ACTIVE_OR)
      .range(from, from + POSTGREST_PAGE - 1);

    if (error) {
      console.error(`Error fetching tickers from ${table}:`, error);
      break;
    }

    const rows = data ?? [];
    for (const r of rows) {
      const t = r?.ticker;
      if (t != null && String(t).trim() !== '') out.push(String(t).trim());
    }
    if (rows.length < POSTGREST_PAGE) break;
    from += POSTGREST_PAGE;
  }
  return out;
}

/**
 * Unified function to find and fetch any ticker across all tables
 */
export async function getTickerData(ticker: string): Promise<TickerResult> {
  for (const t of tickerLookupVariants(ticker)) {
    const segment = await getMarketSegmentByTicker(t);
    if (segment) {
      return { data: segment, type: 'segment' };
    }

    const sector = await getSectorByTicker(t);
    if (sector) {
      return { data: sector, type: 'sector' };
    }

    const megaCap = await getMegaCapByTicker(t);
    if (megaCap) {
      return { data: megaCap, type: 'mega_cap' };
    }

    const otherStock = await getOtherStockByTicker(t);
    if (otherStock) {
      return { data: otherStock, type: 'other_stock' };
    }
  }

  return { data: null, type: null };
}

/**
 * Get all available tickers from all tables
 */
export async function getAllTickers(): Promise<string[]> {
  const [segmentsTickers, sectorsTickers, megaCapsTickers, otherStocksTickers] =
    await Promise.all([
      selectAllTickersFromTable('market_segments'),
      selectAllTickersFromTable('sectors'),
      selectAllTickersFromTable('mega_caps'),
      selectAllTickersFromTable('other_stocks'),
    ]);

  const allTickers = [
    ...segmentsTickers,
    ...sectorsTickers,
    ...megaCapsTickers,
    ...otherStocksTickers,
  ];

  return [...new Set(allTickers)].sort();
}

