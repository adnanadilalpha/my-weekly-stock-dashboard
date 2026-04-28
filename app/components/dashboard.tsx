'use client';

/**
 * MWS hub / “Momentum Pulse Check” home — layout aligned with `weeklystock/hub.jsx` + styles.
 * Re-exported as `IndexPage` from `index-page.tsx` for `app/page.tsx`.
 */

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  LayoutGrid,
  Activity,
  Search,
  ChevronRight,
  RefreshCw,
  SlidersHorizontal,
  Layers,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { Button } from './ui/button';
import { TickerIcon } from './ui/ticker-icon';
import { AppHeader } from './app-header';
import { MwsHubCustomizeDialog, type CuratedHubRow } from './mws-hub-customize-dialog';
import type { PageView } from '../types';
import type { AppMode } from '../types';
import { getAllTickers, tickerMatchesSearchQuery } from '../../lib/queries/ticker';
import { useMwsHubPreferences } from '@/lib/hooks/useMwsHubPreferences';
import { fetchHubTickerMetricsMap } from '@/lib/queries/hub-ticker-metrics';
import type { HubTickerMetric } from '@/lib/queries/hub-ticker-metrics';
import type { HubSectionKey } from '@/lib/mws-hub-prefs';

export interface IndexPageProps {
  userEmail: string;
  onSignOut: () => void;
  onNavigate: (page: PageView, ticker?: string) => void;
  currentAppMode: AppMode;
  onGoToPortfolio: () => void;
  onGoToMWS: () => void;
}

const SEGMENTS = [
  'S&P500',
  'Nasdaq',
  'Small Caps',
  'Treasuries',
  'US Dollar fund',
  'Gold',
  'Silver',
  'Bitcoin',
  'Ethereum',
  'Oil',
];

const SECTORS = [
  'Technology',
  'Telecommunication Services',
  'Semiconductors',
  'Consumer Cyclicals',
  'Financials',
  'Industrials',
  'Energy',
  'Materials',
  'Real Estate',
  'Utilities',
  'Healthcare',
  'Consumer Defensive',
];

const LARGE_CAPS = [
  'Nvidia',
  'Microsoft',
  'Apple',
  'Alphabet',
  'Amazon',
  'Meta',
  'Tesla',
  'JPMorgan',
  'Walmart',
  'Eli Lilly',
  'Broadcom',
  'Cisco Systems',
  "McDonald's",
  'Visa',
  'Wells Fargo',
  'Citigroup',
  'Oracle',
  'Morgan Stanley',
  'Applovin',
  'Mastercard',
  'Coca-Cola Company',
  'Intuitive Surgical',
  'Exxon Mobil',
  'Goldman Sachs',
  'Linde',
  'Johnson & Johnson',
  'Caterpillar',
  'Intel',
  'Palantir',
  'International Business Machines',
  'Disney',
  'Netflix',
  'Merck',
  'Qualcomm',
  'Bank of America',
  'American Express',
  'PepsiCo',
  'Costco',
  'Lam Research',
  'Blackstone',
  'Micron',
  'Salesforce',
  'Amgen',
  'Home Depot',
  'RTX Corporation',
  'Charles Schwab',
  'GE Aerospace',
  'Thermo Fisher Scientific',
  'Intuit',
  'Advanced Micro Devices',
  'Applied Materials',
  'GE Vernova',
  'Procter & Gamble',
  'Abbott Laboratories',
  'Uber',
  'Chevron',
  'T-Mobile US',
  'Boeing',
  'UnitedHealth Group',
  'Shopify',
];

