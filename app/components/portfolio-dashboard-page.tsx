'use client';

import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, Activity, TrendingUp, ShieldCheck, RefreshCw, Layers, PieChart } from 'lucide-react';
import { AppHeader } from './app-header';
import {
  usePerformanceRecap,
  usePortfolioSheet,
  PORTFOLIO_NAMES,
  GROUP_WEEKLY_MOMENTUM,
  GROUP_ETF,
  isCombinedPerformanceRecapName,
} from '@/lib/hooks/usePortfolioData';
import type { AppMode, PortfolioPage } from '../types';

const NAME_TO_PAGE: Record<string, PortfolioPage> = {
  [PORTFOLIO_NAMES.COMBINED_PERFORMANCE]: 'momentum-combined',
  [PORTFOLIO_NAMES.DOW30]: 'dow30',
  [PORTFOLIO_NAMES.LARGE_CAPS]: 'large-caps',
  [PORTFOLIO_NAMES.NASDAQ100]: 'nasdaq100',
  [PORTFOLIO_NAMES.MACRO_ETF]: 'macro-etf',
  [PORTFOLIO_NAMES.MACRO_2_3X]: 'macro-3x',
};

function normalizeCol2(val: string | null): string {
  return (val ?? '').trim();
}

function getCol(row: Record<string, unknown>, key: string): string | number | null {
  const snake = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const val = row[key] ?? row[snake] ?? row[camel];
  return val == null ? null : (val as string | number);
}

function formatPct(val: string | number | null): string {
  if (val == null) return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  const pct = Math.abs(n) >= 1 ? n : n * 100;
  return pct.toFixed(1) + '%';
}

function formatCombinedReturnPct(val: string | number | null): string {
  if (val == null) return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  // Combined Performance row stores return as ratio-style (10.87 => 1087%).
  return `${(n * 100).toFixed(1)}%`;
}

function formatInt(val: string | number | null): string {
  if (val == null) return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return Math.round(n).toLocaleString();
}

function formatCurrency(val: string | number | null): string {
  if (val == null) return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return '$' + Math.round(n).toLocaleString();
}

