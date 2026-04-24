'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, BarChart3, Radar } from 'lucide-react';
import { AppHeader } from './app-header';
import { TickerIcon } from './ui/ticker-icon';
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

function isTradeEconomicsColumnLabel(label: string): boolean {
  const h = label.toLowerCase().replace(/,/g, '');
  if (h.includes('avg gain')) return true;
  if (h.includes('avg loss')) return true;
  if (h.includes('net avg')) return true;
  if (h.includes('start') && (h.includes('date') || h.includes('buy'))) return true;
  if (h.includes('avg holding')) return true;
  return false;
}

type PortfolioSummaryModel = {
  summaryColsFiltered: string[];
  labelByCol: Record<string, string>;
  summaryRowsToShowFiltered: PortfolioSheetRow[];
  resolvedLabel: (key: string) => string;
};

function buildPortfolioSummaryModel(
  summaryRowsFiltered: PortfolioSheetRow[],
  colKeys: string[],
  headerRow: Record<string, unknown> | undefined,
  portfolioPage: DetailPageKey,
  titleText: string,
): PortfolioSummaryModel | null {
  if (summaryRowsFiltered.length === 0) return null;
  const summaryCols = colKeys.filter((key) =>
    summaryRowsFiltered.some((row) => {
      const v = getVal(row as Record<string, unknown>, key);
      return v != null && String(v).trim() !== '';
    }),
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
  const headerLabel = (key: string) =>
    headerRow ? String(getVal(headerRow as Record<string, unknown>, key) ?? '').trim() : '';
  const resolvedLabel = (key: string) =>
    (labelByCol[key] || headerLabel(key)).replace(/,/g, '').trim();
  const isMacroPortfolio = portfolioPage === 'macro-etf' || portfolioPage === 'macro-3x';
  const avgHoldingTimeIdx = summaryCols.findIndex((key) =>
    resolvedLabel(key).toLowerCase().includes('avg holding time'),
  );
  const netAvgReturnIdx = summaryCols.findIndex((key) =>
    resolvedLabel(key).toLowerCase().includes('net avg return'),
  );
  const nextColAfterNetAvg = summaryCols[netAvgReturnIdx + 1];
  const includeNextCagr =
    !isMacroPortfolio &&
    netAvgReturnIdx >= 0 &&
    nextColAfterNetAvg &&
    resolvedLabel(nextColAfterNetAvg).toUpperCase() === 'CAGR';
  const summaryColsFiltered =
    isMacroPortfolio && avgHoldingTimeIdx >= 0
      ? summaryCols.slice(0, avgHoldingTimeIdx + 1)
      : netAvgReturnIdx >= 0
        ? summaryCols.slice(0, netAvgReturnIdx + 1 + (includeNextCagr ? 1 : 0))
        : summaryCols;

  const isYearColumn = (label: string) => /^20(1[8-9]|2[0-6])$/.test(label.replace(/,/g, '').trim());
  const yearColKeys = summaryCols.filter((key) => isYearColumn(resolvedLabel(key)));
  const firstYearKey = yearColKeys[0];
  const summaryRowsToShow = firstYearKey
    ? summaryRowsFiltered.filter((row) => {
        const v = getVal(row as Record<string, unknown>, firstYearKey);
        const n = Number(v);
        return !(n >= 9999 && n <= 10001);
      })
    : summaryRowsFiltered;

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
      }),
    )
    .filter((row) => {
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
      const onlyTitle = nonEmpty.length === 1 && normalize(nonEmpty[0]) === titleNorm;
      const onlyOpenPositions =
        nonEmpty.length === 1 && /^open positions?$/i.test(normalize(nonEmpty[0]));
      return !onlyTitle && !onlyOpenPositions;
    });

  if (summaryColsFiltered.length === 0) return null;
  return {
    summaryColsFiltered,
    labelByCol,
    summaryRowsToShowFiltered,
    resolvedLabel,
  };
}

function summaryCellTone(label: string, rawVal: unknown): 'pos' | 'neg' | 'neutral' {
  const labelLower = label.toLowerCase();
  const isSummaryReturnCol =
    labelLower.includes('return $') ||
    labelLower.includes('returns %') ||
    labelLower.includes('return %') ||
    labelLower.includes('net avg return');
  if (!isSummaryReturnCol) return 'neutral';
  const num = Number(rawVal);
  if (Number.isNaN(num)) return 'neutral';
  if (num > 0) return 'pos';
  if (num < 0) return 'neg';
  return 'neutral';
}

