import { supabase } from '../supabase-client';

export type PriceBar = {
  date: string;  // YYYY-MM-DD
  close: number;
};

/**
 * Fetch the last `limit` closes for a ticker + interval from price_history.
 * Returns bars in chronological order (oldest first).
 */
export async function fetchPriceHistory(
  ticker: string,
  interval: 'daily' | 'weekly',
  limit = 100,
): Promise<PriceBar[]> {
  const { data, error } = await supabase
    .from('price_history')
    .select('bar_date, close')
    .eq('ticker', ticker.toUpperCase())
    .eq('interval', interval)
    .order('bar_date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  // Reverse to chronological order.
  return (data as { bar_date: string; close: string | number }[])
    .reverse()
    .map((row) => ({ date: row.bar_date, close: Number(row.close) }));
}
