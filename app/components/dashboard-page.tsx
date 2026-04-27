'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, AlertCircle, Search, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { TickerIcon } from './ui/ticker-icon';
import { AppHeader } from './app-header';
import type { PageView } from '../types';
import type { AppMode } from '../types';
import { useDashboardData } from '../../lib/hooks/useDashboardData';

// Mapping of ticker symbols to display names (matching index-page.tsx)
const TICKER_TO_DISPLAY_NAME: Record<string, string> = {
  SPY: 'S&P500',
  QQQ: 'Nasdaq',
  IWM: 'Small Caps',
  TLT: 'Treasuries',
  UUP: 'US Dollar fund',
  GLD: 'Gold',
  SLV: 'Silver',
  IBIT: 'Bitcoin',
  ETHA: 'Ethereum',
  USO: 'Oil',
  XLK: 'Technology',
  XLC: 'Communication Services',
  SMH: 'Semiconductors',
  XLY: 'Consumer Cyclicals',
  XLF: 'Financials',
  XLI: 'Industrials',
  XLE: 'Energy',
  XLB: 'Materials',
  XLRE: 'Real Estate',
  XLU: 'Utilities',
  XLV: 'Healthcare',
  XLP: 'Consumer Defensive',
};

const SEGMENT_ORDER = ['SPY', 'QQQ', 'IWM', 'TLT', 'UUP', 'GLD', 'SLV', 'IBIT', 'ETHA', 'USO'];
const SECTOR_ORDER = ['XLK', 'XLC', 'SMH', 'XLY', 'XLF', 'XLI', 'XLE', 'XLB', 'XLRE', 'XLU', 'XLV', 'XLP'];

type TrendFilter = 'all' | 'up' | 'flat' | 'down';

interface TableRow {
  segment: string;
  ticker: string;
  perf1M: number | null;
  perf3M: number | null;
  vsHigh: number | null;
  trendScore: number;
  rating: string;
  outlook: string;
}

interface DashboardPageProps {
  userEmail: string;
  onSignOut: () => void;
  onNavigate: (page: PageView, ticker?: string) => void;
  currentAppMode: AppMode;
  onGoToPortfolio: () => void;
  onGoToMWS: () => void;
}

function toNumeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatPercentSigned(value: number | null, decimals = 1) {
  if (value == null) return '—';
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  const rounded = Number(pct.toFixed(decimals));
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
}

/** Center-zero perf bar (design); maxAbs scales bar fill */
function vsHighToneClasses(pct: number): { text: string; bar: string } {
  if (pct >= -5) return { text: 'text-emerald-600', bar: 'bg-emerald-500' };
  if (pct >= -10) return { text: 'text-amber-600', bar: 'bg-amber-500' };
  return { text: 'text-red-600', bar: 'bg-red-500' };
}

function PerfBar({ value, maxAbs, mode = 'default' }: { value: number | null; maxAbs: number; mode?: 'default' | 'vsHigh' }) {
  if (value == null) {
    return (
      <div className="flex min-w-[120px] items-center gap-2">
        <span className="min-w-[52px] text-left font-mono text-xs text-muted-foreground">—</span>
        <div className="relative h-1.5 flex-1 rounded-full bg-muted" />
      </div>
    );
  }
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  const clamped = Math.max(-maxAbs, Math.min(maxAbs, pct));
  const widthPct = maxAbs > 0 ? (Math.abs(clamped) / maxAbs) * 50 : 0;
  const pos = clamped >= 0;
  const tone = mode === 'vsHigh' ? vsHighToneClasses(pct) : null;
  const valueClass = tone ? tone.text : (pos ? 'text-emerald-600' : 'text-red-600');
  const barClass = tone ? tone.bar : (pos ? 'bg-emerald-500' : 'bg-red-500');
  return (
    <div className="flex min-w-[120px] max-w-full items-center gap-2">
      <span
        className={`min-w-[52px] text-left font-mono text-xs font-medium tabular-nums ${valueClass}`}
      >
        {formatPercentSigned(value, 1)}
      </span>
      <div className="relative h-1.5 flex-1 rounded-full bg-muted">
        <span className="absolute left-1/2 top-0 z-[1] h-full w-px -translate-x-1/2 bg-border" aria-hidden />
        {clamped !== 0 && (
          <span
            className={`absolute top-0 h-full rounded-full ${pos ? 'left-1/2' : 'right-1/2'} ${barClass}`}
            style={{ width: `${widthPct}%` }}
          />
        )}
      </div>
    </div>
  );
}