/** Order headline metrics like the reference design (Portfolio Value → Return → CAGR → Hit Rate). */
/** Sheet sometimes repeats the portfolio title as its own “metric” tile — hide it (already in page header). */
function isRedundantTitleStatTile(label: string, display: string, titleText: string): boolean {
  const compact = (s: string) =>
    s.replace(/\s+/g, ' ').replace(/:/g, '').replace(/,/g, '').trim().toLowerCase();
  const titleC = compact(titleText);
  const labelC = compact(label);
  const disp = display.replace(/\u2014/g, '-').replace(/\u2212/g, '-').trim();
  if (labelC === titleC) return true;
  if (compact(disp) === titleC && disp.length > 0) return true;
  const looksLikePortfolioTitle =
    /momentum\s+picks|weekly\s+momentum|large\s+cap|nasdaq|macro\s+etf/i.test(label) &&
    (/picks/i.test(label) || /combined/i.test(label));
  if (looksLikePortfolioTitle && (disp === '—' || disp === '-' || disp === '')) return true;
  return false;
}

function sortStatKeysForDesign(statKeys: string[], m: PortfolioSummaryModel): string[] {
  const rank = (key: string): number => {
    const l = m.resolvedLabel(key).toLowerCase();
    if (l.includes('portfolio value')) return 0;
    if ((l.includes('total') && l.includes('return')) || (l.includes('return') && l.includes('$') && !l.includes('%')))
      return 1;
    if (l.includes('cagr')) return 2;
    if (l.includes('hit rate')) return 3;
    return 10;
  };
  return [...statKeys].sort((a, b) => rank(a) - rank(b) || m.resolvedLabel(a).localeCompare(m.resolvedLabel(b)));
}

/** Keys shown only as secondary line under another card (same row values), not as their own stat tile. */
function supplementalStatKeysForDesign(statKeysSorted: string[], m: PortfolioSummaryModel): Set<string> {
  const hide = new Set<string>();
  const labs = statKeysSorted.map((k) => m.resolvedLabel(k).toLowerCase());
  if (labs.some((l) => l.includes('portfolio value'))) {
    for (const k of statKeysSorted) {
      const l = m.resolvedLabel(k).toLowerCase();
      if (l.includes('initial') && (l.includes('value') || l.includes('capital'))) hide.add(k);
      if (
        (l.includes('cash') || l.includes('invested')) &&
        !l.includes('cagr') &&
        !l.includes('return')
      )
        hide.add(k);
    }
  }
  if (labs.some((l) => l.includes('return') && l.includes('$'))) {
    for (const k of statKeysSorted) {
      const l = m.resolvedLabel(k).toLowerCase();
      if ((l.includes('return') || l.includes('returns')) && l.includes('%') && !l.includes('net avg')) hide.add(k);
    }
  }
  if (labs.some((l) => l.includes('hit rate'))) {
    for (const k of statKeysSorted) {
      const l = m.resolvedLabel(k).toLowerCase();
      if (l.includes('net avg')) hide.add(k);
    }
  }
  return hide;
}

