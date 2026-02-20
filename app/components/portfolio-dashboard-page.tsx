'use client';

import { ChevronRight } from 'lucide-react';
import { AppHeader } from './app-header';
import {
  usePerformanceRecap,
  PORTFOLIO_NAMES,
  GROUP_WEEKLY_MOMENTUM,
  GROUP_ETF,
} from '@/lib/hooks/usePortfolioData';
import type { AppMode, PortfolioPage } from '../types';

const NAME_TO_PAGE: Record<string, PortfolioPage> = {
  [PORTFOLIO_NAMES.DOW30]: 'dow30',
  [PORTFOLIO_NAMES.LARGE_CAPS]: 'large-caps',
  [PORTFOLIO_NAMES.NASDAQ100]: 'nasdaq100',
  [PORTFOLIO_NAMES.MACRO_ETF]: 'macro-etf',
  [PORTFOLIO_NAMES.MACRO_2_3X]: 'macro-3x',
};

function normalizeCol2(val: string | null): string {
  return (val ?? '').trim();
}

/** Read column from row (Supabase may return snake_case column_2 or camelCase column2) */
function getCol(row: Record<string, unknown>, key: string): string | number | null {
  const snake = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const val = row[key] ?? row[snake] ?? row[camel];
  return val == null ? null : (val as string | number);
}

/** Format as percentage: sheet stores either decimal (0.37 → 37%) or already scaled (9.27 → 927%) */
function formatPct(val: string | number | null): string {
  if (val == null) return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  const pct = Math.abs(n) >= 1 ? n : n * 100;
  return pct.toFixed(1) + '%';
}

/** Integer with locale grouping (e.g. 10,000) */
function formatInt(val: string | number | null): string {
  if (val == null) return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return Math.round(n).toLocaleString();
}

/** Currency, rounded to whole dollars for cleaner match to sheet */
function formatCurrency(val: string | number | null): string {
  if (val == null) return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return '$' + Math.round(n).toLocaleString();
}

