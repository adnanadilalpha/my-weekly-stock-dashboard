'use client';

import { ChevronRight } from 'lucide-react';
import { AppHeader } from './app-header';
import { usePortfolioSheet, type PortfolioSheetRow } from '@/lib/hooks/usePortfolioData';
import type { AppMode, PortfolioPage } from '../types';

const PORTFOLIO_DETAIL_CONFIG: Record<
  Exclude<PortfolioPage, 'dashboard'>,
  { title: string; tableKey: string }
> = {
  dow30: { title: 'Momentum Picks: DOW 30', tableKey: 'dow30' },
  'large-caps': { title: 'Momentum Picks: LARGE CAPS', tableKey: 'large-caps' },
  nasdaq100: { title: 'Momentum Picks: NASDAQ 100', tableKey: 'nasdaq100' },
  'macro-etf': { title: 'Macro ETF', tableKey: 'macro-etf' },
  'macro-3x': { title: 'Macro 2-3x ETF', tableKey: 'macro-3x' },
};

const TABLE_HEADER_START_ROW = 6; // sheets use row 6 as table header

/** Sheet date pattern: M/D/YYYY (e.g. 10/3/2022, 1/24/2025) – human-readable, no leading zeros */
function formatDateSheet(val: unknown): string | null {
  if (val == null) return null;
  let d: Date;
  if (typeof val === 'object' && val !== null && 'toISOString' in (val as Date)) {
    d = val as Date;
  } else if (typeof val === 'number') {
    d = new Date(val);
  } else {
    const s = String(val).trim();
    const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, y, m, day] = isoMatch;
      d = new Date(Number(y), Number(m) - 1, Number(day));
    } else {
      d = new Date(s);
    }
  }
  if (Number.isNaN(d.getTime())) return null;
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const y = d.getFullYear();
  return `${m}/${day}/${y}`;
}

function getColKeys(row: PortfolioSheetRow, maxCols: number): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= maxCols; i++) {
    const key = `col_${i}`;
    if (key in row) keys.push(key);
  }
  return keys;
}

function getVal(row: Record<string, unknown>, key: string): unknown {
  return row[key] ?? null;
}

type DetailPageKey = Exclude<PortfolioPage, 'dashboard'>;

function isDow30ColoredColumn(header: string): boolean {
  const h = header.toLowerCase();
  const is5d = h.includes('5-d') && h.includes('return') && (h.includes('%') || h.includes('$'));
  const isStopLoss = h.includes('stop-loss') && h.includes('return') && (h.includes('%') || h.includes('$'));
  return is5d || isStopLoss;
}

function isStrategyReturnPctColumn(header: string): boolean {
  const h = header.toLowerCase();
  return h.includes('strategy return') && h.includes('%');
}