function ScoreBars({ score }: { score: number }) {
  const s = Math.max(0, Math.min(5, score));
  const full = Math.floor(s);
  const partial = s - full >= 0.5 ? 1 : 0;
  const filled = Math.min(5, full + partial);
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-1.5 rounded-sm ${i < filled ? 'bg-amber-500' : 'bg-muted'}`}
          />
        ))}
      </div>
      <span className="min-w-[2rem] font-mono text-sm font-semibold tabular-nums text-foreground">{s.toFixed(1)}</span>
    </div>
  );
}

function ratingChipClass(rating: string): string {
  const r = rating.toLowerCase();
  if (r.includes('strong') && r.includes('up')) {
    return 'bg-emerald-600 text-white border-transparent';
  }
  if (r.includes('strong') && r.includes('down')) {
    return 'bg-red-600 text-white border-transparent';
  }
  if (r.includes('up')) {
    return 'bg-emerald-100 text-emerald-800 border-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800';
  }
  if (r.includes('down')) {
    return 'bg-red-100 text-red-800 border-red-200/80 dark:bg-red-950/50 dark:text-red-200 dark:border-red-800';
  }
  return 'bg-muted text-foreground border-border';
}

function RatingChip({ rating }: { rating: string }) {
  return (
    <span
      className={`inline-flex max-w-full items-center justify-center truncate rounded-full border px-2.5 py-0.5 text-xs font-medium ${ratingChipClass(rating)}`}
      title={rating}
    >
      {rating}
    </span>
  );
}

function outlookDotClass(outlook: string): { dot: string; text: string } {
  const o = outlook.toLowerCase();
  if (o.includes('stable')) {
    return { dot: 'bg-green-600', text: 'text-foreground' };
  }
  if (o.includes('firm')) {
    return { dot: 'bg-emerald-500', text: 'text-foreground' };
  }
  if (o.includes('cool')) {
    return { dot: 'bg-orange-600', text: 'text-foreground' };
  }
  if (o.includes('soft')) {
    return { dot: 'bg-amber-800', text: 'text-foreground' };
  }
  if (o.includes('warm')) {
    return { dot: 'bg-cyan-700', text: 'text-foreground' };
  }
  if (o.includes('extend')) {
    return { dot: 'bg-amber-500', text: 'text-foreground' };
  }
  if (o.includes('revers')) {
    return { dot: 'bg-red-500', text: 'text-foreground' };
  }
  return { dot: 'bg-muted-foreground/60', text: 'text-muted-foreground' };
}

function OutlookCell({ outlook }: { outlook: string }) {
  const { dot, text } = outlookDotClass(outlook);
  return (
    <div className={`flex items-center justify-start gap-2 text-xs ${text}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full  shadow-none outline-none ${dot}`} aria-hidden />
      <span className="max-w-[140px] truncate">{outlook}</span>
    </div>
  );
}

function applyRowFilter(rows: TableRow[], q: string, filter: TrendFilter): TableRow[] {
  let out = rows;
  const n = q.trim().toLowerCase();
  if (n) {
    out = out.filter((x) => x.segment.toLowerCase().includes(n) || x.ticker.toLowerCase().includes(n));
  }
  if (filter === 'up') out = out.filter((x) => x.trendScore >= 3);
  else if (filter === 'flat') out = out.filter((x) => x.trendScore >= 2 && x.trendScore < 3);
  else if (filter === 'down') out = out.filter((x) => x.trendScore < 2);
  return out;
}

function groupSummary(rows: TableRow[]) {
  const upN = rows.filter((x) => x.trendScore >= 3).length;
  const dnN = rows.filter((x) => x.trendScore < 2).length;
  const avg = rows.length ? (rows.reduce((s, x) => s + x.trendScore, 0) / rows.length).toFixed(1) : '—';
  return { upN, dnN, avg };
}

export function DashboardPage({
  userEmail,
  onSignOut,
  onNavigate,
  currentAppMode,
  onGoToPortfolio,
  onGoToMWS,
}: DashboardPageProps) {
  const [timeframe, setTimeframe] = useState<'D' | 'W'>('D');
  const [query, setQuery] = useState('');
  const [trendFilter, setTrendFilter] = useState<TrendFilter>('all');
  const { segments, sectors, loading, error, refetch } = useDashboardData(timeframe);

  const handleRefresh = async () => {
    await refetch();
  };

  const getLastUpdatedDate = (): string | null => {
    const allItems = [...segments, ...sectors];
    if (allItems.length === 0) return null;
    let mostRecent: Date | null = null;
    allItems.forEach((item) => {
      const dateStr = (item as { updated_at?: string }).updated_at;
      if (dateStr) {
        const date = new Date(dateStr);
        if (!Number.isNaN(date.getTime()) && (mostRecent === null || date > mostRecent)) {
          mostRecent = date;
        }
      }
    });
    if (mostRecent === null) return null;
    const formatted: Date = mostRecent;
    return formatted.toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  };

  const lastUpdated = getLastUpdatedDate();

  const getDisplayName = (ticker: string, dbName: string | null | undefined) =>
    TICKER_TO_DISPLAY_NAME[ticker] || dbName || ticker;

  const sortByOrder = <T extends { ticker: string }>(items: T[], order: string[]): T[] =>
    [...items].sort((a, b) => {
      const ia = order.indexOf(a.ticker);
      const ib = order.indexOf(b.ticker);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return 0;
    });

  const transformToTableData = (item: Record<string, unknown>, getSegmentName: (item: Record<string, unknown>) => string): TableRow => {
    const isDaily = timeframe === 'D';
    const perf1M = toNumeric(item['1m_percent'] ?? item.daily_1m_percent);
    const perf3M = toNumeric(item['3m_percent'] ?? item.daily_3m_percent);
    const vsHigh = toNumeric(item['vs_1y_high'] ?? item.daily_vs_1y_high);
    const trendScore = isDaily ? toNumeric(item.daily_trend_score) : toNumeric(item.weekly_trend_score);
    const rating = isDaily ? item.daily_rating : item.weekly_rating;
    const resolvedScore = trendScore ?? 0;
    const outlook = String(isDaily ? (item.daily_outlook ?? '') : (item.weekly_outlook ?? '')).trim() || 'Stable';
    return {
      segment: getSegmentName(item),
      ticker: String(item.ticker ?? ''),
      perf1M,
      perf3M,
      vsHigh,
      trendScore: resolvedScore,
      rating: rating != null ? String(rating) : 'N/A',
      outlook,
    };
  };

  const marketSegmentsData: TableRow[] = useMemo(
    () =>
      sortByOrder(
        segments.map((s) =>
          transformToTableData(s as unknown as Record<string, unknown>, (it) =>
            getDisplayName(String(it.ticker), it.name as string | undefined),
          ),
        ),
        SEGMENT_ORDER,
      ),
    [segments, timeframe],
  );

  const sectorsData: TableRow[] = useMemo(
    () =>
      sortByOrder(
        sectors.map((s) =>
          transformToTableData(s as unknown as Record<string, unknown>, (it) =>
            getDisplayName(String(it.ticker), it.sector_name as string | undefined),
          ),
        ),
        SECTOR_ORDER,
      ),
    [sectors, timeframe],
  );

  const filteredSegments = useMemo(
    () => applyRowFilter(marketSegmentsData, query, trendFilter),
    [marketSegmentsData, query, trendFilter],
  );
  const filteredSectors = useMemo(() => applyRowFilter(sectorsData, query, trendFilter), [sectorsData, query, trendFilter]);

  const segSummary = useMemo(() => groupSummary(marketSegmentsData), [marketSegmentsData]);
  const secSummary = useMemo(() => groupSummary(sectorsData), [sectorsData]);

  const subtitleParts = [
    'Performance & trend across market segments and sectors',
    lastUpdated ? `last updated ${lastUpdated}` : null,
  ].filter(Boolean);

  const FilterButton = ({
    label,
    pressed,
    onClick,
  }: {
    label: string;
    pressed: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
        pressed ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );

  const renderPulseGroup = (
    titleUpper: string,
    allRows: TableRow[],
    filteredRows: TableRow[],
    summary: { upN: number; dnN: number; avg: string },
  ) => (
    <div className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border bg-muted/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titleUpper}</span>
          <span className="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {allRows.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground sm:text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>{summary.upN} up</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            <span>{summary.dnN} down</span>
          </span>
          <span className="hidden h-3 w-px bg-border sm:inline-block" aria-hidden />
          <span>
            Avg <strong className="font-mono text-foreground">{summary.avg}</strong>
          </span>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">No rows match your filters.</div>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:px-5">
                  Asset
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">1-Month</th>
                <th className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">3-Month</th>
                <th className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">vs 1Y High</th>
                <th className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    Score
                    <ChevronDown className="h-3 w-3 opacity-50" aria-hidden />
                  </span>
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Rating</th>
                <th className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Outlook</th>
                <th className="w-10 px-2 py-3" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.ticker}
                  className="cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-muted/40"
                  onClick={() => onNavigate('ticker-analysis', row.ticker)}
                >
                  <td className="px-4 py-3 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                        <TickerIcon ticker={row.ticker} size={36} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground sm:text-base">{row.segment}</div>
                        <div className="font-mono text-xs text-muted-foreground">{row.ticker}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <PerfBar value={row.perf1M} maxAbs={20} />
                  </td>
                  <td className="px-3 py-3">
                    <PerfBar value={row.perf3M} maxAbs={30} />
                  </td>
                  <td className="px-3 py-3">
                    <PerfBar value={row.vsHigh} maxAbs={40} mode="vsHigh" />
                  </td>
                  <td className="px-3 py-3">
                    <ScoreBars score={row.trendScore} />
                  </td>
                  <td className="px-3 py-3 text-left">
                    <RatingChip rating={row.rating} />
                  </td>
                  <td className="px-3 py-3">
                    <OutlookCell outlook={row.outlook} />
                  </td>
                  <td className="px-2 py-3 text-muted-foreground">
                    <ChevronRight className="mx-auto h-4 w-4" aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader
        userEmail={userEmail}
        currentAppMode={currentAppMode}
        onGoToPortfolio={onGoToPortfolio}
        onGoToMWS={onGoToMWS}
        onSignOut={onSignOut}
        onBack={() => onNavigate('index')}
        backLabel="Back to MWS"
      />

      <main className="flex w-full flex-1 flex-col px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        {/* Page header — same content as before, layout matches design */}
        <div className="mb-4 flex w-full flex-col gap-4 lg:mb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl md:text-[1.75rem]">
              MWS&apos;s Momentum Pulse Check
            </h1>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{subtitleParts.join(' · ')}</p>
          </div>
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <div className="inline-flex rounded-xl border border-border bg-muted/60 p-1">
              <button
                type="button"
                aria-pressed={timeframe === 'D'}
                onClick={() => setTimeframe('D')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium sm:text-sm ${
                  timeframe === 'D' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                D
              </button>
              <button
                type="button"
                aria-pressed={timeframe === 'W'}
                onClick={() => setTimeframe('W')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium sm:text-sm ${
                  timeframe === 'W' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                W
              </button>
            </div>
            <Button onClick={handleRefresh} disabled={loading} size="sm" variant="outline" className="h-9 gap-2 rounded-lg">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Toolbar — search + trend filters (client-side only, same dataset) */}
        {!loading && !error && (
          <div className="mb-4 flex w-full flex-col gap-3 lg:mb-5 lg:flex-row lg:items-center lg:gap-4">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter tickers…"
                className="h-10 w-full rounded-xl border border-border bg-card py-2 pl-10 pr-3 text-sm text-foreground shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="inline-flex shrink-0 flex-wrap rounded-xl border border-border bg-muted/60 p-1">
              <FilterButton label="All" pressed={trendFilter === 'all'} onClick={() => setTrendFilter('all')} />
              <FilterButton label="Uptrends" pressed={trendFilter === 'up'} onClick={() => setTrendFilter('up')} />
              <FilterButton label="Sideways" pressed={trendFilter === 'flat'} onClick={() => setTrendFilter('flat')} />
              <FilterButton label="Downtrends" pressed={trendFilter === 'down'} onClick={() => setTrendFilter('down')} />
            </div>
          </div>
        )}

        {loading && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <RefreshCw className="mx-auto mb-3 h-7 w-7 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading data from Supabase...</p>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40 sm:p-6">
            <div className="mb-2 flex items-center gap-2 text-red-800 dark:text-red-200">
              <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5" />
              <h3 className="text-sm font-semibold sm:text-base">Error loading data</h3>
            </div>
            <p className="text-xs text-red-700 dark:text-red-300 sm:text-sm">{error.message}</p>
            <Button onClick={handleRefresh} variant="outline" size="sm" className="mt-4">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && (
          <div className="flex w-full flex-1 flex-col gap-4 pb-8 sm:gap-5">
            {renderPulseGroup('Market segments', marketSegmentsData, filteredSegments, segSummary)}
            {renderPulseGroup('Sectors', sectorsData, filteredSectors, secSummary)}
          </div>
        )}
      </main>
    </div>
  );
}