/** Sheet date pattern: M/D/YYYY (e.g. 10/3/2022, 1/24/2025) – human-readable */
function formatDateSheet(val: string | number | null): string | null {
  if (val == null) return null;
  const d = new Date(typeof val === 'number' ? val : String(val).trim());
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
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
  const { rows, portfolioRows, loading, error } = usePerformanceRecap();

  const weeklyNames = new Set<string>([PORTFOLIO_NAMES.DOW30, PORTFOLIO_NAMES.LARGE_CAPS, PORTFOLIO_NAMES.NASDAQ100]);
  const etfNames = new Set<string>([PORTFOLIO_NAMES.MACRO_ETF, PORTFOLIO_NAMES.MACRO_2_3X]);
  const getCol2 = (r: typeof portfolioRows[0]) => normalizeCol2(String((r as unknown as Record<string, unknown>).column_2 ?? (r as unknown as Record<string, unknown>).column2 ?? ''));

  const tableColumns: { key: string; header: string }[] = [
    { key: 'column_2', header: 'Portfolio Performance' },
    { key: 'column_3', header: 'Start' },
    { key: 'column_4', header: 'Initial Value' },
    { key: 'column_5', header: 'Cash Invested' },
    { key: 'column_7', header: 'Portfolio Value' },
    { key: 'column_8', header: 'Return $' },
    { key: 'column_9', header: 'Returns %' },
    { key: 'column_10', header: 'Hit Rate' },
    { key: 'column_11', header: 'Avg Gain' },
    { key: 'column_12', header: 'Avg Loss' },
    { key: 'column_13', header: 'Net Avg Return' },
    { key: 'column_14', header: 'CAGR' },
    { key: 'column_15', header: 'Holding Time (days)' },
  ];

  const hasRowData = (r: typeof portfolioRows[0]) => {
    const row = r as unknown as Record<string, unknown>;
    return tableColumns.some((col, idx) => {
      if (idx === 0) return false;
      const v = getCol(row, col.key);
      return v != null && String(v).trim() !== '';
    });
  };
  const weeklyRows = portfolioRows.filter((r) => weeklyNames.has(getCol2(r)) && hasRowData(r));
  const etfRows = portfolioRows.filter((r) => etfNames.has(getCol2(r)) && hasRowData(r));

  const formatCell = (key: string, value: string | number | null): string => {
    if (value == null || value === '') return '—';
    const s = String(value).trim();
    if (s.toLowerCase() === 'back to home page') return '—';
    if (key === 'column_3') {
      const dateText = formatDateSheet(value);
      if (dateText) return dateText;
      return s;
    }
    if (key === 'column_4') return formatInt(value); // Initial Value: 10,000
    if (key === 'column_5') {
      // Cash Invested / Invested %: "n/a" or 96.85%
      if (s.toLowerCase() === 'n/a') return 'N/A';
      const n = Number(value);
      if (!Number.isNaN(n)) return n >= 1 ? formatPct(value) : (n * 100).toFixed(2) + '%';
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
    ) return formatPct(value);
    if (key === 'column_15') return formatInt(value); // Holding Time: whole days
    return s;
  };

  /** Return $, Returns %, Net Avg Return: highlight when positive (match sheet) */
  const isPositiveHighlightCol = (key: string) =>
    key === 'column_8' || key === 'column_9' || key === 'column_13';

  const renderRow = (row: typeof portfolioRows[0]) => {
    const r = row as unknown as Record<string, unknown>;
    const name = getCol2(row);
    const page = NAME_TO_PAGE[name];
    const handleClick = () => {
      if (page) onSelectPortfolio(page);
    };

    return (
      <tr
        key={(row as { row_index: number }).row_index}
        className="border-b border-slate-200 hover:bg-slate-200 hover:border-l-4 hover:border-l-emerald-600 cursor-pointer group transition-colors"
        onClick={handleClick}
      >
        {tableColumns.map((col, idx) => {
          const raw = idx === 0 ? name : getCol(r, col.key);
          const display = formatCell(col.key, raw as string | number | null);
          const num = typeof raw === 'number' ? raw : Number(raw);
          const isPositive = !Number.isNaN(num) && num > 0 && isPositiveHighlightCol(col.key);
          return (
            <td
              key={col.key}
              className={`px-2 py-4 text-sm overflow-hidden text-ellipsis text-left ${
                idx === 0 ? 'font-medium text-slate-900' : 'text-slate-700 tabular-nums'
              } ${isPositive ? 'bg-emerald-700 text-white' : ''}`}
            >
              {display}
            </td>
          );
        })}
        <td className="px-2 py-4 text-slate-400 group-hover:text-slate-600 w-10 text-left align-middle">
          <ChevronRight className="w-4 h-4 inline-block" aria-hidden />
        </td>
      </tr>
    );
  };

  const TableSection = ({
    title,
    rows: sectionRows,
  }: {
    title: string;
    rows: typeof weeklyRows;
  }) => (
    <section>
      <h2 className="text-sm font-semibold text-slate-600 mb-2">{title}</h2>
      <div className="border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm table-fixed">
            <colgroup>
              {tableColumns.map((col) => (
                <col key={col.key} className="min-w-0" />
              ))}
              <col className="w-10" />
            </colgroup>
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                {tableColumns.map((col) => (
                  <th
                    key={col.key}
                    className="px-2 py-4 font-semibold text-slate-700 text-xs text-left whitespace-normal leading-tight overflow-hidden"
                  >
                    {col.header}
                  </th>
                ))}
                <th className="px-2 py-4 w-10" aria-label="View" />
              </tr>
            </thead>
            <tbody className="bg-white">
              {sectionRows.map(renderRow)}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-white">
      <AppHeader
        userEmail={userEmail}
        currentAppMode={currentAppMode}
        onGoToPortfolio={onGoToPortfolio}
        onGoToMWS={onGoToMWS}
        onSignOut={onSignOut}
      />
      <main className="p-4 sm:p-6 max-w-[1400px] mx-auto w-full space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Portfolio Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Performance recap from your tracker</p>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-7 w-7 border-2 border-slate-200 border-t-slate-600 rounded-full" />
          </div>
        )}
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error.message}
          </div>
        )}
        {!loading && !error && (
          <>
            <TableSection title={GROUP_WEEKLY_MOMENTUM} rows={weeklyRows} />
            <TableSection title={GROUP_ETF} rows={etfRows} />
          </>
        )}
      </main>
    </div>
  );
}

