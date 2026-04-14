'use client';

import { useState } from 'react';
import { RefreshCw, Star, Check, X, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { AppHeader } from './app-header';
import { TickerIcon } from './ui/ticker-icon';
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
    const perf1M = item['1m_percent'] ?? item.daily_1m_percent;
    const perf3M = item['3m_percent'] ?? item.daily_3m_percent;
    const vsHigh = item['vs_1y_high'] ?? item.daily_vs_1y_high;
    // Only trend data switches based on timeframe
    const trendScore = isDaily ? item.daily_trend_score : item.weekly_trend_score;
    const rating = isDaily ? item.daily_rating : item.weekly_rating;
    const outlook = isDaily ? item.daily_outlook : item.weekly_outlook;
    
    return {
      segment: getSegmentName(item),
      ticker: item.ticker,
      perf1M: perf1M ?? 0,
      perf3M: perf3M ?? 0,
      vsHigh: vsHigh ?? 0,
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

  const getPerformanceIcon = (value: number) => {
    if (value > 0) return '🟩';
    if (value === 0) return '🟨';
    return '🟥';
  };

  const getVsHighIcon = (value: number) => {
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
    <div className="mb-7 sm:mb-9 last:mb-0">
      {/* Section Headers */}
      <div className="grid grid-cols-[2fr_3fr_5fr] gap-0 mb-0">
        <div className="bg-slate-900 text-white px-3 sm:px-4 py-2.5 text-center font-semibold border-r border-slate-700 text-xs sm:text-sm tracking-wide">
          {title}
        </div>
        <div className="bg-slate-900 text-white px-3 sm:px-4 py-2.5 text-center font-semibold border-r border-slate-700 text-xs sm:text-sm tracking-wide">
          PERFORMANCE
        </div>
        <div className="bg-slate-900 text-white px-3 sm:px-4 py-2.5 text-center font-semibold text-xs sm:text-sm tracking-wide">
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
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-3 sm:px-4 py-2.5 font-semibold text-slate-900 border-r border-slate-200 text-left text-xs sm:text-sm">Segment</th>
            <th className="px-3 sm:px-4 py-2.5 font-semibold text-slate-900 border-r border-slate-200 text-left text-xs sm:text-sm">Ticker</th>
            <th className="px-3 sm:px-4 py-2.5 font-semibold text-slate-900 border-r border-slate-200 text-center text-xs sm:text-sm">1M</th>
            <th className="px-3 sm:px-4 py-2.5 font-semibold text-slate-900 border-r border-slate-200 text-center text-xs sm:text-sm">3M</th>
            <th className="px-3 sm:px-4 py-2.5 font-semibold text-slate-900 border-r border-slate-200 text-center text-xs sm:text-sm">vs 1Y High</th>
            <th className="px-3 sm:px-4 py-2.5 font-semibold text-slate-900 border-r border-slate-200 text-center text-xs sm:text-sm">Trend Score (0-5)</th>
            <th className="px-3 sm:px-4 py-2.5 font-semibold text-slate-900 border-r border-slate-200 text-center text-xs sm:text-sm">Rating</th>
            <th className="px-3 sm:px-4 py-2.5 font-semibold text-slate-900 text-center text-xs sm:text-sm">Outlook</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr 
              key={idx} 
              className="border-b border-slate-100 hover:bg-slate-50/70 cursor-pointer transition-colors"
              onClick={() => onNavigate('ticker-analysis', row.ticker)}
            >
              <td className="px-3 sm:px-4 py-2.5 text-slate-900 border-r border-slate-100 truncate text-xs sm:text-sm">{row.segment}</td>
              <td className="px-3 sm:px-4 py-2.5 text-slate-700 border-r border-slate-100 text-left text-xs sm:text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <TickerIcon ticker={row.ticker} size={14} />
                  <span>{row.ticker}</span>
                </span>
              </td>
              <td className="px-3 sm:px-4 py-2.5 border-r border-slate-100 text-slate-900 font-medium text-xs sm:text-sm">
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <span className="flex-shrink-0 text-[10px] sm:text-xs">{getPerformanceIcon(row.perf1M)}</span>
                  <span className="flex-1 text-center tabular-nums whitespace-nowrap">{row.perf1M > 0 ? '+' : ''}{row.perf1M}%</span>
                </div>
              </td>
              <td className="px-3 sm:px-4 py-2.5 border-r border-slate-100 text-slate-900 font-medium text-xs sm:text-sm">
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <span className="flex-shrink-0 text-[10px] sm:text-xs">{getPerformanceIcon(row.perf3M)}</span>
                  <span className="flex-1 text-center tabular-nums whitespace-nowrap">{row.perf3M > 0 ? '+' : ''}{row.perf3M}%</span>
                </div>
              </td>
              <td className="px-3 sm:px-4 py-2.5 border-r border-slate-100 text-slate-900 font-medium text-xs sm:text-sm">
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <span className="flex-shrink-0 text-[10px] sm:text-xs">{getVsHighIcon(row.vsHigh)}</span>
                  <span className="flex-1 text-center tabular-nums whitespace-nowrap">{row.vsHigh > 0 ? '+' : ''}{row.vsHigh}%</span>
                </div>
              </td>
              <td className="px-3 sm:px-4 py-2.5 border-r border-slate-100 text-xs sm:text-sm">
                <div className="flex items-center justify-center gap-1 sm:gap-2">
                  <div className="flex gap-0.5 flex-shrink-0">
                    {renderStars(row.trendScore)}
                  </div>
                  <span className="text-slate-900 font-medium whitespace-nowrap">| {row.trendScore}</span>
                </div>
              </td>
              <td className="px-3 sm:px-4 py-2.5 text-center text-slate-900 border-r border-slate-100 text-xs sm:text-sm">{row.rating}</td>
              <td className="px-3 sm:px-4 py-2.5 text-center text-slate-700 italic text-xs sm:text-sm truncate">{row.outlook}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        userEmail={userEmail}
        currentAppMode={currentAppMode}
        onGoToPortfolio={onGoToPortfolio}
        onGoToMWS={onGoToMWS}
        onSignOut={onSignOut}
        onBack={() => onNavigate('index')}
        backLabel="Back to MWS"
      />
      <main className="p-4 sm:p-6 lg:p-8 w-full max-w-none">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="font-semibold text-base text-slate-900">MWS&apos;s Momentum Pulse Check</h1>
            {lastUpdated && (
              <span className="text-xs text-slate-500">last updated {lastUpdated}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border border-slate-300 rounded-md overflow-hidden bg-white">
              <button
                onClick={() => setTimeframe('D')}
                className={`px-2 sm:px-3 py-1 text-xs transition-colors ${timeframe === 'D' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
              >
                D
              </button>
              <button
                onClick={() => setTimeframe('W')}
                className={`px-2 sm:px-3 py-1 text-xs border-l border-slate-300 transition-colors ${timeframe === 'W' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
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
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 overflow-x-auto">
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