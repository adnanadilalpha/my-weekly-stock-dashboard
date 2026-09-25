import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { USER_TICKER_ACTIVE_OR } from '@/lib/queries/user-ticker-visibility';
import type { RelativeStrengthPoint } from '@/lib/relative-strength';
import { fetchPriceHistory } from '@/lib/queries/price-history';

type RsRow = {
  ticker: string;
  pct_from_sma50: number | null;
  pct_from_sma200: number | null;
  daily_rating: string | null;
  daily_current_price: number | null;
  sector_name?: string | null;
  company_name?: string | null;
  sector_etf?: string | null;
};

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

/** When edge has not backfilled SMA %, compute from price_history. */
async function fillMissingSma(points: RelativeStrengthPoint[]): Promise<RelativeStrengthPoint[]> {
  return Promise.all(
    points.map(async (p) => {
      if (
        p.pctFromSma50 != null &&
        p.pctFromSma200 != null &&
        Number.isFinite(p.pctFromSma50) &&
        Number.isFinite(p.pctFromSma200)
      ) {
        return p;
      }
      try {
        const bars = await fetchPriceHistory(p.ticker, 'daily', 220);
        const closes = bars.map((b) => b.close).filter((n) => Number.isFinite(n));
        if (closes.length < 50) return p;
        const price = closes[closes.length - 1];
        const s50 = sma(closes, 50);
        const s200 = closes.length >= 200 ? sma(closes, 200) : null;
        return {
          ...p,
          pctFromSma50:
            p.pctFromSma50 != null
              ? p.pctFromSma50
              : s50 && s50 !== 0
                ? (price - s50) / s50
                : null,
          pctFromSma200:
            p.pctFromSma200 != null
              ? p.pctFromSma200
              : s200 && s200 !== 0
                ? (price - s200) / s200
                : null,
          dailyCurrentPrice: p.dailyCurrentPrice ?? price,
        };
      } catch {
        return p;
      }
    }),
  );
}

function mapRow(row: RsRow, highlight = false): RelativeStrengthPoint {
  return {
    ticker: row.ticker,
    label: row.sector_name ?? row.company_name ?? row.ticker,
    pctFromSma50: row.pct_from_sma50,
    pctFromSma200: row.pct_from_sma200,
    dailyRating: row.daily_rating,
    dailyCurrentPrice: row.daily_current_price,
    highlight,
  };
}

export async function fetchSectorRelativeStrength(): Promise<RelativeStrengthPoint[]> {
  const { data, error } = await supabase
    .from('sectors')
    .select('ticker, pct_from_sma50, pct_from_sma200, daily_rating, daily_current_price, sector_name')
    .or(USER_TICKER_ACTIVE_OR)
    .order('ticker');
  if (error) throw error;
  return fillMissingSma((data ?? []).map((r) => mapRow(r as RsRow)));
}

export async function fetchPeerRelativeStrength(
  sectorEtf: string,
  highlightTicker?: string,
): Promise<RelativeStrengthPoint[]> {
  const etf = sectorEtf.toUpperCase();
  const [peersRes, sectorRes, megaRes] = await Promise.all([
    supabase
      .from('other_stocks')
      .select('ticker, pct_from_sma50, pct_from_sma200, daily_rating, daily_current_price, company_name, sector_etf')
      .or(USER_TICKER_ACTIVE_OR)
      .eq('sector_etf', etf),
    supabase
      .from('sectors')
      .select('ticker, pct_from_sma50, pct_from_sma200, daily_rating, daily_current_price, sector_name')
      .eq('ticker', etf)
      .maybeSingle(),
    supabase
      .from('mega_caps')
      .select('ticker, pct_from_sma50, pct_from_sma200, daily_rating, daily_current_price, company_name, sector_etf')
      .or(USER_TICKER_ACTIVE_OR)
      .eq('sector_etf', etf),
  ]);

  if (peersRes.error) throw peersRes.error;
  if (megaRes.error) throw megaRes.error;

  const points: RelativeStrengthPoint[] = [];
  if (sectorRes.data) {
    points.push(mapRow(sectorRes.data as RsRow, true));
  }
  for (const r of [...(megaRes.data ?? []), ...(peersRes.data ?? [])]) {
    const row = r as RsRow;
    points.push(mapRow(row, row.ticker.toUpperCase() === highlightTicker?.toUpperCase()));
  }
  return fillMissingSma(points);
}

export async function fetchTickersRelativeStrength(tickers: string[]): Promise<RelativeStrengthPoint[]> {
  const uniq = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];
  if (uniq.length === 0) return [];

  const tables = ['sectors', 'mega_caps', 'other_stocks', 'market_segments'] as const;
  const results: RelativeStrengthPoint[] = [];

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('ticker, pct_from_sma50, pct_from_sma200, daily_rating, daily_current_price')
      .in('ticker', uniq);
    if (error) throw error;
    for (const r of data ?? []) {
      results.push(mapRow(r as RsRow));
    }
  }

  // Deduplicate by ticker (first table wins — mirrors getTickerData order for segments first if we reverse)
  const seen = new Set<string>();
  const ordered: RelativeStrengthPoint[] = [];
  // Prefer market_segments → sectors → mega → other: rebuild
  const byTicker = new Map(results.map((p) => [p.ticker.toUpperCase(), p]));
  for (const t of uniq) {
    const p = byTicker.get(t);
    if (p && !seen.has(t)) {
      seen.add(t);
      ordered.push(p);
    }
  }
  return fillMissingSma(ordered);
}

export function useSectorRelativeStrength() {
  const [points, setPoints] = useState<RelativeStrengthPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPoints(await fetchSectorRelativeStrength());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sector rotation');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { points, loading, error, reload };
}

export function usePeerRelativeStrength(sectorEtf: string | null | undefined, highlightTicker?: string) {
  const [points, setPoints] = useState<RelativeStrengthPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sectorEtf) {
      setPoints([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPeerRelativeStrength(sectorEtf, highlightTicker)
      .then((p) => {
        if (!cancelled) setPoints(p);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load peers');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sectorEtf, highlightTicker]);

  return { points, loading, error };
}
