import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';

/** One row from performance_recap (column_1..column_16) */
export interface PerformanceRecapRow {
  row_index: number;
  column_1: string | null;
  column_2: string | null;
  column_3: string | null;
  column_4: string | null;
  column_5: string | null;
  column_6: string | null;
  column_7: string | null;
  column_8: string | null;
  column_9: string | null;
  column_10: string | null;
  column_11: string | null;
  column_12: string | null;
  column_13: string | null;
  column_14: string | null;
  column_15: string | null;
  column_16: string | null;
}

/** Portfolio names we show in UI (column_2 in performance_recap); trim for match */
export const PORTFOLIO_NAMES = {
  DOW30: 'Dow Jones 30',
  LARGE_CAPS: 'US Large Caps',
  NASDAQ100: 'Nasdaq 100',
  MACRO_ETF: 'Macro ETF',
  MACRO_2_3X: 'Macro 2-3xETF',
} as const;

/** Group headers as in recap */
export const GROUP_WEEKLY_MOMENTUM = 'WEEKLY MOMENTUM PICKS';
export const GROUP_ETF = 'ETF PORTFOLIOS';

/** Matches column_2 from sheet (exact or with leading/trailing spaces) */
const RECAP_NAMES_SET: Set<string> = new Set([
  PORTFOLIO_NAMES.DOW30,
  PORTFOLIO_NAMES.LARGE_CAPS,
  PORTFOLIO_NAMES.NASDAQ100,
  PORTFOLIO_NAMES.MACRO_ETF,
  PORTFOLIO_NAMES.MACRO_2_3X,
  // Combined performance row – include both expected spellings just in case
  'COMBINED PERFORMAN',
  'COMBINED PERFORMANCE',
  '  Macro ETF',      // sheet has leading spaces
  '  Macro 2-3xETF',
]);

/** Normalize column_2 for matching (trim and accept "  Macro ETF" etc.) */
function normalizeName(val: string | null): string {
  if (val == null) return '';
  return String(val).trim();
}

export function usePerformanceRecap() {
  const [rows, setRows] = useState<PerformanceRecapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: e } = await supabase
        .from('performance_recap')
        .select('*')
        .order('row_index', { ascending: true });
      if (e) throw e;
      setRows((data as PerformanceRecapRow[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch performance recap'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /** Get column_2 from a row (Supabase returns snake_case) */
  function getCol2(row: PerformanceRecapRow): string | null {
    const r = row as unknown as Record<string, unknown>;
    return (r.column_2 ?? r.column2 ?? null) as string | null;
  }

  /** Only rows that are one of our portfolios or combined performance (by column_2, trimmed) */
  const portfolioRows = rows.filter((r) => RECAP_NAMES_SET.has(normalizeName(getCol2(r))));

  return { rows, portfolioRows, loading, error, refetch: fetchData };
}

/** One row from a portfolio sheet table (row_index + col_1..col_N) */
export type PortfolioSheetRow = Record<string, unknown> & { row_index: number };

const PORTFOLIO_TABLE_MAP: Record<string, string> = {
  dow30: 'dow30_picks',
  'large-caps': 'large_caps_picks',
  nasdaq100: 'nasdaq100_picks',
  'macro-etf': 'macro_etf',
  'macro-3x': 'macro_3x_etf',
};

export function usePortfolioSheet(portfolioPage: string | null) {
  const [rows, setRows] = useState<PortfolioSheetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const tableName = portfolioPage ? PORTFOLIO_TABLE_MAP[portfolioPage] : null;

  useEffect(() => {
    if (!tableName) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase
      .from(tableName)
      .select('*')
      .order('row_index', { ascending: true })
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) {
          setError(e instanceof Error ? e : new Error(String((e as { message?: string }).message ?? e)));
          setRows([]);
        } else {
          setRows((data as PortfolioSheetRow[]) ?? []);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tableName]);

  return { rows, loading, error };
}