function formatDateSheet(val: string | number | null): string | null {
  if (val == null) return null;
  const d = new Date(typeof val === 'number' ? val : String(val).trim());
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function toPercent(value: unknown): number | null {
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Math.abs(n) <= 1 ? n * 100 : n;
}

function toPercentFromCombinedReturn(value: unknown): number | null {
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  // Combined Performance row stores return as ratio-style (10.87 => 1087%).
  return n * 100;
}


export interface PortfolioDashboardPageProps {
  userEmail: string;
  currentAppMode: AppMode;
  onGoToPortfolio: () => void;
  onGoToMWS: () => void;
  onSignOut: () => void;
  onSelectPortfolio: (page: PortfolioPage) => void;
}

export function PortfolioDashboardPage({
  userEmail,
  currentAppMode,
  onGoToPortfolio,
  onGoToMWS,
  onSignOut,
  onSelectPortfolio,
}: PortfolioDashboardPageProps) {
  const { rows, portfolioRows, loading, error, refetch } = usePerformanceRecap();
  const {
    rows: momentumSummaryRows,
    loading: momentumSummaryLoading,
    error: momentumSummaryError,
    refetch: refetchMomentumSummary,
  } = usePortfolioSheet('momentum-combined');

  const weeklyNames = new Set<string>([PORTFOLIO_NAMES.DOW30, PORTFOLIO_NAMES.LARGE_CAPS, PORTFOLIO_NAMES.NASDAQ100]);
  const etfNames = new Set<string>([PORTFOLIO_NAMES.MACRO_ETF, PORTFOLIO_NAMES.MACRO_2_3X]);
  const getCol2 = (r: (typeof portfolioRows)[0]) =>
    normalizeCol2(String((r as unknown as Record<string, unknown>).column_2 ?? (r as unknown as Record<string, unknown>).column2 ?? ''));

  const tableColumns: { key: string; header: string }[] = [
    { key: 'column_2', header: 'Strategy' },
    { key: 'column_3', header: 'Start' },
    { key: 'column_4', header: 'Initial Value' },
    { key: 'column_5', header: 'Cash Invested' },
    { key: 'column_7', header: 'Portfolio Value' },
    { key: 'column_8', header: 'Return $' },
    { key: 'column_9', header: 'Returns' },
    { key: 'column_10', header: 'Hit Rate' },
    { key: 'column_11', header: 'Avg Gain' },
    { key: 'column_12', header: 'Avg Loss' },
    { key: 'column_13', header: 'Net Avg Return' },
    { key: 'column_14', header: 'CAGR' },
    { key: 'column_15', header: 'Hold' },
  ];

  const hasRowData = (r: (typeof portfolioRows)[0]) => {
    const row = r as unknown as Record<string, unknown>;
    return tableColumns.some((col, idx) => {
      if (idx === 0) return false;
      const v = getCol(row, col.key);
      return v != null && String(v).trim() !== '';
    });
  };
  const combinedRows = portfolioRows.filter((r) => isCombinedPerformanceRecapName(getCol2(r)) && hasRowData(r));
  const weeklyRows = portfolioRows.filter(
    (r) => weeklyNames.has(getCol2(r)) && !isCombinedPerformanceRecapName(getCol2(r)) && hasRowData(r),
  );
  const etfRows = portfolioRows.filter((r) => etfNames.has(getCol2(r)) && hasRowData(r));

  /** Weekly Momentum KPI source is the COMBINED PERFORMANCE recap row. */
  const kpiSourceRow = combinedRows[0] ?? null;
  /** Weekly sub-strategy rows kept as fallback if combined recap row is unavailable. */
  const kpiFallbackRows = weeklyRows;
  /** All recap rows shown in tables + subtitle. */
  const allRows = [...combinedRows, ...weeklyRows, ...etfRows];
  const getAverage = (vals: Array<number | null>) => {
    const valid = vals.filter((v): v is number => v != null);
    if (valid.length === 0) return null;
    return valid.reduce((sum, v) => sum + v, 0) / valid.length;
  };
  /** Same scaling as combined detail header `formatSummaryValue` for "Returns %" (ratio × 100 → display %). */
  const getMomentumSummaryReturnsPct = (): number | null => {
    if (momentumSummaryRows.length === 0) return null;
    const maxSummaryRows = 6;
    const candidateRows = momentumSummaryRows.filter(
      (r) => typeof r.row_index === 'number' && r.row_index >= 1 && r.row_index <= maxSummaryRows,
    );
    const isReturnsPctLabel = (raw: string) =>
      raw
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase() === 'returns %';
    for (const row of candidateRows) {
      const rec = row as unknown as Record<string, unknown>;
      for (let i = 1; i <= 37; i++) {
        const key = `col_${i}`;
        const cell = String(rec[key] ?? '').trim();
        if (!isReturnsPctLabel(cell)) continue;
        const right = rec[`col_${i + 1}`];
        const belowRow = candidateRows.find((r) => r.row_index === Number(row.row_index) + 1);
        const below = belowRow ? (belowRow as unknown as Record<string, unknown>)[key] : null;
        for (const opt of [right, below]) {
          const n = Number(opt);
          if (Number.isNaN(n)) continue;
          return n * 100;
        }
      }
    }
    return null;
  };
  const summaryAvgReturnPct = getMomentumSummaryReturnsPct();
  const avgReturnPct = summaryAvgReturnPct != null
    ? summaryAvgReturnPct
    : kpiSourceRow
      ? toPercentFromCombinedReturn(getCol(kpiSourceRow as unknown as Record<string, unknown>, 'column_9'))
      : getAverage(kpiFallbackRows.map((r) => toPercent(getCol(r as unknown as Record<string, unknown>, 'column_9'))));
  const avgCagr = kpiSourceRow
    ? toPercent(getCol(kpiSourceRow as unknown as Record<string, unknown>, 'column_14'))
    : getAverage(kpiFallbackRows.map((r) => toPercent(getCol(r as unknown as Record<string, unknown>, 'column_14'))));
  const avgHitRate = kpiSourceRow
    ? toPercent(getCol(kpiSourceRow as unknown as Record<string, unknown>, 'column_10'))
    : getAverage(kpiFallbackRows.map((r) => toPercent(getCol(r as unknown as Record<string, unknown>, 'column_10'))));

  const momentumRowsOrdered = useMemo(
    () => [...combinedRows],
    [combinedRows],
  );

  const filteredMomentum = momentumRowsOrdered;
  const filteredEtf = etfRows;

  const pageSubtitle = useMemo(() => {
    let earliest: Date | null = null;
    for (const r of allRows) {
      const row = r as unknown as Record<string, unknown>;
      const d = formatDateSheet(getCol(row, 'column_3'));
      if (!d) continue;
      const dt = new Date(d);
      if (!Number.isNaN(dt.getTime()) && (!earliest || dt < earliest)) earliest = dt;
    }
    const since = earliest
      ? `${earliest.getMonth() + 1}/${earliest.getDate()}/${earliest.getFullYear()}`
      : '—';
    const updated = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
    return `Tracked since ${since} · ${allRows.length} strategies · updated ${updated}`;
  }, [allRows]);

  const formatCell = (key: string, value: string | number | null, strategyName?: string): string => {
    if (value == null || value === '') return '—';
    const s = String(value).trim();
    if (s.toLowerCase() === 'back to home page') return '—';
    if (key === 'column_3') {
      const dateText = formatDateSheet(value);
      if (dateText) return dateText;
      return s;
    }
    if (key === 'column_4') return formatInt(value);
    if (key === 'column_5') {
      if (s.toLowerCase() === 'n/a') return 'N/A';
      const n = Number(value);
      // Recap stores cash-invested as ratio-style values (1 => 100%).
      if (!Number.isNaN(n)) return (n * 100).toFixed(2) + '%';
      return s;
    }
    if (key === 'column_7' || key === 'column_8') return formatCurrency(value);
    if (key === 'column_14') {
      const n = Number(value);
      if (Number.isNaN(n)) return s;
      const pct = Math.abs(n) >= 1 ? n : n * 100;
      return Math.round(pct) + '%';
    }
    if (
      key === 'column_9' ||
      key === 'column_10' ||
      key === 'column_11' ||
      key === 'column_12' ||
      key === 'column_13'
    ) {
      if (key === 'column_9' && isCombinedPerformanceRecapName(strategyName)) {
        return formatCombinedReturnPct(value);
      }
      return formatPct(value);
    }
    if (key === 'column_15') return formatInt(value);
    return s;
  };

  const isPositiveHighlightCol = (key: string) =>
    key === 'column_8' || key === 'column_9' || key === 'column_13';

  const renderRow = (row: (typeof portfolioRows)[0]) => {
    const r = row as unknown as Record<string, unknown>;
    const name = getCol2(row);
    const page = NAME_TO_PAGE[name];
    const navigable = Boolean(page);
    const sinceLine = formatCell('column_3', getCol(r, 'column_3'), name);

    return (
      <tr
        key={(row as { row_index: number }).row_index}
        className={`group border-b border-border transition-colors last:border-b-0 ${navigable ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default hover:bg-muted/20'}`}
        onClick={() => {
          if (page) onSelectPortfolio(page);
        }}
      >
        {tableColumns.map((col, idx) => {
          const raw = idx === 0 ? name : getCol(r, col.key);
          const display = formatCell(col.key, raw as string | number | null, name);
          const num = typeof raw === 'number' ? raw : Number(raw);
          const isPositive = !Number.isNaN(num) && num > 0 && isPositiveHighlightCol(col.key);
          const isNegative = !Number.isNaN(num) && num < 0 && isPositiveHighlightCol(col.key);
          const usePill = isPositive || isNegative;

          if (idx === 0) {
            return (
              <td key={col.key} className="px-3 py-3 text-left align-middle sm:px-4 sm:py-4">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-foreground sm:text-sm md:text-base">{name}</div>
                  {sinceLine && sinceLine !== '—' && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">Since {sinceLine}</div>
                  )}
                </div>
              </td>
            );
          }

          if (col.key === 'column_3') {
            return (
              <td key={col.key} className="px-3 py-3 font-mono text-xs text-muted-foreground tabular-nums sm:px-4 sm:py-4 sm:text-sm">
                {display}
              </td>
            );
          }

          if (col.key === 'column_10') {
            const hit = toPercent(raw);
            const barW = hit != null ? Math.min(100, Math.max(0, hit)) : 0;
            const barTone =
              hit == null ? 'bg-muted-foreground/30' : hit >= 55 ? 'bg-emerald-500' : hit >= 35 ? 'bg-amber-500' : 'bg-rose-500';
            return (
              <td key={col.key} className="px-3 py-3 text-left align-middle tabular-nums sm:px-4 sm:py-4">
                <div className="flex min-w-[108px] max-w-[150px] items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${barTone}`} style={{ width: `${barW}%` }} />
                  </div>
                  <span className="shrink-0 font-mono text-xs font-medium text-foreground sm:text-sm">{display}</span>
                </div>
              </td>
            );
          }

          if (col.key === 'column_11' || col.key === 'column_12') {
            const p = toPercent(raw);
            const gain = col.key === 'column_11';
            const cls =
              p == null
                ? 'text-muted-foreground'
                : gain
                  ? p >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                  : p <= 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400';
            return (
              <td key={col.key} className={`px-3 py-3 font-mono text-xs font-semibold tabular-nums sm:px-4 sm:py-4 sm:text-sm ${cls}`}>
                {display}
              </td>
            );
          }

          if (col.key === 'column_13') {
            const p = toPercent(raw);
            const pos = p != null && p > 0;
            const neg = p != null && p < 0;
            return (
              <td key={col.key} className="px-3 py-3 text-left align-middle font-mono text-xs tabular-nums sm:px-4 sm:py-4 sm:text-sm">
                {pos || neg ? (
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold sm:px-2.5 sm:py-1 sm:text-xs ${
                      pos
                        ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                        : 'bg-rose-500/15 text-rose-800 dark:text-rose-300'
                    }`}
                  >
                    {display}
                  </span>
                ) : (
                  <span className="text-foreground">{display}</span>
                )}
              </td>
            );
          }

          if (col.key === 'column_8' || col.key === 'column_9') {
            return (
              <td key={col.key} className="px-3 py-3 text-left align-middle font-mono text-xs tabular-nums sm:px-4 sm:py-4 sm:text-sm">
                {usePill ? (
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold sm:px-3 sm:py-1.5 sm:text-xs ${
                      isPositive
                        ? 'bg-emerald-600 text-white dark:bg-emerald-600'
                        : 'bg-rose-600 text-white dark:bg-rose-600'
                    }`}
                  >
                    {display}
                  </span>
                ) : (
                  <span className="text-foreground">{display}</span>
                )}
              </td>
            );
          }

          return (
            <td key={col.key} className="px-3 py-3 text-left align-middle font-mono text-xs tabular-nums text-foreground sm:px-4 sm:py-4 sm:text-sm">
              {display}
            </td>
          );
        })}
        <td className="whitespace-nowrap px-2 py-2.5 text-right align-middle sm:py-3">
          {navigable ? (
            <span className="text-[11px] font-medium leading-none text-blue-600 dark:text-blue-400">
              Access Here
              <ChevronRight className="ml-0.5 inline h-3 w-3 align-text-bottom opacity-90" aria-hidden />
            </span>
          ) : (
            <span className="text-[11px] tabular-nums text-muted-foreground">—</span>
          )}
        </td>
      </tr>
    );
  };

  const TableSection = ({
    title,
    subtitle,
    rows: sectionRows,
    icon: Icon,
    iconClass,
  }: {
    title: string;
    subtitle: string;
    rows: typeof weeklyRows;
    icon: LucideIcon;
    iconClass: string;
  }) => (
    <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex w-full min-w-0 flex-col gap-3 border-b border-border bg-muted/40 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
            <Icon className="h-[15px] w-[15px]" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[12px]">{title}</span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:text-[12px]">
            {sectionRows.length}
          </span>
        </div>
        <span className="min-w-0 shrink text-[11px] italic text-muted-foreground sm:max-w-[min(100%,28rem)] sm:text-[12px] sm:text-right">
          {subtitle}
        </span>
      </div>
      <div className="w-full min-w-0 overflow-x-auto">
        <table className="min-w-[920px] w-full border-separate border-spacing-0 text-xs sm:text-sm">
          <thead>
            <tr>
              {tableColumns.map((col) => (
                <th
                  key={col.key}
                  className="whitespace-nowrap border-b border-border px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-4 sm:py-3.5 sm:text-[10.5px]"
                >
                  {col.header}
                </th>
              ))}
              <th className="border-b border-border px-2 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">
                {/* link */}
              </th>
            </tr>
          </thead>
          <tbody>{sectionRows.map(renderRow)}</tbody>
        </table>
      </div>
    </section>
  );

  const avgReturnDisplay =
    avgReturnPct != null ? `${avgReturnPct >= 0 ? '+' : ''}${avgReturnPct.toFixed(1)}%` : '—';

  return (
    <div className="min-h-screen bg-muted/25">
      <AppHeader
        userEmail={userEmail}
        currentAppMode={currentAppMode}
        onGoToPortfolio={onGoToPortfolio}
        onGoToMWS={onGoToMWS}
        onSignOut={onSignOut}
      />
      <main className="w-full min-w-0 space-y-6 px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="flex w-full min-w-0 flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-[1.65rem] md:text-[1.85rem] lg:text-[2rem]">
              Portfolio Performance
            </h1>
            <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">{pageSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              void refetch();
              void refetchMomentumSummary();
            }}
            disabled={loading || momentumSummaryLoading}
            className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 text-xs font-medium shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50 sm:w-auto sm:justify-start sm:text-[13px]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading || momentumSummaryLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {!loading && !error && !momentumSummaryLoading && !momentumSummaryError && (
          <div className="flex w-full min-w-0 flex-wrap gap-3.5">
            <div className="box-border flex min-h-[112px] min-w-0 flex-[1_1_12rem] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm sm:min-h-[124px] sm:flex-[1_1_calc(50%-0.4375rem)] sm:p-5 lg:flex-[1_1_0]">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[12.5px]">
                <TrendingUp className="h-4 w-4 opacity-70" />
                Avg Return
              </div>
              <div>
                <div className="mt-1 text-[1.375rem] font-semibold leading-none tracking-tight text-emerald-600 dark:text-emerald-400 sm:text-2xl md:text-[1.75rem] lg:text-[30px]">
                  {avgReturnDisplay}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground sm:text-[12px]">Weekly momentum picks only</p>
              </div>
            </div>
            <div className="box-border flex min-h-[112px] min-w-0 flex-[1_1_12rem] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm sm:min-h-[124px] sm:flex-[1_1_calc(50%-0.4375rem)] sm:p-5 lg:flex-[1_1_0]">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[12.5px]">
                <Activity className="h-4 w-4 opacity-70" />
                Avg CAGR
              </div>
              <div>
                <div className="mt-1 text-[1.375rem] font-semibold leading-none tracking-tight text-foreground sm:text-2xl md:text-[1.75rem] lg:text-[30px]">
                  {avgCagr != null ? `${avgCagr.toFixed(0)}%` : '—'}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground sm:text-[12px]">Weekly momentum picks only</p>
              </div>
            </div>
            <div className="box-border flex min-h-[112px] min-w-0 flex-[1_1_12rem] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm sm:min-h-[124px] sm:flex-[1_1_calc(50%-0.4375rem)] sm:p-5 lg:flex-[1_1_0]">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[12.5px]">
                <ShieldCheck className="h-4 w-4 opacity-70" />
                Avg Hit Rate
              </div>
              <div>
                <div className="mt-1 text-[1.375rem] font-semibold leading-none tracking-tight text-foreground sm:text-2xl md:text-[1.75rem] lg:text-[30px]">
                  {avgHitRate != null ? `${avgHitRate.toFixed(1)}%` : '—'}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground sm:text-[12px]">Weekly momentum picks only</p>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-violet-600" />
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error.message}
          </div>
        )}
        {!loading && !error && (
          <div className="flex w-full min-w-0 flex-col gap-5">
            <TableSection
              title={GROUP_WEEKLY_MOMENTUM}
              subtitle="Rotating picks based on momentum signals"
              rows={filteredMomentum}
              icon={Layers}
              iconClass="bg-violet-500/15 text-violet-600 dark:text-violet-400"
            />
            <TableSection
              title={GROUP_ETF}
              subtitle="Macro-oriented ETF sleeves"
              rows={filteredEtf}
              icon={PieChart}
              iconClass="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            />
          </div>
        )}
      </main>
    </div>
  );
}
