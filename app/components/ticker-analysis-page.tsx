'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw, AlertCircle, ArrowLeft, Search } from 'lucide-react';
import { AppHeader } from './app-header';
import { TickerIcon } from './ui/ticker-icon';
import type { PageView } from '../types';
import type { AppMode } from '../types';
import { useTickerData } from '../../lib/hooks/useTickerData';
import { getAllTickers, getTickerData, tickerMatchesSearchQuery } from '../../lib/queries/ticker';
import { fetchPriceHistory, type PriceBar } from '../../lib/queries/price-history';
import { fetchHubTickerMetricsMap, type HubTickerMetric } from '../../lib/queries/hub-ticker-metrics';
import { useActivity } from '@/lib/activity/ActivityProvider';
import {
  ratingBadgeClassName,
  ratingBadgeInlineStyle,
  ratingTierFromTrendScore,
  trendOutlookAriaLabel,
  trendOutlookDotClass,
  TREND_OUTLOOK_PILL_CLASS,
} from '@/lib/mws-formula-badges';
import {
  fetchFormulaTrendTemplates,
  fetchFormulaNumericSettings,
  fetchFormulaRatingLabels,
  mergeFormulaDefaults,
} from '@/lib/queries/formula-display';
import {
  PERFORMANCE_TONE_CELL_CLASS,
  PERFORMANCE_TONE_CHIP_CLASS,
  parsePercentFromDisplayString,
  performanceToneFromPercent,
  performanceToneFromRawValue,
  toDisplayPercent,
} from '@/lib/mws-performance-tone';
import { composeOverviewBrief } from '@/lib/intelligence/brief';
import { BriefCard } from './intelligence/brief-card';
import { RelativeStrengthButton } from './charts/relative-strength-dialog';
import { featureFlags } from '@/lib/feature-flags';
import { ChatDrawer } from './intelligence/chat-drawer';

const PriceChart = dynamic(() => import('./price-chart').then((m) => ({ default: m.PriceChart })), {
  ssr: false,
  loading: () => <div className="h-[220px] w-full animate-pulse rounded-xl bg-muted/50" />,
});

interface TickerAnalysisPageProps {
  userEmail: string;
  onSignOut: () => void;
  onNavigate: (page: PageView) => void;
  initialTicker: string;
  currentAppMode: AppMode;
  onGoToPortfolio: () => void;
  onGoToMyHoldings?: () => void;
  onGoToMWS: () => void;
}

type WeeklyRange = '3M' | '6M' | '1Y' | 'ALL';

const MARKET_SEGMENTS = ['SPY', 'QQQ', 'IWM', 'TLT', 'UUP', 'GLD', 'SLV', 'IBIT', 'ETHA', 'USO'];
const SECTORS = ['XLK', 'XLC', 'SMH', 'XLY', 'XLF', 'XLI', 'XLE', 'XLB', 'XLRE', 'XLU', 'XLV', 'XLP'];
const LARGE_CAPS = ['NVDA', 'MSFT', 'AAPL', 'GOOG', 'AMZN', 'META', 'TSLA', 'JPM', 'WMT', 'LLY', 'AVGO', 'CSCO', 'MCD', 'V', 'WFC', 'C', 'ORCL', 'MS', 'APP', 'MA', 'KO', 'ISRG', 'XOM', 'GS', 'LIN', 'JNJ', 'CAT', 'INTC', 'PLTR', 'IBM', 'DIS', 'NFLX', 'MRK', 'QCOM', 'BAC', 'AXP', 'PEP', 'COST', 'LRCX', 'BX', 'MU', 'CRM', 'AMGN', 'HD', 'RTX', 'SCHW', 'GE', 'TMO', 'INTU', 'AMD', 'AMAT', 'GEV', 'PG', 'ABT', 'UBER', 'CVX', 'TMUS', 'BA', 'UNH', 'SHOP'];

