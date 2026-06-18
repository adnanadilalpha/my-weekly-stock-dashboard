import type { PortfolioSheetRow } from '@/lib/hooks/usePortfolioData';

const COMBINED_PERFORMANCE_LABEL = 'COMBINED PERFORMANCE';

/** KPI block at top of the Google sheet tab "NEW SUMMARY" (`momentum_picks_summary`). */
export type MomentumSummaryKpis = {
  start: string | null;
  /** Raw sheet value for Returns % (ratio-style, e.g. 11.57 → 1157% in UI). */
  returnsRatio: number | null;
  hitRateRatio: number | null;
  avgGainRatio: number | null;
  avgLossRatio: number | null;
  netAvgReturnRatio: number | null;
  cagrRatio: number | null;
};

function normLabel(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getCol(row: PortfolioSheetRow, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

function numOrNull(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(String(raw).replace(/[%,$]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function findHeaderAndValueRows(rows: PortfolioSheetRow[]): {
  headerRow: PortfolioSheetRow | null;
  valueRow: PortfolioSheetRow | null;
} {
  const candidates = rows
    .filter((r) => typeof r.row_index === 'number' && r.row_index >= 1 && r.row_index <= 8)
    .sort((a, b) => Number(a.row_index) - Number(b.row_index));

  let headerRow: PortfolioSheetRow | null = null;
  for (const row of candidates) {
    for (let i = 1; i <= 37; i++) {
      if (normLabel(getCol(row, `col_${i}`)) === 'returns %') {
        headerRow = row;
        break;
      }
    }
    if (headerRow) break;
  }

  if (!headerRow) return { headerRow: null, valueRow: null };

  const headerIdx = Number(headerRow.row_index);
  const valueRow =
    candidates.find((r) => Number(r.row_index) === headerIdx + 1) ??
    candidates.find((r) => Number(r.row_index) > headerIdx && hasNumericKpiValues(r, headerRow!)) ??
    null;

  return { headerRow, valueRow };
}

function hasNumericKpiValues(row: PortfolioSheetRow, headerRow: PortfolioSheetRow): boolean {
  for (let i = 1; i <= 37; i++) {
    const key = `col_${i}`;
    const label = normLabel(getCol(headerRow, key));
    if (!label || label === 'start') continue;
    if (numOrNull(getCol(row, key)) != null) return true;
  }
  return false;
}

function valueForLabel(
  headerRow: PortfolioSheetRow,
  valueRow: PortfolioSheetRow,
  labelNeedle: string | RegExp,
): number | null {
  for (let i = 1; i <= 37; i++) {
    const key = `col_${i}`;
    const label = normLabel(getCol(headerRow, key));
    const match =
      typeof labelNeedle === 'string' ? label === labelNeedle : labelNeedle.test(label);
    if (!match) continue;
    return numOrNull(getCol(valueRow, key));
  }
  return null;
}

function textForLabel(
  headerRow: PortfolioSheetRow,
  valueRow: PortfolioSheetRow,
  labelNeedle: string,
): string | null {
  for (let i = 1; i <= 37; i++) {
    const key = `col_${i}`;
    if (normLabel(getCol(headerRow, key)) !== labelNeedle) continue;
    const raw = getCol(valueRow, key);
    const s = raw != null ? String(raw).trim() : '';
    return s || null;
  }
  return null;
}

/** Parse NEW SUMMARY KPI row(s) from `momentum_picks_summary`. */
export function parseMomentumSummaryKpis(rows: PortfolioSheetRow[]): MomentumSummaryKpis | null {
  const { headerRow, valueRow } = findHeaderAndValueRows(rows);
  if (!headerRow || !valueRow) return null;

  return {
    start: textForLabel(headerRow, valueRow, 'start'),
    returnsRatio: valueForLabel(headerRow, valueRow, 'returns %'),
    hitRateRatio: valueForLabel(headerRow, valueRow, 'hit rate'),
    avgGainRatio: valueForLabel(headerRow, valueRow, 'avg gain'),
    avgLossRatio: valueForLabel(headerRow, valueRow, 'avg loss'),
    netAvgReturnRatio: valueForLabel(headerRow, valueRow, /^net avg return$/),
    cagrRatio: valueForLabel(headerRow, valueRow, 'cagr'),
  };
}

export function momentumReturnsDisplayPct(returnsRatio: number | null): number | null {
  if (returnsRatio == null) return null;
  return returnsRatio * 100;
}

export function momentumRatioToDisplayPct(ratio: number | null): number | null {
  if (ratio == null) return null;
  return Math.abs(ratio) >= 1 ? ratio : ratio * 100;
}

export type LegacyCombinedRecapFields = {
  /** column_5 — ratio-style (1 => 100%). */
  cashInvested: number | null;
  /** column_15 — holding time in days. */
  holdingDays: number | null;
};

function isLegacyCombinedRecapRow(row: Record<string, unknown>): boolean {
  const c2 = String(row.column_2 ?? row.column2 ?? '')
    .trim()
    .toLowerCase();
  return /^combined performance(\b|$)/.test(c2);
}

/** Fields not present in NEW SUMMARY KPIs but still on legacy `performance_recap` COMBINED PERFORMANCE row. */
export function legacyCombinedRecapFieldsFromRecap(
  recapRows: Array<Record<string, unknown>>,
): LegacyCombinedRecapFields {
  for (const row of recapRows) {
    if (!isLegacyCombinedRecapRow(row)) continue;
    return {
      cashInvested: numOrNull(row.column_5 ?? row.column5),
      holdingDays: numOrNull(row.column_15 ?? row.column15),
    };
  }
  return { cashInvested: null, holdingDays: null };
}

/** @deprecated Use legacyCombinedRecapFieldsFromRecap */
export function holdingDaysFromLegacyCombinedRecap(
  recapRows: Array<Record<string, unknown>>,
): number | null {
  return legacyCombinedRecapFieldsFromRecap(recapRows).holdingDays;
}

/**
 * Build a `performance_recap`-shaped row for the combined momentum line using NEW SUMMARY only.
 * Legacy `performance_recap` COMBINED PERFORMANCE row is intentionally ignored (stale sheet).
 */
export function combinedRecapRowFromMomentumSummary(
  kpis: MomentumSummaryKpis,
  opts?: { rowIndex?: number; cashInvested?: number | null; holdingDays?: number | null },
): Record<string, string | number | null> {
  const rowIndex = opts?.rowIndex ?? 5;
  return {
    row_index: rowIndex,
    column_2: COMBINED_PERFORMANCE_LABEL,
    column_3: kpis.start,
    column_4: null,
    column_5: opts?.cashInvested ?? null,
    column_6: null,
    column_7: null,
    column_8: null,
    column_9: kpis.returnsRatio,
    column_10: kpis.hitRateRatio,
    column_11: kpis.avgGainRatio,
    column_12: kpis.avgLossRatio,
    column_13: kpis.netAvgReturnRatio,
    column_14: kpis.cagrRatio,
    column_15: opts?.holdingDays ?? null,
  };
}