function formatCell(
  header: string,
  val: unknown,
  portfolioPage: DetailPageKey
): { text: string; isPositive?: boolean; isNegative?: boolean; isBold?: boolean; isAlgoScore?: boolean } {
  if (val == null || val === '') return { text: '—' };
  const strVal = String(val).trim().replace(/\u2212/g, '-');
  if (strVal.toLowerCase() === 'back to home page') return { text: '—' };
  const h = header.toLowerCase();
  const isStockReturnWithStopLoss =
    h.includes('stock return') && (h.includes('stop loss') || h.includes('stop-loss'));
  const isPercent =
    isStockReturnWithStopLoss ||
    (h.includes('return') && (h.includes('%') || h.includes('percent')));
  const isCurrency =
    h.includes('$') ||
    h.includes('return $') ||
    (h.includes('pf value') && !h.includes('algo'));
  const isTicker = h.includes('ticker');
  const isAlgoScore = h.includes('algo score');
  const isYear = h === 'year';
  const isDateColumn = h.includes('week start') || h.includes('date') || h.includes('buy') || h.includes('exit');

  if (isDateColumn || (typeof val === 'object' && 'toISOString' in (val as Date))) {
    const text = formatDateSheet(val);
    if (text) return { text };
  }

  const isNumeric =
    typeof val === 'number' ||
    (typeof val === 'string' && /^[\s\u2212-]*[\d.]+[\s]*%?$/.test(strVal));
  if (isNumeric) {
    const n =
      typeof val === 'number' ? Number(val) : Number(strVal.replace(/%/g, '').trim());
    if (Number.isNaN(n)) return { text: String(val) };
    if (isYear) return { text: Math.round(n).toString() };
    if (n >= 1e12 && n < 2e13) {
      const dateText = formatDateSheet(n);
      if (dateText) return { text: dateText };
    }
    if (h.includes('cagr')) {
      const pct = n >= 1 || n <= -1 ? n : n * 100;
      const text = Math.round(pct) + '%';
      return { text };
    }
    if (isPercent) {
      const isPositionReturnPct = /return\s*%/.test(h) && !/returns\s*%/.test(h);
      let pct = n >= 1 || n <= -1 ? n : n * 100;
      if (isPositionReturnPct && Math.abs(pct) < 50 && pct !== 0) {
        pct = n * 100;
      }
      if (isStockReturnWithStopLoss && Math.abs(n) <= 1 && n !== 0) {
        pct = n * 100;
      }
      const text = pct.toFixed(1) + '%';
      const isMacro = portfolioPage === 'macro-etf' || portfolioPage === 'macro-3x';
      const hasColor =
        portfolioPage === 'dow30'
          ? isDow30ColoredColumn(header) && h.includes('%')
          : isMacro
            ? (isStrategyReturnPctColumn(header) || h.includes('returns %') || h.includes('net avg return') || (h.includes('return') && h.includes('%') && !h.includes('stock return')))
            : isStrategyReturnPctColumn(header);
      return hasColor
        ? { text, isPositive: pct > 0, isNegative: pct < 0 }
        : { text };
    }
    const isPfAllocation = h.includes('allocation') || h.includes('pf allocation');
    if (isPfAllocation && n >= 0 && n <= 1) {
      const text = (n * 100).toFixed(1) + '%';
      return { text };
    }
    if (isCurrency) {
      const text = n < 0 ? `-$${Math.round(Math.abs(n)).toLocaleString()}` : `$${Math.round(n).toLocaleString()}`;
      const isMacro = portfolioPage === 'macro-etf' || portfolioPage === 'macro-3x';
      const hasColor =
        (portfolioPage === 'dow30' && isDow30ColoredColumn(header) && h.includes('$')) ||
        (isMacro && h.includes('return $'));
      return hasColor ? { text, isPositive: n > 0, isNegative: n < 0 } : { text };
    }
    if (isAlgoScore) return { text: Math.round(n).toString(), isAlgoScore: true };
    return { text: n.toLocaleString(undefined, { maximumFractionDigits: 2 }) };
  }

  const str = strVal;
  if (str && (/\d{4}-\d{2}-\d{2}/.test(str) || /^\d{4}-\d{2}-\d{2}T/.test(str))) {
    const dateText = formatDateSheet(val);
    if (dateText) return { text: dateText };
  }
  // Stock Return With Stop Loss: value may arrive as percentage string (e.g. "-2%") – format as % only (no green/red)
  if (isStockReturnWithStopLoss && str && /^[\s\u2212-]*[\d.]+[\s]*%?$/.test(str)) {
    const numStr = str.replace(/%/g, '').replace(/\u2212/g, '-').trim();
    const n = Number(numStr);
    if (!Number.isNaN(n)) {
      const pct = Math.abs(n) >= 1 && str.includes('%') ? n : n * 100;
      const text = pct.toFixed(1) + '%';
      return { text };
    }
  }
  const openPositionStripped = str.replace(/^[\s\-–—]+(?=open\s+positions?$)/i, '').trim();
  return { text: openPositionStripped, isBold: isTicker };
}