const TICKER_NAMES: Record<string, string> = {
  'SPY': 'S&P 500', 'QQQ': 'Invesco QQQ Trust', 'IWM': 'iShares Russell 2000 ETF',
  'TLT': 'iShares 20+ Year Treasury Bond ETF', 'UUP': 'Invesco DB US Dollar Index Bullish Fund',
  'GLD': 'SPDR Gold Shares', 'SLV': 'iShares Silver Trust', 'IBIT': 'iShares Bitcoin Trust',
  'ETHA': 'iShares Ethereum Trust', 'USO': 'United States Oil Fund',
  'XLK': 'Technology Select Sector SPDR Fund', 'XLC': 'Communication Services Select Sector SPDR Fund',
  'SMH': 'VanEck Semiconductor ETF', 'XLY': 'Consumer Discretionary Select Sector SPDR Fund',
  'XLF': 'Financial Select Sector SPDR Fund', 'XLI': 'Industrial Select Sector SPDR Fund',
  'XLE': 'Energy Select Sector SPDR Fund', 'XLB': 'Materials Select Sector SPDR Fund',
  'XLRE': 'Real Estate Select Sector SPDR Fund', 'XLU': 'Utilities Select Sector SPDR Fund',
  'XLV': 'Health Care Select Sector SPDR Fund', 'XLP': 'Consumer Staples Select Sector SPDR Fund',
  'NVDA': 'NVIDIA Corporation', 'MSFT': 'Microsoft Corporation', 'AAPL': 'Apple Inc.',
  'GOOG': 'Alphabet Inc.', 'AMZN': 'Amazon.com Inc.', 'META': 'Meta Platforms Inc.',
  'TSLA': 'Tesla Inc.', 'JPM': 'JPMorgan Chase & Co.', 'WMT': 'Walmart Inc.',
  'LLY': 'Eli Lilly and Company', 'AVGO': 'Broadcom Inc.', 'CSCO': 'Cisco Systems Inc.',
  'MCD': "McDonald's Corporation", 'V': 'Visa Inc.', 'WFC': 'Wells Fargo & Company',
  'C': 'Citigroup Inc.', 'ORCL': 'Oracle Corporation', 'MS': 'Morgan Stanley',
  'APP': 'Applovin Corporation', 'MA': 'Mastercard Incorporated', 'KO': 'The Coca-Cola Company',
  'ISRG': 'Intuitive Surgical Inc.', 'XOM': 'Exxon Mobil Corporation',
  'GS': 'The Goldman Sachs Group Inc.', 'LIN': 'Linde plc', 'JNJ': 'Johnson & Johnson',
  'CAT': 'Caterpillar Inc.', 'INTC': 'Intel Corporation', 'PLTR': 'Palantir Technologies Inc.',
  'IBM': 'International Business Machines Corporation', 'DIS': 'The Walt Disney Company',
  'NFLX': 'Netflix Inc.', 'MRK': 'Merck & Co. Inc.', 'QCOM': 'Qualcomm Incorporated',
  'BAC': 'Bank of America Corp.', 'AXP': 'American Express Company', 'PEP': 'PepsiCo Inc.',
  'COST': 'Costco Wholesale Corporation', 'LRCX': 'Lam Research Corporation',
  'BX': 'Blackstone Inc.', 'MU': 'Micron Technology Inc.', 'CRM': 'Salesforce Inc.',
  'AMGN': 'Amgen Inc.', 'HD': 'The Home Depot Inc.', 'RTX': 'RTX Corporation',
  'SCHW': 'The Charles Schwab Corporation', 'GE': 'GE Aerospace',
  'TMO': 'Thermo Fisher Scientific Inc.', 'INTU': 'Intuit Inc.',
  'AMD': 'Advanced Micro Devices Inc.', 'AMAT': 'Applied Materials Inc.',
  'GEV': 'GE Vernova', 'PG': 'The Procter & Gamble Company', 'ABT': 'Abbott Laboratories',
  'UBER': 'Uber Technologies Inc.', 'CVX': 'Chevron Corporation', 'TMUS': 'T-Mobile US Inc.',
  'BA': 'The Boeing Company', 'UNH': 'UnitedHealth Group Incorporated', 'SHOP': 'Shopify Inc.',
};

function extractBenchmarkTicker(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/^\$?([^:]+):/);
  return m?.[1]?.trim() ?? null;
}

function getBenchmarkName(data: Record<string, unknown> | null, tp: string | null): string {
  if (!data) return 'N/A';
  if (tp === 'segment') return String(data.name ?? 'N/A');
  if (tp === 'sector') return String(data.sector_name ?? 'N/A');
  return String((data.company_name ?? data.name) ?? 'N/A');
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  const r = Number(pct.toFixed(1));
  return `${r > 0 ? '+' : ''}${r}%`;
}