function statCardSubtitle(
  cardKey: string,
  m: PortfolioSummaryModel,
  valueRow: PortfolioSheetRow,
  statKeysSorted: string[],
): string | null {
  const row = valueRow as Record<string, unknown>;
  const lab = m.resolvedLabel(cardKey).toLowerCase();
  const fmt = (k: string) =>
    formatSummaryValue(m.labelByCol[k] ?? m.resolvedLabel(k), getVal(row, k));
  const findKey = (pred: (l: string) => boolean) =>
    statKeysSorted.find((k) => pred(m.resolvedLabel(k).toLowerCase()));

  if (lab.includes('portfolio value')) {
    const ik = findKey((l) => l.includes('initial'));
    const ck = findKey((l) => (l.includes('cash') || l.includes('invested')) && !l.includes('cagr'));
    const parts: string[] = [];
    if (ik) parts.push(`Initial ${fmt(ik)}`);
    if (ck) parts.push(`${m.resolvedLabel(ck)} ${fmt(ck)}`);
    return parts.length ? parts.join(' · ') : null;
  }
  if ((lab.includes('total') && lab.includes('return')) || (lab.includes('return') && lab.includes('$'))) {
    const pk = findKey((l) => (l.includes('return') || l.includes('returns')) && l.includes('%') && !l.includes('net'));
    if (pk) return `${fmt(pk)} returns`;
  }
  if (lab.includes('cagr')) return 'Compound annual';
  if (lab.includes('hit rate')) {
    const nk = findKey((l) => l.includes('net avg'));
    if (nk) return `Net avg ${fmt(nk)} / trade`;
  }
  return null;
}

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
  const { rows, loading, error, refetch } = usePortfolioSheet(config.tableKey);

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

  const summaryModel = useMemo(
    () =>
      buildPortfolioSummaryModel(
        summaryRowsFiltered,
        colKeys,
        headerRow as Record<string, unknown> | undefined,
        portfolioPage,
        titleText,
      ),
    [summaryRowsFiltered, colKeys, headerRow, portfolioPage, titleText],
  );

  const macroDetailRows =
    portfolioPage === 'macro-etf' || portfolioPage === 'macro-3x' ? dataRows.slice(0, -2) : dataRows;

  const tradeKeys = useMemo(() => {
    if (!summaryModel) return [];
    return summaryModel.summaryColsFiltered.filter((key) =>
      isTradeEconomicsColumnLabel(summaryModel.resolvedLabel(key)),
    );
  }, [summaryModel]);

  const statKeys = useMemo(() => {
    if (!summaryModel) return [];
    const nonTrade = summaryModel.summaryColsFiltered.filter(
      (key) => !isTradeEconomicsColumnLabel(summaryModel.resolvedLabel(key)),
    );
    return nonTrade.length > 0 ? nonTrade : summaryModel.summaryColsFiltered;
  }, [summaryModel]);

  const showTradeEconomics = useMemo(() => {
    if (!summaryModel) return false;
    const nonTrade = summaryModel.summaryColsFiltered.filter(
      (key) => !isTradeEconomicsColumnLabel(summaryModel.resolvedLabel(key)),
    );
    return nonTrade.length > 0 && tradeKeys.length > 0;
  }, [summaryModel, tradeKeys]);

  const summaryValueRow = useMemo(() => {
    if (!summaryModel || summaryModel.summaryRowsToShowFiltered.length === 0) return null;
    const rowsShown = summaryModel.summaryRowsToShowFiltered;
    return rowsShown.length >= 2 ? rowsShown[1] : rowsShown[0];
  }, [summaryModel]);

  const pageSubtitle = useMemo(() => {
    if (!summaryModel || !summaryValueRow) {
      return `${macroDetailRows.length} positions`;
    }
    const startKey = summaryModel.summaryColsFiltered.find((k) => {
      const lab = summaryModel.resolvedLabel(k).toLowerCase();
      return lab.includes('start') && (lab.includes('date') || lab.includes('buy'));
    });
    const startText = startKey
      ? formatSummaryValue(
          summaryModel.labelByCol[startKey] ?? '',
          getVal(summaryValueRow as Record<string, unknown>, startKey),
        )
      : null;
    const startPart = startText && startText !== '—' ? startText : null;
    return `Weekly log${startPart ? ` · tracked since ${startPart}` : ''} · ${macroDetailRows.length} positions`;
  }, [summaryModel, summaryValueRow, macroDetailRows.length]);

  const logWinLosers = (() => {
    const coloredReturnCol = headerCols.find(({ label }) => {
      const lower = label.toLowerCase();
      return portfolioPage === 'dow30'
        ? isDow30ColoredColumn(label) && lower.includes('%')
        : isStrategyReturnPctColumn(label);
    });
    if (!coloredReturnCol) return { wins: 0, losses: 0 };
    let wins = 0;
    let losses = 0;
    for (const row of macroDetailRows) {
      const returnVal = getVal(row as Record<string, unknown>, coloredReturnCol.key);
      const returnNum = Number(returnVal);
      if (Number.isNaN(returnNum)) continue;
      if (returnNum > 0) wins += 1;
      else if (returnNum < 0) losses += 1;
    }
    return { wins, losses };
  })();

  const statKeysSorted = useMemo(() => {
    if (!summaryModel) return [];
    return sortStatKeysForDesign(statKeys, summaryModel);
  }, [summaryModel, statKeys]);

  const statGridKeys = useMemo(() => {
    if (!summaryModel || !summaryValueRow) return [];
    const hide = supplementalStatKeysForDesign(statKeysSorted, summaryModel);
    const row = summaryValueRow as Record<string, unknown>;
    return statKeysSorted.filter((k) => {
      if (hide.has(k)) return false;
      const label = summaryModel.labelByCol[k] || summaryModel.resolvedLabel(k);
      const raw = getVal(row, k);
      const display = label ? formatSummaryValue(label, raw) : String(raw ?? '—');
      return !isRedundantTitleStatTile(label, display, titleText);
    });
  }, [summaryModel, statKeysSorted, summaryValueRow, titleText]);

  const pickLogScrollRef = useRef<HTMLDivElement>(null);
  const [pickLogScrollEdges, setPickLogScrollEdges] = useState({ canLeft: false, canRight: false });

  const syncPickLogScrollability = useCallback(() => {
    const el = pickLogScrollRef.current;
    if (!el) {
      setPickLogScrollEdges({ canLeft: false, canRight: false });
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setPickLogScrollEdges({
      canLeft: scrollLeft > 2,
      canRight: scrollLeft + clientWidth < scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = pickLogScrollRef.current;
    if (!el) return;
    syncPickLogScrollability();
    const ro = new ResizeObserver(() => syncPickLogScrollability());
    ro.observe(el);
    el.addEventListener('scroll', syncPickLogScrollability, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', syncPickLogScrollability);
    };
  }, [syncPickLogScrollability, macroDetailRows.length, headerCols.length]);

  const pickLogScrollStep = useCallback(() => {
    const el = pickLogScrollRef.current;
    if (!el) return 200;
    return Math.max(160, Math.floor(el.clientWidth * 0.45));
  }, []);

  const scrollPickLogRight = useCallback(() => {
    const el = pickLogScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: pickLogScrollStep(), behavior: 'smooth' });
  }, [pickLogScrollStep]);

  const scrollPickLogLeft = useCallback(() => {
    const el = pickLogScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: -pickLogScrollStep(), behavior: 'smooth' });
  }, [pickLogScrollStep]);

  return (
    <div className="min-h-screen w-full min-w-0 bg-muted/25">
      <AppHeader
        userEmail={userEmail}
        currentAppMode={currentAppMode}
        onGoToPortfolio={onGoToPortfolio}
        onGoToMWS={onGoToMWS}
        onSignOut={onSignOut}
      />
      <main className="w-full min-w-0 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 xl:px-10 2xl:px-12">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-violet-600" />
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error.message}
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            {/* Page header — weeklystock page-header */}
            <div className="mb-5 flex w-full min-w-0 flex-col items-stretch justify-between gap-3 sm:mb-6 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-[1.45rem] md:text-[1.75rem]">
                  {titleText}
                </h1>
                <p className="mt-1 text-xs leading-snug text-muted-foreground sm:text-[13px]">{pageSubtitle}</p>
              </div>
              <div className="flex w-full min-w-0 shrink-0 flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 sm:w-auto sm:justify-start sm:text-[13px]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Portfolio
                </button>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  disabled={loading}
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50 sm:w-auto sm:justify-start sm:text-[13px]"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Stat grid — headline KPI cards (reference layout) */}
            {summaryModel && summaryValueRow && statGridKeys.length > 0 && (
              <div className="mb-4 grid w-full min-w-0 grid-cols-1 gap-3 sm:mb-5 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]">
                {statGridKeys.map((key) => {
                  const label = summaryModel.labelByCol[key] || summaryModel.resolvedLabel(key);
                  const raw = getVal(summaryValueRow as Record<string, unknown>, key);
                  const display = label ? formatSummaryValue(label, raw) : String(raw ?? '—');
                  const tone = summaryCellTone(label, raw);
                  const valueClass =
                    tone === 'pos'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : tone === 'neg'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-foreground';
                  const sub = statCardSubtitle(key, summaryModel, summaryValueRow, statKeysSorted);
                  return (
                    <div
                      key={key}
                      className="flex min-h-[102px] min-w-0 flex-col justify-between rounded-xl border border-border bg-card p-3.5 shadow-sm sm:min-h-[108px] sm:p-4"
                    >
                      <div className="text-[11px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
                        {label}
                      </div>
                      <div>
                        <div
                          className={`mt-1.5 font-sans text-[1.125rem] font-semibold leading-none tracking-tight sm:text-[1.25rem] md:text-[1.375rem] lg:text-[1.5rem] ${valueClass}`}
                        >
                          {display}
                        </div>
                        {sub && (
                          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{sub}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Trade economics — weeklystock section + pulse-group-head */}
            {summaryModel && summaryValueRow && showTradeEconomics && (
              <div className="mb-4 w-full min-w-0 rounded-xl border border-border bg-card shadow-sm sm:mb-5 sm:rounded-2xl">
                <div className="flex w-full min-w-0 flex-col gap-1.5 rounded-t-xl border-b border-border bg-muted/40 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 sm:px-4 sm:py-3.5 sm:rounded-t-2xl">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
                      <BarChart3 className="h-[13px] w-[13px]" />
                    </span>
                    <span className="text-[11px] font-semibold uppercase leading-tight tracking-[0.08em] text-muted-foreground">
                      Trade economics
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] leading-tight text-muted-foreground sm:text-right">
                    Average P&amp;L per position
                  </span>
                </div>
                <div className="w-full min-w-0 rounded-b-xl sm:rounded-b-2xl">
                  <div className="flex w-full min-w-0 flex-col divide-y divide-border sm:min-w-max sm:flex-row sm:divide-x sm:divide-y-0">
                    {tradeKeys.map((key) => {
                      const label = summaryModel.labelByCol[key] || summaryModel.resolvedLabel(key);
                      const raw = getVal(summaryValueRow as Record<string, unknown>, key);
                      const display = label ? formatSummaryValue(label, raw) : String(raw ?? '—');
                      const tone = summaryCellTone(label, raw);
                      const labLower = label.toLowerCase();
                      const valueColor =
                        labLower.includes('avg gain') || (tone === 'pos' && labLower.includes('net'))
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : labLower.includes('avg loss') || tone === 'neg'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-foreground';
                      return (
                        <div
                          key={key}
                          className="flex min-w-0 flex-col gap-1 px-3 py-3 sm:min-w-[8.5rem] sm:flex-1 sm:basis-0 sm:px-4 sm:py-3.5"
                        >
                          <div className="text-[10px] font-semibold uppercase leading-tight tracking-wider text-muted-foreground">
                            {label}
                          </div>
                          <div className={`font-mono text-sm font-semibold tabular-nums leading-tight sm:text-base ${valueColor}`}>
                            {display}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Weekly pick log + table */}
            {headerCols.length > 0 && (
              <div className="flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:rounded-2xl">
                <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-between gap-2 rounded-t-xl border-b border-border bg-muted/40 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 sm:rounded-t-2xl">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      <Radar className="h-[13px] w-[13px]" />
                    </span>
                    <span className="text-[11px] font-semibold uppercase leading-tight tracking-[0.08em] text-muted-foreground">
                      Weekly pick log
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {macroDetailRows.length}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] leading-tight text-muted-foreground sm:gap-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        {logWinLosers.wins} winners
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        {logWinLosers.losses} losers
                      </span>
                    </div>
                    <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-border/70 pl-2 sm:ml-2 sm:pl-3">
                      <button
                        type="button"
                        aria-label="Scroll table to the left"
                        disabled={!pickLogScrollEdges.canLeft}
                        onClick={scrollPickLogLeft}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="Scroll table to the right"
                        disabled={!pickLogScrollEdges.canRight}
                        onClick={scrollPickLogRight}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>
                <div
                  ref={pickLogScrollRef}
                  className="min-h-0 w-full max-w-full min-w-0 max-h-[min(70vh,640px)] flex-1 overflow-x-auto overflow-y-auto overscroll-x-contain rounded-b-xl bg-card [-webkit-overflow-scrolling:touch] sm:max-h-[min(75vh,720px)] sm:rounded-b-2xl"
                >
                  <table className="w-full min-w-[max(100%,max-content)] border-separate border-spacing-0 text-left text-[11px] leading-snug text-foreground antialiased sm:text-[12px]">
                    <thead>
                      <tr>
                        {headerCols.map(({ key, label }) => (
                          <th
                            key={key}
                            className="sticky top-0 z-20 whitespace-nowrap border-b border-border bg-card px-2.5 py-2.5 text-left text-[10px] font-semibold uppercase leading-tight tracking-[0.05em] text-muted-foreground shadow-sm first:pl-3 last:pr-3 sm:px-3 sm:py-3 sm:text-[10.5px] sm:first:pl-4 sm:last:pr-4"
                          >
                            {label}
                          </th>
                        ))}
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
                        return macroDetailRows.map((row, idx) => {
                          const returnVal = coloredReturnCol
                            ? getVal(row as Record<string, unknown>, coloredReturnCol.key)
                            : null;
                          const returnNum = Number(returnVal);
                          const rowIsPositive = !Number.isNaN(returnNum) && returnNum > 0;
                          return (
                            <tr
                              key={row.row_index ?? idx}
                              className="transition-colors hover:bg-muted/40 [&>td]:border-b [&>td]:border-border [&:last-child>td]:border-b-0"
                            >
                              {headerCols.map(({ key, label }) => {
                                const val = getVal(row as Record<string, unknown>, key);
                                const { text, isPositive, isNegative, isBold, isAlgoScore } = formatCell(
                                  label,
                                  val,
                                  portfolioPage,
                                );
                                const labLower = label.toLowerCase();
                                const isTickerCol = labLower.includes('ticker');
                                const usePill =
                                  (isPositive || isNegative) &&
                                  !isTickerCol &&
                                  !isAlgoScore &&
                                  (labLower.includes('return') ||
                                    labLower.includes('%') ||
                                    labLower.includes('p&l'));
                                const cellPad =
                                  isAlgoScore && rowIsPositive
                                    ? 'bg-emerald-500/8'
                                    : '';
                                const n = Number(val);
                                const algoPct =
                                  isAlgoScore && !Number.isNaN(n) ? Math.min(100, Math.max(0, n)) : null;
                                return (
                                  <td
                                    key={key}
                                    className={`whitespace-nowrap bg-card px-2.5 py-2 align-middle font-sans text-[11px] first:pl-3 last:pr-3 sm:px-3 sm:py-2.5 sm:text-[12px] sm:first:pl-4 sm:last:pr-4 ${cellPad} ${
                                      isBold && !isTickerCol ? 'font-semibold' : ''
                                    } ${!isTickerCol && !isAlgoScore && !usePill ? 'font-mono text-[11px] tabular-nums text-foreground sm:text-[11.5px] md:text-[12px]' : ''}`}
                                    title={text.length > 24 ? text : undefined}
                                  >
                                    {isTickerCol && text !== '—' ? (
                                      <div className="flex items-center gap-2">
                                        <div className="flex h-7 w-7 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                                          <TickerIcon ticker={text} size={28} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
                                        </div>
                                        <span className="font-sans text-[11px] font-semibold tracking-tight text-foreground sm:text-[12px]">
                                          {text}
                                        </span>
                                      </div>
                                    ) : usePill ? (
                                      <span
                                        className={`inline-flex rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums leading-tight sm:text-[11.5px] ${
                                          isPositive
                                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                                        }`}
                                      >
                                        {text}
                                      </span>
                                    ) : isAlgoScore && algoPct != null ? (
                                      <div className="flex min-w-[96px] max-w-[140px] items-center gap-1.5">
                                        <div className="h-1.5 min-w-[48px] flex-1 overflow-hidden rounded-full bg-muted">
                                          <div
                                            className={`h-full rounded-full ${
                                              algoPct >= 95
                                                ? 'bg-emerald-500'
                                                : algoPct >= 90
                                                  ? 'bg-amber-500'
                                                  : 'bg-violet-500'
                                            }`}
                                            style={{ width: `${algoPct}%` }}
                                          />
                                        </div>
                                        <span className="w-7 shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
                                          {text}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="tabular-nums">{text}</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground sm:text-xs md:text-[12px]">
              Information is provided &apos;as is&apos; and solely for informational purposes, not for trading
              purposes or advice. Disclaimer
            </p>
          </>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
            No data for this portfolio yet.
          </div>
        )}
      </main>
    </div>
  );
}
