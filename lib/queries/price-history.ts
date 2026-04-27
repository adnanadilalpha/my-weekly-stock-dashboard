import { supabase } from '../supabase-client';

export type PriceBar = {
  date: string;  // YYYY-MM-DD
  close: number;
};

function isoWeekKey(dateStr: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // nearest Thursday
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Fetch the last `limit` closes for a ticker + interval from price_history.
 * Returns bars in chronological order (oldest first).
 */
export async function fetchPriceHistory(
  ticker: string,
  interval: 'daily' | 'weekly',
  limit = 100,
): Promise<PriceBar[]> {
  const queryLimit = interval === 'weekly' ? Math.max(limit * 8, 240) : limit;
  const { data, error } = await supabase
    .from('price_history')
    .select('bar_date, close')
    .eq('ticker', ticker.toUpperCase())
    .eq('interval', interval)
    .order('bar_date', { ascending: false })
    .limit(queryLimit);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  const rows = (data as { bar_date: string; close: string | number }[]).map((row) => ({
    date: row.bar_date,
    close: Number(row.close),
  }));

  if (interval === 'weekly') {
    // Keep only one bar per ISO week (the most recent bar_date for that week).
    const byWeek = new Map<string, PriceBar>();
    for (const row of rows) {
      const key = isoWeekKey(row.date);
      if (!key) continue;
      if (!byWeek.has(key)) byWeek.set(key, row);
    }
    const dedupedDesc = Array.from(byWeek.values());
    return dedupedDesc.slice(0, limit).reverse();
  }

  // Daily: reverse to chronological order.
  return rows.slice(0, limit).reverse();
}