function toNum(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeTemplateOutlookKey(value: unknown): 'Extended' | 'Stable' | 'Cooling' | 'Reversing' | 'Firming' | 'Softening' | 'Warming' | null {
  const s = String(value ?? '').trim();
  if (
    s === 'Extended' ||
    s === 'Stable' ||
    s === 'Cooling' ||
    s === 'Reversing' ||
    s === 'Firming' ||
    s === 'Softening' ||
    s === 'Warming'
  ) return s;
  return null;
}

function getComparisonInfo(text: string | null | undefined): { cls: string; short: string } {
  if (!text || text === 'N/A') return { cls: 'text-muted-foreground', short: text ?? 'N/A' };
  if (/in line/i.test(text)) return { cls: 'text-muted-foreground', short: text };
  return { cls: 'text-foreground', short: text };
}

function vsHighClass(): string {
  return 'text-muted-foreground';
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

// ─── Main component ─────────────────────────────────────────────────────────
export function TickerAnalysisPage({
  userEmail, onSignOut, onNavigate, initialTicker, currentAppMode, onGoToPortfolio, onGoToMyHoldings, onGoToMWS,
}: TickerAnalysisPageProps) {
  const activity = useActivity();
  const [ticker, setTicker] = useState(initialTicker);
  const [chartTf, setChartTf] = useState<'W' | 'D'>('W');
  const [weeklyRange, setWeeklyRange] = useState<WeeklyRange>('1Y');
  const { data: supabaseData, type, loading, error, refetch } = useTickerData(ticker);

  const [firstBenchmarkData, setFirstBenchmarkData] = useState<Record<string, unknown> | null>(null);
  const [firstBenchmarkTicker, setFirstBenchmarkTicker] = useState<string | null>(null);
  const [firstBenchmarkName, setFirstBenchmarkName] = useState('N/A');
  const [sectorBenchmarkData, setSectorBenchmarkData] = useState<Record<string, unknown> | null>(null);
  const [benchmarkTicker, setBenchmarkTicker] = useState<string | null>(null);
  const [benchmarkName, setBenchmarkName] = useState('N/A');
  const [priceHistory, setPriceHistory] = useState<PriceBar[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [metricsMap, setMetricsMap] = useState<Map<string, HubTickerMetric>>(new Map());
  const [dbTickers, setDbTickers] = useState<string[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [ratingLabelRows, setRatingLabelRows] = useState<{ tier: string; label: string; description?: string; color_hex?: string | null }[]>([]);
  const [trendTemplateRows, setTrendTemplateRows] = useState<{ tier: string; outlook: string; timeframe: 'Weekly' | 'Daily'; description: string }[]>([]);
  const [formulaNums, setFormulaNums] = useState(() => mergeFormulaDefaults({}));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [labels, partial] = await Promise.all([
        fetchFormulaRatingLabels(),
        fetchFormulaNumericSettings(),
      ]);
      const templates = await fetchFormulaTrendTemplates();
      if (cancelled) return;
      setRatingLabelRows(labels);
      setTrendTemplateRows(
        templates.map((row) => ({
          tier: row.tier,
          outlook: row.outlook,
          timeframe: row.timeframe,
          description: row.description,
        }))
      );
      setFormulaNums(mergeFormulaDefaults(partial));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load all ticker metrics (names + 1m%) for the search dropdown.
  useEffect(() => {
    let ok = true;
    fetchHubTickerMetricsMap()
      .then((m) => { if (ok) setMetricsMap(m); })
      .catch(() => {});
    return () => { ok = false; };
  }, []);

  // Pull full tracked ticker universe (segments + sectors + mega caps + other_stocks).
  useEffect(() => {
    let ok = true;
    getAllTickers()
      .then((list) => { if (ok) setDbTickers(list); })
      .catch(() => {});
    return () => { ok = false; };
  }, []);

  // Derive sorted search items from metrics map (fallback to static lists if empty).
  const allSearchItems = useMemo((): HubTickerMetric[] => {
    const merged = new Map<string, HubTickerMetric>();

    // Always include the full supported ticker universe in search.
    for (const t of [...MARKET_SEGMENTS, ...SECTORS, ...LARGE_CAPS]) {
      const key = t.toUpperCase();
      merged.set(key, {
        ticker: key,
        name: TICKER_NAMES[key] ?? key,
        m1: null,
        score: null,
      });
    }

    // Include tracked tickers from Supabase (same source used by MWS main page search).
    for (const t of dbTickers) {
      const key = String(t).trim().toUpperCase();
      if (!key) continue;
      const base = merged.get(key);
      merged.set(key, {
        ticker: key,
        name: base?.name || TICKER_NAMES[key] || key,
        m1: base?.m1 ?? null,
        score: base?.score ?? null,
      });
    }

    // Overlay live metrics where available.
    for (const item of metricsMap.values()) {
      const key = item.ticker.toUpperCase();
      const base = merged.get(key);
      merged.set(key, {
        ticker: key,
        name: item.name || base?.name || TICKER_NAMES[key] || key,
        m1: item.m1 ?? base?.m1 ?? null,
        score: item.score ?? base?.score ?? null,
      });
    }

    return Array.from(merged.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [dbTickers, metricsMap]);

  const searchHits = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    const limit = 80;
    if (!q) return allSearchItems.slice(0, limit);
    return allSearchItems
      .filter((x) => tickerMatchesSearchQuery(x.ticker, q) || tickerMatchesSearchQuery(x.name, q))
      .slice(0, limit);
  }, [allSearchItems, searchQ]);

  // Close dropdown on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQ('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadPriceHistory = useCallback(async (t: string, tf: 'D' | 'W', wRange: WeeklyRange) => {
    setChartLoading(true);
    try {
      const interval = tf === 'W' ? 'weekly' : 'daily';
      const weeklyLimitByRange: Record<WeeklyRange, number> = {
        '3M': 13,
        '6M': 26,
        '1Y': 52,
        ALL: 78,
      };
      const limit = tf === 'W' ? weeklyLimitByRange[wRange] : 252;
      const bars = await fetchPriceHistory(t, interval, limit);
      setPriceHistory(bars);
    } catch {
      setPriceHistory([]);
    } finally {
      setChartLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPriceHistory(ticker, chartTf, weeklyRange);
  }, [ticker, chartTf, weeklyRange, loadPriceHistory]);

  const fetchBenchmarkData = async () => {
    if (!supabaseData) return;
    const sd = supabaseData as unknown as Record<string, unknown>;

    const firstText = sd.daily_vs_spy_comparison as string | undefined;
    const firstRaw = extractBenchmarkTicker(firstText);
    setFirstBenchmarkTicker(firstRaw);
    if (firstRaw) {
      const actual = firstRaw.match(/^([A-Z]{2,5})\s/)?.[1] ?? firstRaw;
      const res = await getTickerData(actual);
      setFirstBenchmarkData(res.data as unknown as Record<string, unknown> | null);
      setFirstBenchmarkName(getBenchmarkName(res.data as unknown as Record<string, unknown> | null, res.type));
    } else {
      setFirstBenchmarkData(null);
      setFirstBenchmarkName('N/A');
    }

    const secondText = (type === 'mega_cap' ? sd.daily_vs_sector_comparison : sd.daily_vs_benchmark_comparison) as string | undefined;
    const secondRaw = extractBenchmarkTicker(secondText);
    setBenchmarkTicker(secondRaw);
    if (secondRaw) {
      const actual = secondRaw.match(/^([A-Z]{2,5})\s/)?.[1] ?? secondRaw;
      const res = await getTickerData(actual);
      setSectorBenchmarkData(res.data as unknown as Record<string, unknown> | null);
      setBenchmarkName(getBenchmarkName(res.data as unknown as Record<string, unknown> | null, res.type));
    } else {
      setSectorBenchmarkData(null);
      setBenchmarkName('N/A');
    }
  };

  useEffect(() => {
    if (supabaseData) void fetchBenchmarkData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, supabaseData]);

  const handleRefresh = async () => {
    await refetch();
    await fetchBenchmarkData();
    await loadPriceHistory(ticker, chartTf, weeklyRange);
  };

  // ─── Data transform ────────────────────────────────────────────────────────
  const data = useMemo(() => {
    if (!supabaseData) return null;
    const sd = supabaseData as unknown as Record<string, unknown>;

    let name = '';
    if (type === 'segment') name = String(sd.name ?? TICKER_NAMES[ticker] ?? ticker);
    else if (type === 'sector') name = String(sd.sector_name ?? TICKER_NAMES[ticker] ?? ticker);
    else name = String(sd.company_name ?? TICKER_NAMES[ticker] ?? ticker);

    const lastUpdated = supabaseData.updated_at
      ? new Date(supabaseData.updated_at as string).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
      : 'N/A';

    const perf1M = toNum(sd['1m_percent'] ?? supabaseData.daily_1m_percent);
    const perf3M = toNum(sd['3m_percent'] ?? supabaseData.daily_3m_percent);
    const vsHigh1Y = toNum(sd['vs_1y_high'] ?? supabaseData.daily_vs_1y_high);
    const vsSpyComparison = String(supabaseData.daily_vs_spy_comparison ?? 'N/A');
    const vsBenchmarkComparison = String((type === 'mega_cap' ? sd.daily_vs_sector_comparison : sd.daily_vs_benchmark_comparison) ?? 'N/A');

    const makeTrend = (daily: boolean) => {
      const p = daily ? 'daily_' : 'weekly_';
      const p2 = daily ? 'daily_' : 'weekly_';
      const score = toNum(daily ? supabaseData.daily_trend_score : supabaseData.weekly_trend_score) ?? 0;
      const outlookRaw = String(daily ? (supabaseData.daily_outlook ?? '') : (supabaseData.weekly_outlook ?? '')).trim();
      const templateOutlookKey = normalizeTemplateOutlookKey(outlookRaw);
      const outlook = outlookRaw || 'Stable';
      return {
        templateOutlookKey,
        score,
        rating: String(daily ? supabaseData.daily_rating : supabaseData.weekly_rating) || 'N/A',
        outlook,
        description: String(daily ? supabaseData.daily_trend_description : supabaseData.weekly_trend_description) || '',
        currentPrice: toNum(sd[`${p}current_price`]),
        ema9: toNum(sd[`${p}ema_9`]),
        ema21or30: toNum(daily ? sd[`${p2}ema_21`] : sd[`${p2}ema_30`]),
        signals: [
          { label: daily ? 'Price vs 9-day EMA' : 'Price vs 9-week EMA', raw: toNum(sd[`${p}price_vs_9ema`]), icon: String(sd[`${p}price_vs_9ema_icon`] ?? '') },
          { label: daily ? 'Price vs 21-day EMA' : 'Price vs 30-week EMA', raw: toNum(daily ? sd[`${p2}price_vs_21ema`] : sd[`${p2}price_vs_30ema`]), icon: String(daily ? (sd[`${p2}price_vs_21ema_icon`] ?? '') : (sd[`${p2}price_vs_30ema_icon`] ?? '')) },
          { label: daily ? '9-day EMA vs. 21-day EMA' : '9-week EMA vs. 30-week EMA', raw: toNum(daily ? sd[`${p2}ema9_vs_21ema`] : sd[`${p2}ema9_vs_30ema`]), icon: String(daily ? (sd[`${p2}ema9_vs_21ema_icon`] ?? '') : (sd[`${p2}ema9_vs_30ema_icon`] ?? '')) },
          { label: daily ? 'Slope 9-day EMA' : 'Slope 9-week EMA', raw: null as null, strVal: String(sd[`${p}slope_9ema`] ?? 'N/A'), icon: String(sd[`${p}slope_9ema_icon`] ?? '') },
          { label: daily ? 'Slope 21-day EMA' : 'Slope 30-week EMA', raw: null as null, strVal: String(daily ? (sd[`${p2}slope_21ema`] ?? 'N/A') : (sd[`${p2}slope_30ema`] ?? 'N/A')), icon: String(daily ? (sd[`${p2}slope_21ema_icon`] ?? '') : (sd[`${p2}slope_30ema_icon`] ?? '')) },
        ],
        keyLevels: [
          { label: 'Current Price', value: toNum(sd[`${p}current_price`])?.toFixed(2) ?? 'N/A' },
          { label: daily ? '9-day EMA' : '9-week EMA', value: toNum(sd[`${p}ema_9`])?.toFixed(2) ?? 'N/A' },
          { label: daily ? '21-day EMA' : '30-week EMA', value: toNum(daily ? sd[`${p2}ema_21`] : sd[`${p2}ema_30`])?.toFixed(2) ?? 'N/A' },
          { label: daily ? '1-month High' : '3-month High', value: toNum(sd[`${p}month_high`])?.toFixed(2) ?? 'N/A' },
          { label: daily ? '1-month Low' : '3-month Low', value: toNum(sd[`${p}month_low`])?.toFixed(2) ?? 'N/A' },
        ],
      };
    };

    return {
      name,
      lastUpdated,
      perf1M,
      perf3M,
      vsHigh1Y,
      vsSpyComparison,
      vsBenchmarkComparison,
      firstBenchmarkLabel: String(sd.first_benchmark_name ?? `$${firstBenchmarkTicker ?? 'N/A'}`),
      firstBenchmark1M: toNum(sd.first_benchmark_1m_percent ?? (firstBenchmarkData as Record<string, unknown> | null)?.[`1m_percent`] ?? null),
      firstBenchmark3M: toNum(sd.first_benchmark_3m_percent ?? (firstBenchmarkData as Record<string, unknown> | null)?.[`3m_percent`] ?? null),
      secondBenchmarkLabel: String(sd.second_benchmark_name ?? `$${benchmarkTicker ?? 'N/A'}`),
      secondBenchmark1M: toNum(sd.second_benchmark_1m_percent ?? (sectorBenchmarkData as Record<string, unknown> | null)?.[`1m_percent`] ?? null),
      secondBenchmark3M: toNum(sd.second_benchmark_3m_percent ?? (sectorBenchmarkData as Record<string, unknown> | null)?.[`3m_percent`] ?? null),
      perfSummary: String(supabaseData.daily_performance_summary ?? 'N/A'),
      perfDescription: String(supabaseData.daily_performance_description ?? ''),
      weekly: makeTrend(false),
      daily: makeTrend(true),
    };
  }, [supabaseData, ticker, type, firstBenchmarkData, firstBenchmarkTicker, firstBenchmarkName, sectorBenchmarkData, benchmarkTicker, benchmarkName]);

  const ratingLabelByTier = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of ratingLabelRows) map.set(row.tier, row.label);
    return map;
  }, [ratingLabelRows]);

  const ratingTierFromScore = useCallback(
    (score: number | null | undefined) => ratingTierFromTrendScore(score, formulaNums),
    [formulaNums],
  );

  const ratingLabelFromTier = useCallback(
    (tier: 'strong_bull' | 'bull' | 'neutral' | 'bear' | 'strong_bear' | null): string =>
      tier ? ratingLabelByTier.get(tier) ?? tier : 'N/A',
    [ratingLabelByTier]
  );

  const ratingDescriptionByTier = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of ratingLabelRows) {
      if (row.description && row.description.trim()) map.set(row.tier, row.description.trim());
    }
    return map;
  }, [ratingLabelRows]);

  const trendTemplateDescriptionMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of trendTemplateRows) {
      map.set(`${row.tier}|${row.outlook}|${row.timeframe}`, row.description);
    }
    return map;
  }, [trendTemplateRows]);

  const activeRatingTier = useMemo(
    () => ratingTierFromScore(chartTf === 'W' ? data?.weekly?.score : data?.daily?.score),
    [chartTf, data?.daily?.score, data?.weekly?.score, ratingTierFromScore]
  );
  const activeRatingLabel = useMemo(() => ratingLabelFromTier(activeRatingTier), [activeRatingTier, ratingLabelFromTier]);
  const activeTrendDescription = useMemo(() => {
    const active = chartTf === 'W' ? data?.weekly : data?.daily;
    if (!active || !activeRatingTier || !active.templateOutlookKey) return active?.description ?? '';
    const timeframe = chartTf === 'W' ? 'Weekly' : 'Daily';
    return (
      trendTemplateDescriptionMap.get(`${activeRatingTier}|${active.templateOutlookKey}|${timeframe}`) ??
      active.description ??
      ''
    );
  }, [activeRatingTier, chartTf, data?.daily, data?.weekly, trendTemplateDescriptionMap]);

  const performanceSummaryText = data?.perfSummary ?? 'N/A';
  const performanceDescriptionText = data?.perfDescription ?? '';

  const topSummaryBrief = useMemo(() => {
    if (!data || !supabaseData || !featureFlags.brief) return null;
    return composeOverviewBrief({
      ticker,
      timeframe: chartTf === 'W' ? 'weekly' : 'daily',
      daily_trend_score: data.daily.score,
      daily_rating: data.daily.rating,
      daily_outlook: data.daily.outlook,
      daily_trend_description:
        chartTf === 'D' ? activeTrendDescription || data.daily.description : data.daily.description,
      weekly_trend_score: data.weekly.score,
      weekly_rating: data.weekly.rating,
      weekly_outlook: data.weekly.outlook,
      weekly_trend_description:
        chartTf === 'W' ? activeTrendDescription || data.weekly.description : data.weekly.description,
      performance_strength: String(
        (supabaseData as unknown as Record<string, unknown>).performance_strength ??
          supabaseData.daily_performance_strength ??
          '',
      ) || null,
      distance_to_highs: String(
        (supabaseData as unknown as Record<string, unknown>).distance_to_highs ??
          supabaseData.daily_distance_to_highs ??
          '',
      ) || null,
      daily_performance_summary: String(supabaseData.daily_performance_summary ?? '') || null,
      daily_performance_description: String(supabaseData.daily_performance_description ?? '') || null,
      '1m_percent': data.perf1M,
      '3m_percent': data.perf3M,
      daily_vs_spy_comparison: data.vsSpyComparison !== 'N/A' ? data.vsSpyComparison : null,
      daily_vs_benchmark_comparison:
        data.vsBenchmarkComparison !== 'N/A' ? data.vsBenchmarkComparison : null,
    });
  }, [activeTrendDescription, chartTf, data, supabaseData, ticker]);

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader userEmail={userEmail} currentAppMode={currentAppMode} onGoToPortfolio={onGoToPortfolio} onGoToMyHoldings={onGoToMyHoldings} onGoToMWS={onGoToMWS} onSignOut={onSignOut} onBack={() => onNavigate('index')} backLabel="Back to MWS" />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground sm:text-sm">Loading ticker data…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader userEmail={userEmail} currentAppMode={currentAppMode} onGoToPortfolio={onGoToPortfolio} onGoToMyHoldings={onGoToMyHoldings} onGoToMWS={onGoToMWS} onSignOut={onSignOut} onBack={() => onNavigate('index')} backLabel="Back to MWS" />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6">
            <div className="mb-2 flex items-center gap-2 text-sm text-destructive sm:text-base">
              <AlertCircle className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
              <span className="font-semibold">Error loading ticker data</span>
            </div>
            <p className="mb-4 text-xs text-muted-foreground sm:text-sm">{error ? error.message : `"${ticker}" was not found.`}</p>
            <button onClick={handleRefresh} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted/50 sm:text-sm">
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ─── Chart data ────────────────────────────────────────────────────────────
  const isWeekly = chartTf === 'W';
  const activeTrend = isWeekly ? data.weekly : data.daily;
  const emaPeriodShort = isWeekly ? 9 : 9;
  const emaPeriodLong  = isWeekly ? 30 : 21;

  // ─── Render ────────────────────────────────────────────────────────────────
  const SectionHead = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3 sm:px-[22px] sm:py-[15px]">
      {children}
    </div>
  );

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground sm:text-[12px]">{children}</h3>
  );

  const SectionCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`overflow-hidden rounded-[18px] border border-border bg-card shadow-sm ${className}`}>
      {children}
    </div>
  );

  const SignalRow = ({ label, value, icon, isNum }: { label: string; value: string; icon?: string; isNum?: boolean }) => {
    const iconBear = icon === '❌';
    const iconBull = icon === '✅';
    let isPos = false;
    let isNeg = false;
    if (icon) {
      isPos = iconBull;
      isNeg = iconBear;
    } else if (isNum) {
      const pct = parsePercentFromDisplayString(value);
      if (pct != null) {
        const tone = performanceToneFromPercent(pct);
        isPos = tone === 'positive';
        isNeg = tone === 'negative';
      }
    } else {
      isPos = /rising|✅|🟩|\+/.test(value) && !/falling|❌|🟥|-/.test(value);
      isNeg = /falling|❌|🟥/.test(value);
    }
    return (
      <div className="flex items-center justify-between border-b border-border/50 py-[11px] last:border-0">
        <span className="min-w-0 flex-1 pr-3 text-xs text-muted-foreground sm:text-[13px]">{label}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className={`font-mono text-xs font-medium sm:text-[13px] ${isNeg ? 'text-rose-600 dark:text-rose-400' : isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
            {value}
          </span>
          {icon && <span className="text-xs leading-none sm:text-[13px]">{icon}</span>}
        </span>
      </div>
    );
  };

  const formatSignalValue = (sig: { raw: number | null; strVal?: string }) => {
    if (sig.raw != null) {
      const pct = sig.raw * 100;
      return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
    }
    return sig.strVal ?? 'N/A';
  };

  const PerfCell = ({ value }: { value: number | null }) => {
    if (value == null) return <td className="border-b border-border px-3 py-2.5 text-center font-mono text-xs text-muted-foreground sm:px-4 sm:py-[11px] sm:text-[13px]">—</td>;
    const pct = toDisplayPercent(value);
    const tone = performanceToneFromRawValue(value);
    return (
      <td className={`border-b border-border px-3 py-2.5 text-center font-mono text-xs font-medium tabular-nums sm:px-4 sm:py-[11px] sm:text-[13px] ${PERFORMANCE_TONE_CELL_CLASS[tone]}`}>
        {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
      </td>
    );
  };

  const vsHighPct = data.vsHigh1Y != null
    ? (Math.abs(data.vsHigh1Y) <= 1 ? data.vsHigh1Y * 100 : data.vsHigh1Y)
    : null;

  const trendThresholds = {
    extended_threshold: formulaNums.extended_threshold,
    score_weak: formulaNums.score_weak,
  };

  const firstBenchSym = (firstBenchmarkTicker ?? extractBenchmarkTicker(data.firstBenchmarkLabel) ?? '').toUpperCase() || null;
  const secondBenchSym = (benchmarkTicker ?? extractBenchmarkTicker(data.secondBenchmarkLabel) ?? '').toUpperCase() || null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader
        userEmail={userEmail}
        currentAppMode={currentAppMode}
        onGoToPortfolio={onGoToPortfolio}
        onGoToMyHoldings={onGoToMyHoldings}
        onGoToMWS={onGoToMWS}
        onSignOut={onSignOut}
        onNavigateMws={onNavigate}
        currentMwsPage="ticker-analysis"
      />

      <main className="w-full flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1400px]">

          {/* ── Ticker header ── */}
          <div className="mb-5 flex flex-col items-start justify-between gap-3 border-b border-border pb-4 sm:mb-6 sm:gap-4 sm:pb-5 sm:flex-row sm:items-end">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => onNavigate('index')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-colors hover:bg-muted/50"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted sm:h-14 sm:w-14">
                <TickerIcon ticker={ticker} size={56} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-[1.45rem] md:text-[1.6rem] lg:text-[1.85rem]">
                  {data.name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:text-[13px]">
                  <span className="inline-flex items-center gap-1.5 font-mono font-medium text-foreground">
                    <span className="flex h-5 w-5 shrink-0 overflow-hidden rounded-md border border-border bg-muted sm:h-5 sm:w-5">
                      <TickerIcon ticker={ticker} size={20} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
                    </span>
                    {ticker}
                  </span>
                  <span className="h-3.5 w-px bg-border" aria-hidden />
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold ${ratingBadgeClassName(activeRatingLabel, ratingLabelRows)}`}
                    style={ratingBadgeInlineStyle(activeRatingLabel, ratingLabelRows)}
                  >
                    {activeRatingLabel}
                  </span>
                  <span
                    className={TREND_OUTLOOK_PILL_CLASS}
                    title={trendOutlookAriaLabel(activeTrend.outlook, activeTrend.score, trendThresholds)}
                  >
                    <span className={trendOutlookDotClass(activeTrend.outlook)} aria-hidden />
                    {activeTrend.outlook}
                  </span>
                  <span className="h-3.5 w-px bg-border" aria-hidden />
                  <span>Updated {data.lastUpdated}</span>
                </div>
              </div>
            </div>

            {/* Right: ticker search + relative strength + refresh */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <RelativeStrengthButton
                initialTickers={ticker ? [ticker] : []}
                onSelectTicker={(t) => setTicker(t)}
              />
              {/* Custom search dropdown */}
              <div ref={searchRef} className="relative">
                <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-xs shadow-sm sm:px-3 sm:text-sm">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchOpen ? searchQ : ticker}
                    placeholder="Search ticker…"
                    onFocus={() => { setSearchOpen(true); setSearchQ(''); }}
                    onChange={(e) => setSearchQ(e.target.value)}
                    className="w-[min(100%,7.5rem)] min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none sm:w-[120px] sm:flex-none sm:text-[13px]"
                  />
                </div>

                {searchOpen && (
                  <div
                    className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(100vw-2rem,20rem)] max-w-[calc(100vw-2rem)] max-h-[min(60vh,360px)] touch-pan-y overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-1.5 shadow-lg [-webkit-overflow-scrolling:touch] sm:w-[320px] sm:max-w-none"
                    onWheel={(e) => e.stopPropagation()}
                  >
                    {searchHits.map((item) => {
                      const m1 = item.m1;
                      const pct = m1 != null ? toDisplayPercent(m1) : null;
                      const tone = pct != null ? performanceToneFromPercent(pct) : 'neutral';
                      return (
                        <button
                          key={item.ticker}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setTicker(item.ticker);
                            activity?.trackEvent({
                              eventType: 'ticker_view',
                              eventName: item.ticker.toUpperCase(),
                              metadata: { ticker: item.ticker.toUpperCase(), source: 'search' },
                            });
                            setSearchOpen(false);
                            setSearchQ('');
                          }}
                          className="flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted/60 sm:gap-3 sm:px-3 sm:py-2.5 sm:text-sm"
                        >
                          <span className="flex h-7 w-7 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                            <TickerIcon ticker={item.ticker} size={28} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
                          </span>
                          {/* Name + symbol */}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-foreground sm:text-[13px]">{item.name}</span>
                            <span className="font-mono text-[11px] text-muted-foreground">{item.ticker}</span>
                          </span>
                          {/* 1m% chip */}
                          {pct != null && (
                            <span className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[12px] font-semibold tabular-nums ${PERFORMANCE_TONE_CHIP_CLASS[tone]}`}>
                              {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted/50 disabled:opacity-50 sm:px-3.5 sm:text-sm"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          {topSummaryBrief &&
            !topSummaryBrief.body.startsWith('Not enough MWS fields') && (
            <div className="mb-5">
              <BriefCard
                variant="quickRead"
                compact
                brief={topSummaryBrief}
              />
            </div>
          )}

          {/* ── 2-column grid ── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">

            {/* LEFT column */}
            <div className="flex flex-col gap-5">

              {/* PERFORMANCE */}
              <SectionCard>
                <SectionHead>
                  <SectionTitle>Performance</SectionTitle>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:px-2.5 sm:text-[12px]">
                    {performanceSummaryText.split('|')[1]?.trim() ?? performanceSummaryText}
                  </span>
                </SectionHead>
                <div className="p-4 sm:p-[22px]">
                  <p className="text-sm font-semibold leading-snug tracking-tight text-foreground sm:text-[15px] md:text-[15.5px]">
                    {performanceSummaryText.split('|')[0]?.trim() ?? performanceSummaryText}
                    {performanceSummaryText.includes('|') && (
                      <span className="ml-1.5 block font-normal text-muted-foreground sm:ml-2 sm:inline sm:text-[14px]">
                        | {performanceSummaryText.split('|').slice(1).join('|').trim()}
                      </span>
                    )}
                  </p>
                  {performanceDescriptionText && (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">{performanceDescriptionText}</p>
                  )}
                  <div className="mt-4 overflow-x-auto sm:mt-5">
                    <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-xl border border-border text-xs sm:text-[13px]" style={{ minWidth: 460 }}>
                      <thead>
                        <tr>
                          {['TICKER', '1-MONTH', '3-MONTH', `${ticker} PERFORMANCE VS`].map((h) => (
                            <th key={h} className="border-b border-border bg-muted/50 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground first:rounded-tl-xl last:rounded-tr-xl sm:px-4 sm:py-[11px] sm:text-[11px]">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Main ticker row */}
                        <tr>
                          <td className="border-b border-border px-3 py-2.5 sm:px-4 sm:py-[11px]">
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="flex h-6 w-6 shrink-0 overflow-hidden rounded-md border border-border bg-muted sm:h-7 sm:w-7">
                                <TickerIcon ticker={ticker} size={28} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
                              </div>
                              <span className="min-w-0 font-mono text-xs font-semibold text-foreground sm:text-[13px]">
                                ${ticker} ({data.name.split(' ')[0]})
                              </span>
                            </div>
                          </td>
                          <PerfCell value={data.perf1M} />
                          <PerfCell value={data.perf3M} />
                          <td className={`border-b border-border px-3 py-2.5 font-mono text-xs sm:px-4 sm:py-[11px] sm:text-[13px] ${vsHighClass()}`}>
                            {vsHighPct != null ? `1Y High: ${vsHighPct > 0 ? '+' : ''}${vsHighPct.toFixed(1)}%` : 'N/A'}
                          </td>
                        </tr>
                        {/* Benchmark 1 */}
                        <tr>
                          <td className="border-b border-border px-3 py-2.5 sm:px-4 sm:py-[11px]">
                            <div className="flex min-w-0 items-center gap-2">
                              {firstBenchSym ? (
                                <div className="flex h-6 w-6 shrink-0 overflow-hidden rounded-md border border-border bg-muted sm:h-7 sm:w-7">
                                  <TickerIcon ticker={firstBenchSym} size={28} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
                                </div>
                              ) : null}
                              <span className="min-w-0 font-mono text-xs text-muted-foreground sm:text-[13px]">{data.firstBenchmarkLabel}</span>
                            </div>
                          </td>
                          <PerfCell value={data.firstBenchmark1M} />
                          <PerfCell value={data.firstBenchmark3M} />
                          <td className={`border-b border-border px-3 py-2.5 text-xs font-medium sm:px-4 sm:py-[11px] sm:text-[13px] ${getComparisonInfo(data.vsSpyComparison).cls}`}>
                            {getComparisonInfo(data.vsSpyComparison).short}
                          </td>
                        </tr>
                        {/* Benchmark 2 */}
                        <tr>
                          <td className="px-3 py-2.5 sm:px-4 sm:py-[11px]">
                            <div className="flex min-w-0 items-center gap-2">
                              {secondBenchSym ? (
                                <div className="flex h-6 w-6 shrink-0 overflow-hidden rounded-md border border-border bg-muted sm:h-7 sm:w-7">
                                  <TickerIcon ticker={secondBenchSym} size={28} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
                                </div>
                              ) : null}
                              <span className="min-w-0 font-mono text-xs text-muted-foreground sm:text-[13px]">{data.secondBenchmarkLabel}</span>
                            </div>
                          </td>
                          <PerfCell value={data.secondBenchmark1M} />
                          <PerfCell value={data.secondBenchmark3M} />
                          <td className={`px-3 py-2.5 text-xs font-medium sm:px-4 sm:py-[11px] sm:text-[13px] ${getComparisonInfo(data.vsBenchmarkComparison).cls}`}>
                            {getComparisonInfo(data.vsBenchmarkComparison).short}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </SectionCard>

              {/* CHART TREND */}
              <SectionCard>
                <SectionHead>
                  <SectionTitle>{isWeekly ? 'Weekly' : 'Daily'} Chart Trend</SectionTitle>
                  <div className="flex items-center gap-3">
                    {/* Weekly range */}
                    {isWeekly && (
                      <div className="inline-flex gap-0.5 rounded-[10px] border border-border bg-muted/50 p-[3px]">
                        {(['3M', '6M', '1Y', 'ALL'] as const).map((r) => (
                          <button
                            key={r}
                            type="button"
                            aria-pressed={weeklyRange === r}
                            onClick={() => setWeeklyRange(r)}
                            className={`rounded-[7px] px-2 py-1 text-[11px] font-medium transition-colors sm:px-2.5 sm:text-[12px] ${
                              weeklyRange === r
                                ? 'bg-card text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Legend */}
                    <div className="hidden items-center gap-4 text-[12px] text-muted-foreground sm:flex">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-[3px] w-[10px] rounded-full" style={{ background: 'oklch(0.56 0.21 285)' }} />
                        Price
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-[3px] w-[10px] rounded-full" style={{ background: 'oklch(0.72 0.14 85)' }} />
                        {isWeekly ? '9-week EMA' : '9-day EMA'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-[3px] w-[10px] rounded-full" style={{ background: 'oklch(0.6 0.1 240)' }} />
                        {isWeekly ? '30-week EMA' : '21-day EMA'}
                      </span>
                    </div>
                    {/* D/W toggle */}
                    <div className="inline-flex gap-0.5 rounded-[10px] border border-border bg-muted/50 p-[3px]">
                      {([
                        { tf: 'W' as const, label: 'Weekly' },
                        { tf: 'D' as const, label: 'Daily' },
                      ]).map(({ tf, label }) => (
                        <button
                          key={tf}
                          type="button"
                          aria-pressed={chartTf === tf}
                          onClick={() => setChartTf(tf)}
                          className={`rounded-[7px] px-2.5 py-1 text-xs font-medium transition-colors sm:px-3.5 sm:py-1.5 sm:text-[12.5px] ${
                            chartTf === tf
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </SectionHead>
                <div className="p-4 sm:p-[22px]">
                  {/* Stars + Rating */}
                  <div className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                    <ScoreBars score={activeTrend.score} rating={activeRatingLabel} ratingRows={ratingLabelRows} />
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground sm:text-[13px]">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-semibold ${ratingBadgeClassName(activeRatingLabel, ratingLabelRows)}`}
                        style={ratingBadgeInlineStyle(activeRatingLabel, ratingLabelRows)}
                      >
                        {activeRatingLabel}
                      </span>
                      <span className="text-muted-foreground/80" aria-hidden>
                        |
                      </span>
                      <span
                        className={TREND_OUTLOOK_PILL_CLASS}
                        title={trendOutlookAriaLabel(activeTrend.outlook, activeTrend.score, trendThresholds)}
                      >
                        <span className={trendOutlookDotClass(activeTrend.outlook)} aria-hidden />
                        {activeTrend.outlook}
                      </span>
                    </span>
                  </div>

                  {/* Description */}
                  {activeTrendDescription && (
                    <div className="mb-4 rounded-[10px] bg-muted/50 py-3 text-left text-xs leading-relaxed text-muted-foreground sm:py-3.5 sm:text-[13px]">
                      {activeTrendDescription}
                    </div>
                  )}

                  {/* Real Price Chart */}
                  <div className="relative overflow-hidden rounded-xl bg-muted/30">
                    {chartLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/40 z-10">
                        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {priceHistory.length > 0 ? (
                      <PriceChart
                        bars={priceHistory}
                        interval={isWeekly ? 'weekly' : 'daily'}
                        emaShort={emaPeriodShort}
                        emaLong={emaPeriodLong}
                        height={240}
                      />
                    ) : (
                      <div className="flex h-[240px] items-center justify-center">
                        <p className="px-2 text-center text-xs text-muted-foreground sm:text-[13px]">
                          {chartLoading ? 'Loading chart…' : 'Chart data is not available yet for this ticker.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </SectionCard>

            </div>{/* /LEFT */}

            {/* RIGHT column */}
            <div className="flex flex-col gap-5">

              {/* TREND SIGNALS */}
              <SectionCard>
                <SectionHead>
                  <SectionTitle>Trend Signals</SectionTitle>
                </SectionHead>
                <div className="px-4 py-2 sm:px-[22px]">
                  {activeTrend.signals.map((sig, i) => (
                    <SignalRow
                      key={i}
                      label={sig.label}
                      value={formatSignalValue(sig)}
                      icon={sig.icon || undefined}
                      isNum={sig.raw != null}
                    />
                  ))}
                </div>
              </SectionCard>

              {/* KEY LEVELS */}
              <SectionCard>
                <SectionHead>
                  <SectionTitle>Key Levels</SectionTitle>
                </SectionHead>
                <div className="px-4 py-2 sm:px-[22px]">
                  {activeTrend.keyLevels.map((lv, i) => (
                    <div key={i} className="flex items-center justify-between border-b border-border/50 py-[11px] last:border-0">
                      <span className="text-xs text-muted-foreground sm:text-[13px]">{lv.label}</span>
                      <span className="font-mono text-xs font-semibold tabular-nums text-foreground sm:text-[13px]">{lv.value}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>

            </div>{/* /RIGHT */}
          </div>
        </div>
      </main>
      <ChatDrawer contextRef={{ ticker }} />
    </div>
  );
}
