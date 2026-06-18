'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { RefreshCw, AlertCircle, Search, ChevronRight, ChevronDown, Star, X } from 'lucide-react';
import { Button } from './ui/button';
import { TickerIcon } from './ui/ticker-icon';
import { AppHeader } from './app-header';
import type { PageView } from '../types';
import type { AppMode } from '../types';
import { useDashboardData } from '../../lib/hooks/useDashboardData';
import { fetchFormulaRatingLabels, DEFAULT_FORMULA_NUMBERS, fetchFormulaNumericSettings, mergeFormulaDefaults } from '@/lib/queries/formula-display';
import {
  ratingBadgeClassName,
  ratingBadgeInlineStyle,
  trendOutlookDotClass,
  type TrendScoreTierThresholds,
} from '@/lib/mws-formula-badges';
import {
  PERFORMANCE_TONE_BAR_CLASS,
  PERFORMANCE_TONE_TEXT_CLASS,
  performanceToneFromPercent,
  toDisplayPercent,
} from '@/lib/mws-performance-tone';
import {
  matchesTrendStatusFilter,
  trendStatusSummary,
  type TrendStatusFilter,
} from '@/lib/mws-trend-rating-filters';
import { useMwsHubPreferences } from '@/lib/hooks/useMwsHubPreferences';
import type { HubPersonalTicker } from '@/lib/mws-hub-prefs';

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

/** Client feedback #4: Semiconductors (SMH) removed from sector dashboard. */
const EXCLUDED_SECTOR_TICKERS = new Set(['SMH']);

type TrendFilter = TrendStatusFilter;

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

function PerfBar({ value, maxAbs, mode = 'default' }: { value: number | null; maxAbs: number; mode?: 'default' | 'vsHigh' }) {
  if (value == null) {
    return (
      <div className="flex min-w-[120px] items-center gap-2">
        <span className="min-w-[52px] text-left font-mono text-xs text-muted-foreground">—</span>
        <div className="relative h-1.5 flex-1 rounded-full bg-muted" />
      </div>
    );
  }
  const pct = toDisplayPercent(value);
  const clamped = Math.max(-maxAbs, Math.min(maxAbs, pct));
  const widthPct = maxAbs > 0 ? (Math.abs(clamped) / maxAbs) * 50 : 0;
  const visibleWidthPct = clamped !== 0 ? (mode === 'vsHigh' ? Math.max(widthPct, 10) : widthPct) : 0;
  const pos = clamped >= 0;
  const tone =
    mode === 'vsHigh'
      ? { text: 'text-muted-foreground', bar: 'bg-neutral-400 dark:bg-neutral-500' }
      : (() => {
          const t = performanceToneFromPercent(pct);
          return { text: PERFORMANCE_TONE_TEXT_CLASS[t], bar: PERFORMANCE_TONE_BAR_CLASS[t] };
        })();
  const valueClass = tone.text;
  const barClass = tone.bar;
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
            style={{ width: `${visibleWidthPct}%` }}
          />
        )}
      </div>
    </div>
  );
}