const TICKER_MAP: Record<string, string> = {
  'S&P500': 'SPY',
  Nasdaq: 'QQQ',
  'Small Caps': 'IWM',
  Treasuries: 'TLT',
  'US Dollar fund': 'UUP',
  Gold: 'GLD',
  Silver: 'SLV',
  Bitcoin: 'IBIT',
  Ethereum: 'ETHA',
  Oil: 'USO',
  Technology: 'XLK',
  'Telecommunication Services': 'XLC',
  Semiconductors: 'SMH',
  'Consumer Cyclicals': 'XLY',
  Financials: 'XLF',
  Industrials: 'XLI',
  Energy: 'XLE',
  Materials: 'XLB',
  'Real Estate': 'XLRE',
  Utilities: 'XLU',
  Healthcare: 'XLV',
  'Consumer Defensive': 'XLP',
  Nvidia: 'NVDA',
  Microsoft: 'MSFT',
  Apple: 'AAPL',
  Alphabet: 'GOOG',
  Amazon: 'AMZN',
  Meta: 'META',
  Tesla: 'TSLA',
  JPMorgan: 'JPM',
  Walmart: 'WMT',
  'Eli Lilly': 'LLY',
  Broadcom: 'AVGO',
  'Cisco Systems': 'CSCO',
  "McDonald's": 'MCD',
  Visa: 'V',
  'Wells Fargo': 'WFC',
  Citigroup: 'C',
  Oracle: 'ORCL',
  'Morgan Stanley': 'MS',
  Applovin: 'APP',
  Mastercard: 'MA',
  'Coca-Cola Company': 'KO',
  'Intuitive Surgical': 'ISRG',
  'Exxon Mobil': 'XOM',
  'Goldman Sachs': 'GS',
  Linde: 'LIN',
  'Johnson & Johnson': 'JNJ',
  Caterpillar: 'CAT',
  Intel: 'INTC',
  Palantir: 'PLTR',
  'International Business Machines': 'IBM',
  Disney: 'DIS',
  Netflix: 'NFLX',
  Merck: 'MRK',
  Qualcomm: 'QCOM',
  'Bank of America': 'BAC',
  'American Express': 'AXP',
  PepsiCo: 'PEP',
  Costco: 'COST',
  'Lam Research': 'LRCX',
  Blackstone: 'BX',
  Micron: 'MU',
  Salesforce: 'CRM',
  Amgen: 'AMGN',
  'Home Depot': 'HD',
  'RTX Corporation': 'RTX',
  'Charles Schwab': 'SCHW',
  'GE Aerospace': 'GE',
  'Thermo Fisher Scientific': 'TMO',
  Intuit: 'INTU',
  'Advanced Micro Devices': 'AMD',
  'Applied Materials': 'AMAT',
  'GE Vernova': 'GEV',
  'Procter & Gamble': 'PG',
  'Abbott Laboratories': 'ABT',
  Uber: 'UBER',
  Chevron: 'CVX',
  'T-Mobile US': 'TMUS',
  Boeing: 'BA',
  'UnitedHealth Group': 'UNH',
  Shopify: 'SHOP',
};

const CURATED_HUB_ROWS: CuratedHubRow[] = [
  ...SEGMENTS.map((name) => ({ name, ticker: TICKER_MAP[name] })),
  ...SECTORS.map((name) => ({ name, ticker: TICKER_MAP[name] })),
  ...LARGE_CAPS.map((name) => ({ name, ticker: TICKER_MAP[name] })),
];

function formatM1Chip(m1: number | null): string {
  if (m1 == null || Number.isNaN(m1)) return '—';
  const pct = Math.abs(m1) <= 1 ? m1 * 100 : m1;
  const rounded = Number(pct.toFixed(1));
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
}