/** Format summary cell to match sheet: no long decimals. Uses column label (from first summary row) to decide format. */
function formatSummaryValue(label: string, val: unknown): string {
  if (val == null || val === '') return '—';
  const s = String(val).trim();
  if (s.toLowerCase() === 'back to home page') return '—';
  if (/^[\s\-–—]+open\s+positions?$/i.test(s)) return s.replace(/^[\s\-–—]+/, '').trim();
  const h = label.toLowerCase();
  if (h.includes('momentum picks') || h.includes('stop loss')) return s;
  if (h.includes('start') || h.includes('date') || h.includes('buy') || h.includes('exit')) {
    const dateText = formatDateSheet(val);
    if (dateText) return dateText;
    return s;
  }
  if (s.toLowerCase() === 'n/a') return 'N/A';
  const n = Number(val);
  if (!Number.isNaN(n)) {
    if (h.includes('initial value')) return Math.round(n).toLocaleString();
    if ((h.includes('cash') || h.includes('invested')) && n <= 1 && n >= 0) return (n * 100).toFixed(2) + '%';
    if ((h.includes('allocation') || h.includes('equity') || h.includes('bonds') || h.includes('commodities') || h.includes('crypto') || h.includes('industry') || h.includes('themes')) && n <= 1 && n >= 0) return (n * 100).toFixed(1) + '%';
    if (h.includes('portfolio value') || (h.includes('return') && h.includes('$'))) {
      return (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString();
    }
    if (h.includes('cagr')) {
      const pct = Math.abs(n) >= 1 ? n : n * 100;
      return Math.round(pct) + '%';
    }
    if ((h.includes('return') && h.includes('%')) || h.includes('hit rate') || h.includes('avg gain') || h.includes('avg loss') || h.includes('net avg')) {
      const isPositionReturnPct = /return\s*%/.test(h) && !/returns\s*%/.test(h);
      let pct = Math.abs(n) >= 1 ? n : n * 100;
      if (isPositionReturnPct && Math.abs(pct) < 50 && pct !== 0) pct = n * 100;
      return pct.toFixed(1) + '%';
    }
    if ((n > 0.005 && n < 0.995) || (n > -0.995 && n < -0.005)) {
      return (n * 100).toFixed(2) + '%';
    }
    return n >= 1 || n <= -1 ? Math.round(n).toLocaleString() : n.toFixed(2);
  }
  if (s && /\d{4}-\d{2}-\d{2}/.test(s)) {
    const dateText = formatDateSheet(val);
    if (dateText) return dateText;
  }
  return s;
}

export interface PortfolioDetailPageProps {
  portfolioPage: Exclude<PortfolioPage, 'dashboard'>;
  userEmail: string;
  currentAppMode: AppMode;
  onGoToPortfolio: () => void;
  onGoToMWS: () => void;
  onSignOut: () => void;
  onBack: () => void;
}

const MAX_COLS = 31;

export function PortfolioDetailPage({
  portfolioPage,
  userEmail,
  currentAppMode,
  onGoToPortfolio,
  onGoToMWS,
  onSignOut,
  onBack,
}: PortfolioDetailPageProps) {
  const config = PORTFOLIO_DETAIL_CONFIG[portfolioPage];
  const { rows, loading, error } = usePortfolioSheet(config.tableKey);

  const colKeys = rows.length > 0 ? getColKeys(rows[0], MAX_COLS) : [];

  const titleRow = rows.find((r) => r.row_index === 1) as Record<string, unknown> | undefined;
  const titleText =
    (titleRow && (getVal(titleRow, 'col_1') as string)?.replace(/\n/g, ' ')) ||
    config.title;

  const summaryRows = rows.filter((r) => (r.row_index as number) >= 1 && (r.row_index as number) < TABLE_HEADER_START_ROW);
  const headerRow = rows.find((r) => r.row_index === TABLE_HEADER_START_ROW);
  const dataRowsRaw = rows.filter((r) => (r.row_index as number) > TABLE_HEADER_START_ROW);

  // Only columns whose header (row 6) is a real label (text), not a number – sheet has no columns after Algo Score
  const headerCols: { key: string; label: string }[] = [];
  if (headerRow) {
    const r = headerRow as Record<string, unknown>;
    colKeys.forEach((key) => {
      const v = getVal(r, key);
      const s = v != null ? String(v).trim() : '';
      if (!s) return;
      if (/^-?[\d.]+$/.test(s)) return; // skip numeric “headers” (stray data in row 6)
      if (/weekly momentum picks \(wmp\):/i.test(s)) return; // not in main sheet view
      headerCols.push({ key, label: s });
    });
  }

  const dataRows = dataRowsRaw.filter((row) => {
    const r = row as Record<string, unknown>;
    return headerCols.some(({ key }) => {
      const v = getVal(r, key);
      return v != null && String(v).trim() !== '';
    });
  });

  const summaryRowsFiltered = summaryRows.filter((row) => {
    const r = row as Record<string, unknown>;
    return colKeys.some((key) => {
      const v = getVal(r, key);
      return v != null && String(v).trim() !== '';
    });
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        userEmail={userEmail}
        currentAppMode={currentAppMode}
        onGoToPortfolio={onGoToPortfolio}
        onGoToMWS={onGoToMWS}
        onSignOut={onSignOut}
        onBack={onBack}
        backLabel="Back to Portfolio"
      />
      <main className="p-4 sm:p-6 max-w-[1400px] mx-auto w-full">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-slate-300 border-t-emerald-600 rounded-full" />
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {error.message}
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            {/* Sticky title bar – stays visible when scrolling */}
            <div className="sticky top-0 z-20 bg-amber-400 border border-amber-500 rounded-t-lg px-4 py-2.5 shadow-sm">
              <h1 className="text-lg font-bold text-slate-900">{titleText}</h1>
            </div>

            {/* Sticky summary – all rows above table header (1..5). Sheet structure varies: Dow30 has 2 rows, Large Caps has 4, etc. */}
            {summaryRowsFiltered.length > 0 && (() => {
              const summaryCols = colKeys.filter((key) =>
                summaryRowsFiltered.some((row) => {
                  const v = getVal(row as Record<string, unknown>, key);
                  return v != null && String(v).trim() !== '';
                })
              );
              const labelByCol: Record<string, string> = {};
              for (const key of summaryCols) {
                for (const row of summaryRowsFiltered) {
                  const v = getVal(row as Record<string, unknown>, key);
                  const s = v != null ? String(v).trim() : '';
                  if (s && !/^-?[\d.]+$/.test(s)) {
                    labelByCol[key] = s;
                    break;
                  }
                }
              }
              // Truncate summary columns: Macro ETF/3x at "Avg Holding Time"; others at "Net Avg Return" (+ optional CAGR)
              const headerLabel = (key: string) =>
                headerRow ? String(getVal(headerRow as Record<string, unknown>, key) ?? '').trim() : '';
              const resolvedLabel = (key: string) =>
                (labelByCol[key] || headerLabel(key)).replace(/,/g, '').trim();
              const isMacroPortfolio = portfolioPage === 'macro-etf' || portfolioPage === 'macro-3x';
              const avgHoldingTimeIdx = summaryCols.findIndex((key) =>
                resolvedLabel(key).toLowerCase().includes('avg holding time')
              );
              const netAvgReturnIdx = summaryCols.findIndex((key) =>
                resolvedLabel(key).toLowerCase().includes('net avg return')
              );
              const nextColAfterNetAvg = summaryCols[netAvgReturnIdx + 1];
              const includeNextCagr =
                !isMacroPortfolio &&
                netAvgReturnIdx >= 0 &&
                nextColAfterNetAvg &&
                resolvedLabel(nextColAfterNetAvg).toUpperCase() === 'CAGR';
              const summaryColsFiltered = isMacroPortfolio && avgHoldingTimeIdx >= 0
                ? summaryCols.slice(0, avgHoldingTimeIdx + 1)
                : netAvgReturnIdx >= 0
                  ? summaryCols.slice(0, netAvgReturnIdx + 1 + (includeNextCagr ? 1 : 0))
                  : summaryCols;
              // For cumulative row removal: year columns sit after first CAGR; use first col after slice to detect 10000 row if needed
              const isYearColumn = (label: string) => /^20(1[8-9]|2[0-6])$/.test(label.replace(/,/g, '').trim());
              const yearColKeys = summaryCols.filter(
                (key) => isYearColumn(resolvedLabel(key))
              );
              const firstYearKey = yearColKeys[0];
              // Remove the row that contains cumulative year values (10,000, 14,025, … 102,769) per client
              const summaryRowsToShow = firstYearKey
                ? summaryRowsFiltered.filter((row) => {
                    const v = getVal(row as Record<string, unknown>, firstYearKey);
                    const n = Number(v);
                    return !(n >= 9999 && n <= 10001);
                  })
                : summaryRowsFiltered;
              // Remove rows that have no data in the truncated columns (all empty or "—")
              const summaryRowsToShowFiltered = summaryRowsToShow
                .filter((row) =>
                  summaryColsFiltered.some((key) => {
                    const val = getVal(row as Record<string, unknown>, key);
                    const label = labelByCol[key] || '';
                    const raw = val != null ? String(val).trim() : '';
                    const display = label
                      ? formatSummaryValue(label, val)
                      : raw === ''
                        ? '\u00a0'
                        : /^-?[\d.]+$/.test(raw)
                          ? formatSummaryValue('', val)
                          : raw;
                    return display !== '—' && display !== '\u00a0' && String(display).trim() !== '';
                  })
                )
                .filter((row) => {
                  // Remove the redundant name line (sheet title + dashes) below the main header on all sheets
                  const nonEmpty = summaryColsFiltered
                    .map((key) => {
                      const val = getVal(row as Record<string, unknown>, key);
                      const label = labelByCol[key] || '';
                      const raw = val != null ? String(val).trim() : '';
                      const display = label
                        ? formatSummaryValue(label, val)
                        : raw === ''
                          ? '\u00a0'
                          : /^-?[\d.]+$/.test(raw)
                            ? formatSummaryValue('', val)
                            : raw;
                      return display;
                    })
                    .filter((d) => d !== '—' && d !== '\u00a0' && String(d).trim() !== '');
                  const normalize = (v: unknown) => String(v).replace(/\s+/g, ' ').trim();
                  const titleNorm = normalize(titleText);
                  const onlyTitle =
                    nonEmpty.length === 1 && normalize(nonEmpty[0]) === titleNorm;
                  const onlyOpenPositions =
                    nonEmpty.length === 1 &&
                    /^open positions?$/i.test(normalize(nonEmpty[0]));
                  // Drop both the duplicated title row and the OPEN POSITIONS label row
                  return !onlyTitle && !onlyOpenPositions;
                });
              if (summaryColsFiltered.length === 0) return null;
              return (
                <div className="sticky top-14 z-20 bg-slate-700 text-white overflow-hidden border-x border-slate-600 shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs sm:text-sm border-collapse">
                      <tbody>
                        {summaryRowsToShowFiltered.map((row, rIdx) => (
                          <tr key={row.row_index ?? rIdx}>
                            {summaryColsFiltered.map((key) => {
                              const val = getVal(row as Record<string, unknown>, key);
                              const label = labelByCol[key] || '';
                              const raw = val != null ? String(val).trim() : '';
                              const display = label ? formatSummaryValue(label, val) : (raw === '' ? '\u00a0' : /^-?[\d.]+$/.test(raw) ? formatSummaryValue('', val) : raw);
                              const isLabelRow = rIdx === 0;
                              const labelLower = label.toLowerCase();
                              const isSummaryReturnCol = labelLower.includes('return $') || labelLower.includes('returns %') || labelLower.includes('return %') || labelLower.includes('net avg return');
                              const num = Number(val);
                              const summaryPositive = isSummaryReturnCol && !Number.isNaN(num) && num > 0;
                              const summaryNegative = isSummaryReturnCol && !Number.isNaN(num) && num < 0;
                              const summaryCellClass = summaryPositive
                                ? 'bg-emerald-700 text-white font-semibold'
                                : summaryNegative
                                  ? 'bg-red-600 text-white font-semibold'
                                  : isLabelRow
                                    ? 'text-slate-200 font-medium border-b border-slate-600'
                                    : 'font-semibold';
                              return (
                                <td
                                  key={key}
                                  className={`px-3 py-1.5 whitespace-nowrap ${summaryCellClass}`}
                                >
                                  {display}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="absolute right-0 top-0 bottom-0 w-8 flex items-center justify-end pointer-events-none bg-gradient-to-l from-slate-700 to-transparent" aria-hidden>
                    <ChevronRight className="w-5 h-5 text-white/80 shrink-0" />
                  </div>
                </div>
              );
            })()}

            {/* Main table – only columns that exist in sheet (row 6 header). Sticky thead when scrolling table. */}
            {headerCols.length > 0 && (
              <div className="border border-slate-200 border-t-0 rounded-b-lg bg-white overflow-hidden relative">
                <div className="overflow-auto max-h-[calc(100vh-14rem)]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200">
                      <tr>
                        {headerCols.map(({ key, label }) => (
                          <th
                            key={key}
                            className="text-left py-3 px-3 font-semibold text-slate-700 whitespace-nowrap"
                          >
                            {label}
                          </th>
                        ))}
                        <th className="w-8 shrink-0 bg-slate-100 border-b border-slate-200" aria-hidden>
                          <span className="flex items-center justify-end pr-1 text-slate-400" title="Scroll for more columns">
                            <ChevronRight className="w-5 h-5" />
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const coloredReturnCol = headerCols.find(({ label }) => {
                          const lower = label.toLowerCase();
                          return portfolioPage === 'dow30'
                            ? isDow30ColoredColumn(label) && lower.includes('%')
                            : isStrategyReturnPctColumn(label);
                        });
                        const macroDetailRows =
                          (portfolioPage === 'macro-etf' || portfolioPage === 'macro-3x')
                            ? dataRows.slice(0, -2)
                            : dataRows;
                        return macroDetailRows.map((row, idx) => {
                          const returnVal = coloredReturnCol ? getVal(row as Record<string, unknown>, coloredReturnCol.key) : null;
                          const returnNum = Number(returnVal);
                          const rowIsPositive = !Number.isNaN(returnNum) && returnNum > 0;
                          return (
                        <tr
                          key={row.row_index ?? idx}
                          className="border-b border-slate-100 hover:bg-slate-50"
                        >
                          {headerCols.map(({ key, label }) => {
                            const val = getVal(row as Record<string, unknown>, key);
                            const { text, isPositive, isNegative, isBold, isAlgoScore } = formatCell(
                              label,
                              val,
                              portfolioPage
                            );
                            const cellClass =
                              isPositive
                                ? 'bg-emerald-700 text-white font-semibold'
                                : isNegative
                                  ? 'bg-red-600 text-white font-semibold'
                                  : isAlgoScore && rowIsPositive
                                    ? 'bg-emerald-100 text-emerald-900'
                                    : '';
                            return (
                              <td
                                key={key}
                                className={`py-3 px-3 text-slate-900 max-w-xs truncate ${cellClass} ${isBold ? 'font-bold' : ''}`}
                                title={text}
                              >
                                {text}
                              </td>
                            );
                          })}
                          <td className="w-8 shrink-0 bg-white" aria-hidden />
                        </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="mt-4 text-xs text-slate-500">
              Information is provided &apos;as is&apos; and solely for informational purposes,
              not for trading purposes or advice. Disclaimer
            </p>
          </>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white py-8 text-center text-slate-500 text-sm">
            No data for this portfolio yet.
          </div>
        )}
      </main>
    </div>
  );
}
