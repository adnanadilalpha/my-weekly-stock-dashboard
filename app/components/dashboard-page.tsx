'use client';

import { useState } from 'react';
import { RefreshCw, Star, Check, X, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { AppHeader } from './app-header';
import type { PageView } from '../types';
import type { AppMode } from '../types';
import { useDashboardData } from '../../lib/hooks/useDashboardData';

// Mapping of ticker symbols to display names (matching index-page.tsx)
const TICKER_TO_DISPLAY_NAME: Record<string, string> = {
  // Segments
  'SPY': 'S&P500',
  'QQQ': 'Nasdaq',
  'IWM': 'Small Caps',
  'TLT': 'Treasuries',
  'UUP': 'US Dollar fund',
  'GLD': 'Gold',
  'SLV': 'Silver',
  'IBIT': 'Bitcoin',
  'ETHA': 'Ethereum',
  'USO': 'Oil',
  // Sectors
  'XLK': 'Technology',
  'XLC': 'Communication Services',
  'SMH': 'Semiconductors',
  'XLY': 'Consumer Cyclicals',
  'XLF': 'Financials',
  'XLI': 'Industrials',
  'XLE': 'Energy',
  'XLB': 'Materials',
  'XLRE': 'Real Estate',
  'XLU': 'Utilities',
  'XLV': 'Healthcare',
  'XLP': 'Consumer Defensive',
};

// Order arrays for segments and sectors
const SEGMENT_ORDER = ['SPY', 'QQQ', 'IWM', 'TLT', 'UUP', 'GLD', 'SLV', 'IBIT', 'ETHA', 'USO'];
const SECTOR_ORDER = ['XLK', 'XLC', 'SMH', 'XLY', 'XLF', 'XLI', 'XLE', 'XLB', 'XLRE', 'XLU', 'XLV', 'XLP'];

interface DashboardPageProps {
  userEmail: string;
  onSignOut: () => void;
  onNavigate: (page: PageView, ticker?: string) => void;
  currentAppMode: AppMode;
  onGoToPortfolio: () => void;
  onGoToMWS: () => void;
}

export function DashboardPage({ userEmail, onSignOut, onNavigate, currentAppMode, onGoToPortfolio, onGoToMWS }: DashboardPageProps) {
  const [timeframe, setTimeframe] = useState<'D' | 'W'>('D');
  const { segments, sectors, loading, error, refetch } = useDashboardData(timeframe);

  const handleRefresh = async () => {
    await refetch();
  };

  const toNumeric = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const formatPercentValue = (value: number | null) => {
    if (value == null) return 'N/A';
    const percent = Math.abs(value) <= 1 ? value * 100 : value;
    const rounded = Number(percent.toFixed(2));
    return `${rounded > 0 ? '+' : ''}${rounded}%`;
  };

  // Get the most recent update date from all data
  const getLastUpdatedDate = (): string | null => {
    const allItems = [...segments, ...sectors];
    if (allItems.length === 0) return null;

    let mostRecent: Date | null = null;

    allItems.forEach(item => {
      const dateStr = (item as any).updated_at;
      if (dateStr) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          if (mostRecent === null || date > mostRecent) {
            mostRecent = date;
          }
        }
      }
    });

    if (mostRecent === null) {
      return null;
    }

    // TypeScript type guard - mostRecent is definitely Date here
    const dateToFormat: Date = mostRecent;
    return dateToFormat.toLocaleString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  };

  const lastUpdated = getLastUpdatedDate();

  // Transform Supabase data to table format
  const transformToTableData = (item: any, getSegmentName: (item: any) => string) => {
    const isDaily = timeframe === 'D';
    // Performance data - use new simplified fields with fallback to old fields
    const perf1M = toNumeric(item['1m_percent'] ?? item.daily_1m_percent);
    const perf3M = toNumeric(item['3m_percent'] ?? item.daily_3m_percent);
    const vsHigh = toNumeric(item['vs_1y_high'] ?? item.daily_vs_1y_high);
    // Only trend data switches based on timeframe
    const trendScore = isDaily ? item.daily_trend_score : item.weekly_trend_score;
    const rating = isDaily ? item.daily_rating : item.weekly_rating;
    const outlook = isDaily ? item.daily_outlook : item.weekly_outlook;
    
    return {
      segment: getSegmentName(item),
      ticker: item.ticker,
      perf1M: perf1M,
      perf3M: perf3M,
      vsHigh: vsHigh,
      trendScore: trendScore ?? 0,
      rating: rating ?? 'N/A',
      outlook: outlook ?? 'N/A',
      hasX: (vsHigh ?? 0) <= -10, // Show X for values at or below -10%
      // No logic - all data comes from Supabase
    };
  };

  // Helper function to get display name from ticker
  const getDisplayName = (ticker: string, dbName: string | null | undefined): string => {
    return TICKER_TO_DISPLAY_NAME[ticker] || dbName || ticker;
  };

  // Helper function to sort by order array
  const sortByOrder = <T extends { ticker: string }>(items: T[], order: string[]): T[] => {
    return [...items].sort((a, b) => {
      const indexA = order.indexOf(a.ticker);
      const indexB = order.indexOf(b.ticker);
      // If both are in order array, sort by their position
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      // If only one is in order array, prioritize it
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      // If neither is in order array, maintain original order
      return 0;
    });
  };

  const marketSegmentsData = sortByOrder(
    segments.map(s => transformToTableData(s, (item) => getDisplayName(item.ticker, item.name))),
    SEGMENT_ORDER
  );
  const sectorsData = sortByOrder(
    sectors.map(s => transformToTableData(s, (item) => getDisplayName(item.ticker, item.sector_name))),
    SECTOR_ORDER
  );

  // Get performance color and icon based on value (matching sheet logic)
  const getPerformanceColor = (value: number) => {
    // Background colors removed - keeping for text color if needed
    return '';
  };

  const getPerformanceIcon = (value: number | null) => {
    if (value === null) return '⚪️';
    if (value > 0) return '🟩';
    if (value === 0) return '🟨';
    return '🟥';
  };

  const getVsHighIcon = (value: number | null) => {
    if (value === null) return '⚪️';
    if (value > -5) return '✅';
    if (value > -10) return '⚪️';
    return '❌';
  };

  const getCheckOrX = (value: number, hasX?: boolean) => {
    if (hasX) return <X className="w-3 h-3 text-red-600" />;
    return <Check className="w-3 h-3 text-green-600" />;
  };

  const renderStars = (score: number) => {
    const fullStars = Math.floor(score);
    const hasHalfStar = score % 1 >= 0.5;
    const stars = [];
    
    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(<Star key={i} className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-yellow-400 text-yellow-400" />);
      } else if (i === fullStars && hasHalfStar) {
        stars.push(<Star key={i} className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-yellow-400/50 text-yellow-400" />);
      } else {
        stars.push(<Star key={i} className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-neutral-300" />);
      }
    }
    return stars;
  };

  const renderTableSection = (title: string, data: typeof marketSegmentsData) => (
    <div className="mb-6 sm:mb-8 last:mb-0">
      {/* Section Headers */}
      <div className="grid grid-cols-[2fr_3fr_5fr] gap-0 mb-0">
        <div className="bg-neutral-900 text-white px-2 sm:px-4 py-2 text-center font-semibold border-r border-neutral-700 text-xs sm:text-sm">
          {title}
        </div>
        <div className="bg-neutral-900 text-white px-2 sm:px-4 py-2 text-center font-semibold border-r border-neutral-700 text-xs sm:text-sm">
          PERFORMANCE
        </div>
        <div className="bg-neutral-900 text-white px-2 sm:px-4 py-2 text-center font-semibold text-xs sm:text-sm">
          {timeframe === 'D' ? 'DAILY' : 'WEEKLY'} CHART TREND
        </div>
      </div>

      {/* Table with proper column alignment */}
      <table className="w-full border-collapse">
        <colgroup>
          <col className="w-[20%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[15%]" />
          <col className="w-[12%]" />
          <col className="w-[13%]" />
        </colgroup>
        <thead>
          <tr className="bg-neutral-100 border-b border-neutral-300">
            <th className="px-2 sm:px-4 py-2 sm:py-2.5 font-semibold text-neutral-900 border-r border-neutral-300 text-left text-xs sm:text-sm">Segment</th>
            <th className="px-2 sm:px-4 py-2 sm:py-2.5 font-semibold text-neutral-900 border-r border-neutral-300 text-center text-xs sm:text-sm">Ticker</th>
            <th className="px-2 sm:px-4 py-2 sm:py-2.5 font-semibold text-neutral-900 border-r border-neutral-300 text-center text-xs sm:text-sm">1M</th>
            <th className="px-2 sm:px-4 py-2 sm:py-2.5 font-semibold text-neutral-900 border-r border-neutral-300 text-center text-xs sm:text-sm">3M</th>
            <th className="px-2 sm:px-4 py-2 sm:py-2.5 font-semibold text-neutral-900 border-r border-neutral-300 text-center text-xs sm:text-sm">vs 1Y High</th>
            <th className="px-2 sm:px-4 py-2 sm:py-2.5 font-semibold text-neutral-900 border-r border-neutral-300 text-center text-xs sm:text-sm">Trend Score (0-5)</th>
            <th className="px-2 sm:px-4 py-2 sm:py-2.5 font-semibold text-neutral-900 border-r border-neutral-300 text-center text-xs sm:text-sm">Rating</th>
            <th className="px-2 sm:px-4 py-2 sm:py-2.5 font-semibold text-neutral-900 text-center text-xs sm:text-sm">Outlook</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr 
              key={idx} 
              className="border-b border-neutral-200 hover:bg-neutral-50 cursor-pointer transition-colors"
              onClick={() => onNavigate('ticker-analysis', row.ticker)}
            >
              <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-neutral-900 border-r border-neutral-200 truncate text-xs sm:text-sm">{row.segment}</td>
              <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-neutral-700 border-r border-neutral-200 text-center italic text-xs sm:text-sm">{row.ticker}</td>
              <td className="px-2 sm:px-4 py-2 sm:py-2.5 border-r border-neutral-200 text-neutral-900 font-medium text-xs sm:text-sm">
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <span className="flex-shrink-0 text-[10px] sm:text-xs">{getPerformanceIcon(row.perf1M)}</span>
                  <span className="flex-1 text-center tabular-nums whitespace-nowrap">{formatPercentValue(row.perf1M)}</span>
                </div>
              </td>
              <td className="px-2 sm:px-4 py-2 sm:py-2.5 border-r border-neutral-200 text-neutral-900 font-medium text-xs sm:text-sm">
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <span className="flex-shrink-0 text-[10px] sm:text-xs">{getPerformanceIcon(row.perf3M)}</span>
                  <span className="flex-1 text-center tabular-nums whitespace-nowrap">{formatPercentValue(row.perf3M)}</span>
                </div>
              </td>
              <td className="px-2 sm:px-4 py-2 sm:py-2.5 border-r border-neutral-200 text-neutral-900 font-medium text-xs sm:text-sm">
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <span className="flex-shrink-0 text-[10px] sm:text-xs">{getVsHighIcon(row.vsHigh)}</span>
                  <span className="flex-1 text-center tabular-nums whitespace-nowrap">{formatPercentValue(row.vsHigh)}</span>
                </div>
              </td>
              <td className="px-2 sm:px-4 py-2 sm:py-2.5 border-r border-neutral-200 text-xs sm:text-sm">
                <div className="flex items-center justify-center gap-1 sm:gap-2">
                  <div className="flex gap-0.5 flex-shrink-0">
                    {renderStars(row.trendScore)}
                  </div>
                  <span className="text-neutral-900 font-medium whitespace-nowrap">| {row.trendScore}</span>
                </div>
              </td>
              <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-center text-neutral-900 border-r border-neutral-200 text-xs sm:text-sm">{row.rating}</td>
              <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-center text-neutral-700 italic text-xs sm:text-sm truncate">{row.outlook}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader
        userEmail={userEmail}
        currentAppMode={currentAppMode}
        onGoToPortfolio={onGoToPortfolio}
        onGoToMWS={onGoToMWS}
        onSignOut={onSignOut}
        onBack={() => onNavigate('index')}
        backLabel="Back to MWS"
      />
      <main className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="font-semibold text-sm sm:text-base text-neutral-900">MWS&apos;s Momentum Pulse Check</h1>
            {lastUpdated && (
              <span className="text-xs text-neutral-500">last updated {lastUpdated}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border border-neutral-300 rounded overflow-hidden">
              <button
                onClick={() => setTimeframe('D')}
                className={`px-2 sm:px-3 py-1 text-xs transition-colors ${timeframe === 'D' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-100'}`}
              >
                D
              </button>
              <button
                onClick={() => setTimeframe('W')}
                className={`px-2 sm:px-3 py-1 text-xs border-l border-neutral-300 transition-colors ${timeframe === 'W' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-100'}`}
              >
                W
              </button>
            </div>
            <Button
              onClick={handleRefresh}
              disabled={loading}
              size="sm"
              variant="outline"
              className="flex-shrink-0"
            >
              <RefreshCw className={`w-3 h-3 sm:mr-2 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
        {loading && (
          <div className="bg-white border border-neutral-200 rounded-lg p-4 sm:p-6 text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-500" />
            <p className="text-sm sm:text-base text-neutral-600">Loading data from Supabase...</p>
          </div>
        )}
        
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex items-center gap-2 text-red-800 mb-2">
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              <h3 className="font-semibold text-sm sm:text-base">Error loading data</h3>
            </div>
            <p className="text-red-700 text-xs sm:text-sm">{error.message}</p>
            <Button onClick={handleRefresh} variant="outline" size="sm" className="mt-4">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        )}
        
        {!loading && !error && (
          <div className="bg-white border border-neutral-200 rounded-lg p-4 sm:p-6 overflow-x-auto">
            <div className="min-w-[800px]">
            {renderTableSection('MARKET SEGMENTS', marketSegmentsData)}
            {renderTableSection('SECTORS', sectorsData)}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}