function ScoreBars({ score, rating, ratingRows }: { score: number; rating: string; ratingRows: { tier: string; label: string; color_hex?: string | null }[] }) {
  const s = Math.max(0, Math.min(5, score));
  const full = Math.floor(s);
  const partial = s - full >= 0.5 ? 1 : 0;
  const filled = Math.min(5, full + partial);
  const tone = ratingBadgeInlineStyle(rating, ratingRows)?.backgroundColor ?? '#f59e0b';
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-1.5 rounded-sm ${i < filled ? '' : 'bg-muted'}`}
            style={{ backgroundColor: i < filled ? tone : undefined }}
          />
        ))}
      </div>
      <span className="min-w-[2rem] font-mono text-sm font-semibold tabular-nums text-foreground">{s.toFixed(1)}</span>
    </div>
  );
}

function RatingChip({ rating, ratingRows }: { rating: string; ratingRows: { tier: string; label: string; color_hex?: string | null }[] }) {
  return (
    <span
      className={`inline-flex max-w-full items-center justify-center truncate rounded-full border px-2.5 py-0.5 text-xs font-medium ${ratingBadgeClassName(rating, ratingRows)}`}
      style={ratingBadgeInlineStyle(rating, ratingRows)}
      title={rating}
    >
      {rating}
    </span>
  );
}

function outlookDotClass(outlook: string): { dot: string; text: string } {
  return { dot: trendOutlookDotClass(outlook), text: 'text-foreground' };
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

function applyRowFilter(
  rows: TableRow[],
  q: string,
  filter: TrendFilter,
  thresholds: TrendScoreTierThresholds,
): TableRow[] {
  let out = rows;
  const n = q.trim().toLowerCase();
  if (n) {
    out = out.filter((x) => x.segment.toLowerCase().includes(n) || x.ticker.toLowerCase().includes(n));
  }
  if (filter !== 'all') {
    out = out.filter((x) => matchesTrendStatusFilter(x.trendScore, filter, thresholds));
  }
  return out;
}

function groupSummary(rows: TableRow[], thresholds: TrendScoreTierThresholds) {
  const { upN, sidewaysN, dnN, avg } = trendStatusSummary(
    rows.map((x) => x.trendScore),
    thresholds,
  );
  return { upN, sidewaysN, dnN, avg };
}

function sortByTrendScoreDesc(rows: TableRow[]): TableRow[] {
  return [...rows].sort((a, b) => b.trendScore - a.trendScore || a.segment.localeCompare(b.segment));
}

function buildTickerRecordMap(
  segments: Array<Record<string, unknown>>,
  sectors: Array<Record<string, unknown>>,
  megaCaps: Array<Record<string, unknown>>,
  otherStocks: Array<Record<string, unknown>>,
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  const add = (items: Array<Record<string, unknown>>) => {
    for (const item of items) {
      const t = String(item.ticker ?? '').toUpperCase();
      if (t) map.set(t, item);
    }
  };
  add(segments);
  add(sectors);
  add(megaCaps);
  add(otherStocks);
  return map;
}

function resolvePulseFavorites(personal: HubPersonalTicker[], saved: HubPersonalTicker[]): HubPersonalTicker[] {
  if (saved.length > 0) return saved.slice(0, 10);
  return personal.slice(0, 10);
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
  const [ratingLabelRows, setRatingLabelRows] = useState<{ tier: string; label: string; color_hex?: string | null }[]>([]);
  const [scoreThresholds, setScoreThresholds] = useState<TrendScoreTierThresholds>({
    score_strong: DEFAULT_FORMULA_NUMBERS.score_strong,
    score_mixed_high: DEFAULT_FORMULA_NUMBERS.score_mixed_high,
    score_mixed_low: DEFAULT_FORMULA_NUMBERS.score_mixed_low,
    score_weak: DEFAULT_FORMULA_NUMBERS.score_weak,
  });
  const [favoritesEditorOpen, setFavoritesEditorOpen] = useState(false);
  const { prefs, setPrefs } = useMwsHubPreferences();
  const { segments, sectors, megaCaps, otherStocks, loading, error, refetch } = useDashboardData(timeframe);

  useEffect(() => {
    let cancelled = false;
    fetchFormulaNumericSettings()
      .then((partial) => {
        if (cancelled) return;
        const merged = mergeFormulaDefaults(partial);
        setScoreThresholds({
          score_strong: merged.score_strong,
          score_mixed_high: merged.score_mixed_high,
          score_mixed_low: merged.score_mixed_low,
          score_weak: merged.score_weak,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchFormulaRatingLabels()
      .then((rows) => {
        if (!cancelled) setRatingLabelRows(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
      sortByTrendScoreDesc(
        segments.map((s) =>
          transformToTableData(s as unknown as Record<string, unknown>, (it) =>
            getDisplayName(String(it.ticker), it.name as string | undefined),
          ),
        ),
      ),
    [segments, timeframe],
  );

  const sectorsData: TableRow[] = useMemo(
    () =>
      sortByTrendScoreDesc(
        sectors
          .filter((s) => !EXCLUDED_SECTOR_TICKERS.has(String(s.ticker).toUpperCase()))
          .map((s) =>
            transformToTableData(s as unknown as Record<string, unknown>, (it) =>
              getDisplayName(String(it.ticker), it.sector_name as string | undefined),
            ),
          ),
      ),
    [sectors, timeframe],
  );

  const tickerRecordMap = useMemo(
    () =>
      buildTickerRecordMap(
        segments as unknown as Array<Record<string, unknown>>,
        sectors as unknown as Array<Record<string, unknown>>,
        megaCaps as unknown as Array<Record<string, unknown>>,
        otherStocks as unknown as Array<Record<string, unknown>>,
      ),
    [segments, sectors, megaCaps, otherStocks],
  );

  const activePulseFavorites = useMemo(
    () => resolvePulseFavorites(prefs.personalTickers, prefs.pulseFavorites ?? []),
    [prefs.personalTickers, prefs.pulseFavorites],
  );

  const favoritesData: TableRow[] = useMemo(() => {
    const rows: TableRow[] = [];
    for (const fav of activePulseFavorites) {
      const item = tickerRecordMap.get(fav.ticker.toUpperCase());
      if (!item) continue;
      const name =
        fav.name ||
        String(item.name ?? item.sector_name ?? item.company_name ?? fav.ticker);
      rows.push(
        transformToTableData(item, () => getDisplayName(fav.ticker, name)),
      );
    }
    return sortByTrendScoreDesc(rows);
  }, [activePulseFavorites, tickerRecordMap, timeframe]);

  const filteredFavorites = useMemo(
    () => applyRowFilter(favoritesData, query, trendFilter, scoreThresholds),
    [favoritesData, query, trendFilter, scoreThresholds],
  );

  const favSummary = useMemo(() => groupSummary(favoritesData, scoreThresholds), [favoritesData, scoreThresholds]);

  const filteredSegments = useMemo(
    () => applyRowFilter(marketSegmentsData, query, trendFilter, scoreThresholds),
    [marketSegmentsData, query, trendFilter, scoreThresholds],
  );
  const filteredSectors = useMemo(
    () => applyRowFilter(sectorsData, query, trendFilter, scoreThresholds),
    [sectorsData, query, trendFilter, scoreThresholds],
  );

  const segSummary = useMemo(() => groupSummary(marketSegmentsData, scoreThresholds), [marketSegmentsData, scoreThresholds]);
  const secSummary = useMemo(() => groupSummary(sectorsData, scoreThresholds), [sectorsData, scoreThresholds]);

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
    summary: { upN: number; sidewaysN: number; dnN: number; avg: string },
    headerExtra?: ReactNode,
  ) => (
    <div className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border bg-muted/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titleUpper}</span>
          <span className="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {allRows.length}
          </span>
          {headerExtra}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground sm:text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>{summary.upN} up</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span>{summary.sidewaysN} sideways</span>
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
                    <PerfBar value={row.vsHigh} maxAbs={12} mode="vsHigh" />
                  </td>
                  <td className="px-3 py-3">
                    <ScoreBars score={row.trendScore} rating={row.rating} ratingRows={ratingLabelRows} />
                  </td>
                  <td className="px-3 py-3 text-left">
                    <RatingChip rating={row.rating} ratingRows={ratingLabelRows} />
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
                Daily
              </button>
              <button
                type="button"
                aria-pressed={timeframe === 'W'}
                onClick={() => setTimeframe('W')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium sm:text-sm ${
                  timeframe === 'W' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Weekly
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
            {favoritesEditorOpen && (
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">Select up to 10 favorites (from Your Tickers)</p>
                  <button
                    type="button"
                    onClick={() => setFavoritesEditorOpen(false)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {prefs.personalTickers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Add tickers under <strong>Your Tickers</strong> on the MWS home page first.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {prefs.personalTickers.map((t) => {
                      const selected = (prefs.pulseFavorites ?? []).some(
                        (f) => f.ticker.toUpperCase() === t.ticker.toUpperCase(),
                      );
                      return (
                        <button
                          key={t.ticker}
                          type="button"
                          onClick={() => {
                            setPrefs((p) => {
                              const current = p.pulseFavorites ?? [];
                              const exists = current.some((f) => f.ticker.toUpperCase() === t.ticker.toUpperCase());
                              if (exists) {
                                return {
                                  ...p,
                                  pulseFavorites: current.filter(
                                    (f) => f.ticker.toUpperCase() !== t.ticker.toUpperCase(),
                                  ),
                                };
                              }
                              if (current.length >= 10) return p;
                              return { ...p, pulseFavorites: [...current, t] };
                            });
                          }}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            selected
                              ? 'border-violet-500/40 bg-violet-500/15 text-foreground'
                              : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {t.ticker}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {renderPulseGroup(
              'Favorites',
              favoritesData,
              filteredFavorites,
              favSummary,
              <button
                type="button"
                onClick={() => setFavoritesEditorOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <Star className="h-3 w-3" />
                Select
              </button>,
            )}
            {renderPulseGroup('Market segments', marketSegmentsData, filteredSegments, segSummary)}
            {renderPulseGroup('Sectors', sectorsData, filteredSectors, secSummary)}
          </div>
        )}
      </main>
    </div>
  );
}
