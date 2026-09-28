import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { USER_TICKER_ACTIVE_OR } from '@/lib/queries/user-ticker-visibility';
import type { RelativeStrengthPoint } from '@/lib/relative-strength';
import { fetchPriceHistory } from '@/lib/queries/price-history';

type RsRow = {
  ticker: string;
  daily_price_vs_21ema: number | null;
  weekly_price_vs_30ema: number | null;
  daily_rating: string | null;
  daily_current_price: number | null;
  sector_name?: string | null;
  company_name?: string | null;
  sector_etf?: string | null;
};

const RS_SELECT =
  'ticker, daily_price_vs_21ema, weekly_price_vs_30ema, daily_rating, daily_current_price';

/** Standard EMA (oldest → newest closes), matching edge compute. */
function ema(values: number[], period: number): number | null {
  if (values.length < period || period < 1) return null;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

function pctFrom(price: number, ref: number | null): number | null {
  if (ref == null || !Number.isFinite(price) || !Number.isFinite(ref) || ref === 0) return null;
  return (price - ref) / ref;
}

/** When edge fields are missing, compute from price_history. */
async function fillMissingEma(points: RelativeStrengthPoint[]): Promise<RelativeStrengthPoint[]> {
  return Promise.all(
    points.map(async (p) => {
      const need21 = p.pctFrom21DayEma == null || !Number.isFinite(p.pctFrom21DayEma);
      const need30 = p.pctFrom30WeekEma == null || !Number.isFinite(p.pctFrom30WeekEma);
      if (!need21 && !need30) return p;

      try {
        let pct21 = p.pctFrom21DayEma;
        let pct30 = p.pctFrom30WeekEma;
        let price = p.dailyCurrentPrice;

        if (need21) {
          const bars = await fetchPriceHistory(p.ticker, 'daily', 80);
          const closes = bars.map((b) => b.close).filter((n) => Number.isFinite(n));
          if (closes.length >= 21) {
            price = price ?? closes[closes.length - 1];
            const e21 = ema(closes, 21);
            pct21 = pctFrom(closes[closes.length - 1], e21);
          }
        }

        if (need30) {
          const bars = await fetchPriceHistory(p.ticker, 'weekly', 40);
          const closes = bars.map((b) => b.close).filter((n) => Number.isFinite(n));
          if (closes.length >= 30) {
            const last = closes[closes.length - 1];
            price = price ?? last;
            const e30 = ema(closes, 30);
            pct30 = pctFrom(last, e30);
          }
        }

        return {
          ...p,
          pctFrom21DayEma: pct21,
          pctFrom30WeekEma: pct30,
          dailyCurrentPrice: price,
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
    pctFrom21DayEma: row.daily_price_vs_21ema,
    pctFrom30WeekEma: row.weekly_price_vs_30ema,
    dailyRating: row.daily_rating,
    dailyCurrentPrice: row.daily_current_price,
    highlight,
  };
}

export async function fetchSectorRelativeStrength(): Promise<RelativeStrengthPoint[]> {
  const { data, error } = await supabase
    .from('sectors')
    .select(`${RS_SELECT}, sector_name`)
    .or(USER_TICKER_ACTIVE_OR)
    .order('ticker');
  if (error) throw error;
  return fillMissingEma((data ?? []).map((r) => mapRow(r as RsRow)));
}

export async function fetchPeerRelativeStrength(
  sectorEtf: string,
  highlightTicker?: string,
): Promise<RelativeStrengthPoint[]> {
  const etf = sectorEtf.toUpperCase();
  const [peersRes, sectorRes, megaRes] = await Promise.all([
    supabase
      .from('other_stocks')
      .select(`${RS_SELECT}, company_name, sector_etf`)
      .or(USER_TICKER_ACTIVE_OR)
      .eq('sector_etf', etf),
    supabase
      .from('sectors')
      .select(`${RS_SELECT}, sector_name`)
      .eq('ticker', etf)
      .maybeSingle(),
    supabase
      .from('mega_caps')
      .select(`${RS_SELECT}, company_name, sector_etf`)
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
  return fillMissingEma(points);
}

export async function fetchTickersRelativeStrength(tickers: string[]): Promise<RelativeStrengthPoint[]> {
  const uniq = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];
  if (uniq.length === 0) return [];

  const tables = ['market_segments', 'sectors', 'mega_caps', 'other_stocks'] as const;
  const byTicker = new Map<string, RelativeStrengthPoint>();

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select(RS_SELECT).in('ticker', uniq);
    if (error) throw error;
    for (const r of data ?? []) {
      const mapped = mapRow(r as RsRow);
      const key = mapped.ticker.toUpperCase();
      // First table in lookup order wins (market_segments → …)
      if (!byTicker.has(key)) byTicker.set(key, mapped);
    }
  }

  const ordered: RelativeStrengthPoint[] = [];
  for (const t of uniq) {
    const p = byTicker.get(t);
    if (p) ordered.push(p);
  }
  return fillMissingEma(ordered);
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
