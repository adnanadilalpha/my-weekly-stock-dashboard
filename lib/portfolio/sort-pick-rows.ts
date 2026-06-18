import type { PortfolioSheetRow } from '@/lib/hooks/usePortfolioData';

type HeaderCol = { key: string; label: string };

function rowVal(row: PortfolioSheetRow, key: string): unknown {
  return (row as Record<string, unknown>)[key] ?? null;
}

/** Parse sheet cell to UTC ms for sorting (ISO strings, Date objects, serial dates). */
export function parsePickRowDateMs(val: unknown): number | null {
  if (val == null || String(val).trim() === '') return null;
  if (typeof val === 'object' && val !== null && 'getTime' in (val as Date)) {
    const t = (val as Date).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof val === 'number' && val >= 1e12 && val < 2e13) {
    const t = new Date(val).getTime();
    return Number.isNaN(t) ? null : t;
  }
  const s = String(val).trim();
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const t = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
    return Number.isNaN(t) ? null : t;
  }
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

export function findPickSortDateKey(headerCols: HeaderCol[]): string | null {
  const labels = headerCols.map((c) => ({ ...c, norm: c.label.toLowerCase().replace(/\s+/g, ' ').trim() }));
  const pick = (pred: (norm: string) => boolean) => labels.find((c) => pred(c.norm))?.key ?? null;
  return (
    pick((n) => n === 'week start') ??
    pick((n) => n.includes('week start')) ??
    pick((n) => n.includes('1st buy')) ??
    pick((n) => n.includes('exit date')) ??
    pick((n) => n.includes('buy date')) ??
    pick((n) => n.includes('date') && !n.includes('update'))
  );
}

function yearWeekSortKey(row: PortfolioSheetRow, headerCols: HeaderCol[]): number | null {
  const yearKey =
    headerCols.find((c) => c.label.toLowerCase().replace(/\s+/g, ' ').trim() === 'year')?.key ?? 'col_1';
  const weekKey =
    headerCols.find((c) => c.label.toLowerCase().replace(/\s+/g, ' ').trim() === 'week')?.key ?? 'col_2';
  const y = Number(rowVal(row, yearKey));
  const w = Number(rowVal(row, weekKey));
  if (!Number.isFinite(y) || !Number.isFinite(w)) return null;
  return y * 1000 + w;
}

export function pickRowSortKey(
  row: PortfolioSheetRow,
  headerCols: HeaderCol[],
  dateKey: string | null,
): number {
  if (dateKey) {
    const ms = parsePickRowDateMs(rowVal(row, dateKey));
    if (ms != null) return ms;
  }
  const yw = yearWeekSortKey(row, headerCols);
  if (yw != null) return yw;
  const idx = Number((row as { row_index?: number }).row_index);
  return Number.isFinite(idx) ? idx : 0;
}

/** Client feedback #3: newest picks first. */
export function sortPickRowsNewestFirst<T extends PortfolioSheetRow>(
  rows: T[],
  headerCols: HeaderCol[],
): T[] {
  if (rows.length <= 1 || headerCols.length === 0) return rows;
  const dateKey = findPickSortDateKey(headerCols);
  return [...rows].sort((a, b) => pickRowSortKey(b, headerCols, dateKey) - pickRowSortKey(a, headerCols, dateKey));
}