export function IndexPage({
  userEmail,
  onSignOut,
  onNavigate,
  currentAppMode,
  onGoToPortfolio,
  onGoToMWS,
}: IndexPageProps) {
  const { prefs, setPrefs, resetPrefs, loadError, saveError, flushSave } = useMwsHubPreferences();
  const [searchQuery, setSearchQuery] = useState('');
  const [dbTickers, setDbTickers] = useState<string[]>([]);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [showAllLargeCaps, setShowAllLargeCaps] = useState(false);
  const [tickersVersion, setTickersVersion] = useState(0);
  const [metricsMap, setMetricsMap] = useState<Map<string, HubTickerMetric>>(() => new Map());
  const [metricsLoading, setMetricsLoading] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadTickers = useCallback(async () => {
    try {
      const rows = await getAllTickers();
      setDbTickers(rows);
    } catch {
      /* keep static lists */
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const m = await fetchHubTickerMetricsMap();
      setMetricsMap(m);
    } catch {
      setMetricsMap(new Map());
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickers();
  }, [loadTickers, tickersVersion]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics, tickersVersion]);

  const allSearchLabels = useMemo(() => {
    const curated = [...SEGMENTS, ...SECTORS, ...LARGE_CAPS];
    const merged = new Set<string>([...curated, ...dbTickers]);
    return Array.from(merged);
  }, [dbTickers]);

  // Picker list for customization modal: curated names + full DB ticker universe
  // (includes other_stocks), deduped by ticker.
  const customizePickerRows = useMemo<CuratedHubRow[]>(() => {
    const byTicker = new Map<string, CuratedHubRow>();

    for (const row of CURATED_HUB_ROWS) {
      const t = row.ticker.toUpperCase();
      if (!t) continue;
      byTicker.set(t, { name: row.name, ticker: t });
    }

    for (const raw of dbTickers) {
      const t = String(raw).trim().toUpperCase();
      if (!t) continue;
      if (byTicker.has(t)) continue;
      const metricName = metricsMap.get(t)?.name?.trim();
      byTicker.set(t, { name: metricName || t, ticker: t });
    }

    return Array.from(byTicker.values()).sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      return a.ticker.localeCompare(b.ticker);
    });
  }, [dbTickers, metricsMap]);

  const searchHits = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    return allSearchLabels
      .filter((item) => tickerMatchesSearchQuery(item, q))
      .slice(0, 8)
      .map((label) => {
        const ticker = (TICKER_MAP[label] || label).toUpperCase();
        return { label, ticker, metric: metricsMap.get(ticker) ?? null };
      });
  }, [searchQuery, allSearchLabels, metricsMap]);

  const handleSelectHit = (ticker: string) => {
    onNavigate('ticker-analysis', ticker);
    setSearchQuery('');
  };

  const updatedLine = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const largePreview = showAllLargeCaps ? LARGE_CAPS : LARGE_CAPS.slice(0, 12);

  const visibleOrder = useMemo(() => {
    return prefs.order.filter((k) => {
      if (prefs.hidden[k]) return false;
      if (k === 'personal' && prefs.personalTickers.length === 0) return false;
      return true;
    });
  }, [prefs.order, prefs.hidden, prefs.personalTickers]);

  const handleCustomizeOpenChange = useCallback(
    async (open: boolean) => {
      if (!open) await flushSave();
      setCustomizeOpen(open);
    },
    [flushSave],
  );

  const TickerPill = ({
    label,
    tickerOverride,
  }: {
    label: string;
    tickerOverride?: string;
  }) => {
    const ticker = (tickerOverride ?? TICKER_MAP[label] ?? label).toUpperCase();
    const m = metricsMap.get(ticker);
    const m1 = m?.m1 ?? null;
    const m1Pct = m1 == null || Number.isNaN(m1) ? null : (Math.abs(m1) <= 1 ? m1 * 100 : m1);
    const chip =
      m1Pct == null
        ? 'bg-muted/80 text-muted-foreground'
        : m1Pct > 1
          ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
          : m1Pct < -1
            ? 'bg-rose-500/15 text-rose-800 dark:text-rose-300'
            : 'bg-amber-500/15 text-amber-800 dark:text-amber-300';
    return (
      <button
        type="button"
        onClick={() => onNavigate('ticker-analysis', ticker)}
        className="flex w-full min-w-0 items-stretch rounded-[10px] border border-border bg-muted/40 text-left transition-colors hover:border-border hover:bg-card"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5">
          <span className="flex h-[26px] w-[26px] shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
            <TickerIcon ticker={ticker} size={26} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground sm:text-[13px]">{label}</span>
          <span
            className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${chip}`}
            title="1-month return"
            aria-label={`1-month return ${formatM1Chip(m1)}`}
          >
            {formatM1Chip(m1)}
          </span>
        </span>
      </button>
    );
  };

  const GroupCard = ({
    title,
    count,
    icon,
    iconWrapClass,
    children,
  }: {
    title: string;
    count: number;
    icon: React.ReactNode;
    iconWrapClass: string;
    children: ReactNode;
  }) => (
    <div className="overflow-hidden rounded-[18px] border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-5 py-[18px]">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-transparent ${iconWrapClass}`}
          >
            {icon}
          </span>
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</span>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
          {count}
        </span>
      </div>
      {children}
    </div>
  );

  const renderSection = (key: HubSectionKey): ReactNode => {
    switch (key) {
      case 'personal':
        return (
          <GroupCard
            key="personal"
            title="YOUR TICKERS"
            count={prefs.personalTickers.length}
            icon={<Sparkles className="h-[15px] w-[15px] text-violet-700" />}
            iconWrapClass="bg-violet-100 dark:bg-violet-950/40"
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 px-5 py-4">
              {prefs.personalTickers.map((t) => (
                <TickerPill key={t.ticker} label={t.name || t.ticker} tickerOverride={t.ticker} />
              ))}
            </div>
          </GroupCard>
        );
      case 'segments':
        return (
          <GroupCard
            key="segments"
            title="Segment ticker page"
            count={SEGMENTS.length}
            icon={<Layers className="h-[15px] w-[15px] text-primary" />}
            iconWrapClass="bg-secondary"
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 px-5 py-4">
              {SEGMENTS.map((segment) => (
                <TickerPill key={segment} label={segment} />
              ))}
            </div>
          </GroupCard>
        );
      case 'sectors':
        return (
          <GroupCard
            key="sectors"
            title="Sector ticker pages"
            count={SECTORS.length}
            icon={<BarChart3 className="h-[15px] w-[15px] text-emerald-600" />}
            iconWrapClass="bg-emerald-100 dark:bg-emerald-950/40"
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 px-5 py-4">
              {SECTORS.map((sector) => (
                <TickerPill key={sector} label={sector} />
              ))}
            </div>
          </GroupCard>
        );
      case 'large':
        return (
          <GroupCard
            key="large"
            title="Large caps ticker pages"
            count={LARGE_CAPS.length}
            icon={<LayoutGrid className="h-[15px] w-[15px] text-amber-700" />}
            iconWrapClass="bg-amber-100 dark:bg-amber-950/40"
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 px-5 py-4">
              {largePreview.map((stock) => (
                <TickerPill key={stock} label={stock} />
              ))}
            </div>
            {!showAllLargeCaps && LARGE_CAPS.length > 12 && (
              <div className="border-t border-dashed border-border px-5 py-3.5 text-center">
                <Button
                  type="button"
                  variant="ghost"
                  className="gap-1.5 text-[13px] text-primary hover:text-foreground"
                  onClick={() => setShowAllLargeCaps(true)}
                >
                  View all {LARGE_CAPS.length} tickers
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </GroupCard>
        );
      default:
        return null;
    }
  };

  const renderedGroups: ReactNode[] = [];
  {
    let i = 0;
    while (i < visibleOrder.length) {
      const k = visibleOrder[i];
      const next = visibleOrder[i + 1];
      const pairSeg =
        (k === 'segments' && next === 'sectors') || (k === 'sectors' && next === 'segments');
      if (pairSeg) {
        const first = k;
        const second = next as HubSectionKey;
        const a = renderSection(first);
        const b = renderSection(second);
        if (a != null || b != null) {
          renderedGroups.push(
            <div
              key={`seg-row-${i}`}
              className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:grid-rows-1 lg:items-start lg:gap-5"
            >
              {a}
              {b}
            </div>,
          );
        }
        i += 2;
      } else {
        const node = renderSection(k);
        if (node != null) renderedGroups.push(<div key={k}>{node}</div>);
        i += 1;
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader
        userEmail={userEmail}
        currentAppMode={currentAppMode}
        onGoToPortfolio={onGoToPortfolio}
        onGoToMWS={onGoToMWS}
        onSignOut={onSignOut}
      />

      <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-7 lg:px-8 xl:px-10 2xl:px-12">
        <div className="w-full min-w-0 space-y-5 sm:space-y-6">
          {/* Page header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-[1.65rem] md:text-[1.85rem] lg:text-[2rem]">
                MWS&apos;s Momentum Pulse Check
              </h1>
              <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
                Market Analysis Dashboard · updated {updatedLine}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
                Ticker chip % shows 1-month return.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-2 rounded-lg border-border bg-card"
                onClick={() => setCustomizeOpen(true)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Customize
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-2 rounded-lg border-border bg-card"
                disabled={metricsLoading}
                onClick={() => {
                  setTickersVersion((v) => v + 1);
                  void loadMetrics();
                }}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${metricsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {(loadError || saveError) && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {loadError && <p>Could not load your saved layout: {loadError.message}</p>}
              {saveError && <p className={loadError ? 'mt-1' : ''}>Could not save your layout: {saveError.message}</p>}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground sm:left-[18px]" />
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search all tickers, segments, sectors, and large caps…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-[14px] border border-border bg-card py-2 pl-10 pr-3 text-xs text-foreground shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-[52px] sm:pl-11 sm:pr-24 sm:text-sm"
            />
            <div className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-muted-foreground sm:right-4 sm:flex">
              <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md border border-border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground">
                ⌘
              </kbd>
              <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md border border-border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground">
                K
              </kbd>
            </div>

            {searchHits.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-lg">
                {searchHits.map((hit, idx) => {
                  const m1 = hit.metric?.m1 ?? null;
                  const chipCls =
                    m1 == null || Number.isNaN(m1)
                      ? 'bg-muted/80 text-muted-foreground'
                      : m1 >= 0
                        ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                        : 'bg-rose-500/15 text-rose-800 dark:text-rose-300';
                  return (
                    <button
                      key={`${hit.ticker}-${idx}`}
                      type="button"
                      onClick={() => handleSelectHit(hit.ticker)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/60 sm:text-sm"
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2.5">
                        <span className="flex h-[26px] w-[26px] shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                          <TickerIcon ticker={hit.ticker} size={26} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-foreground sm:text-sm">{hit.label}</span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">{hit.ticker}</span>
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-md px-2 py-1 font-mono text-[11px] font-semibold tabular-nums ${chipCls}`}
                      >
                        {formatM1Chip(m1)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <button
              type="button"
              onClick={() => onNavigate('readme')}
              className="group flex items-center gap-3.5 rounded-2xl border border-border bg-card p-[18px] text-left shadow-sm transition-colors hover:bg-muted/30"
            >
              <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                <BookOpen className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold tracking-tight text-foreground sm:text-[14.5px]">Read Me</div>
                <div className="mt-0.5 text-xs leading-snug text-muted-foreground sm:text-[13px]">
                  1-page explanation of the Pulse Check tool
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('ticker-analysis')}
              className="group flex items-center gap-3.5 rounded-2xl border border-border bg-card p-[18px] text-left shadow-sm transition-colors hover:bg-muted/30"
            >
              <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <Activity className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold tracking-tight text-foreground sm:text-[14.5px]">On-Demand Pulse Check</div>
                <div className="mt-0.5 text-xs leading-snug text-muted-foreground sm:text-[13px]">
                  Pull up the detailed Momentum Pulse. Heck for one the 1000+ ticker covered in the app.
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="group flex items-center gap-3.5 rounded-2xl border border-border bg-card p-[18px] text-left shadow-sm transition-colors hover:bg-muted/30"
            >
              <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <LayoutGrid className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold tracking-tight text-foreground sm:text-[14.5px]">Dashboard</div>
                <div className="mt-0.5 text-xs leading-snug text-muted-foreground sm:text-[13px]">
                  Summary Performance / Trend across Market Segments and Sectors
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>

          <div className="space-y-5 sm:space-y-6">{renderedGroups}</div>
        </div>
      </main>

      <MwsHubCustomizeDialog
        open={customizeOpen}
        onOpenChange={handleCustomizeOpenChange}
        prefs={prefs}
        onChangePrefs={setPrefs}
        onReset={resetPrefs}
        curatedRows={customizePickerRows}
      />
    </div>
  );
}
