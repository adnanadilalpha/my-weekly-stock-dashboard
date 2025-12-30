'use client';

import { useState } from 'react';
import { ArrowLeft, RefreshCw, Star, Check, X, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import type { PageView } from '../types';
import { useDashboardData } from '../../lib/hooks/useDashboardData';

interface DashboardPageProps {
  userEmail: string;
  onSignOut: () => void;
  onNavigate: (page: PageView, ticker?: string) => void;
}

export function DashboardPage({ userEmail, onSignOut, onNavigate }: DashboardPageProps) {
  const [timeframe, setTimeframe] = useState<'D' | 'W'>('D');
  const { segments, sectors, megaCaps, loading, error, refetch } = useDashboardData(timeframe);

  const handleRefresh = async () => {
    await refetch();
  };

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

  const marketSegmentsData = segments.map(s => transformToTableData(s, (item) => item.name || item.ticker));
  const sectorsData = sectors.map(s => transformToTableData(s, (item) => item.sector_name || item.ticker));
  const megaCapsData = megaCaps.map(m => transformToTableData(m, (item) => item.company_name || item.ticker));

  // Get performance color and icon based on value (matching sheet logic)
  const getPerformanceColor = (value: number) => {
    if (value > 5) return 'bg-green-500';
    if (value > 0) return 'bg-green-200';
    if (value === 0) return 'bg-yellow-200';
    if (value > -5) return 'bg-red-200';
    return 'bg-red-500';
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
        stars.push(<Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />);
      } else if (i === fullStars && hasHalfStar) {
        stars.push(<Star key={i} className="w-3 h-3 fill-yellow-400/50 text-yellow-400" />);
      } else {
        stars.push(<Star key={i} className="w-3 h-3 text-neutral-300" />);
      }
    }
    return stars;
  };

  const renderTableSection = (title: string, data: typeof marketSegmentsData) => (
    <div className="mb-8 last:mb-0">
      {/* Section Headers */}
      <div className="grid grid-cols-[2fr_3fr_5fr] gap-0 mb-0">
        <div className="bg-neutral-900 text-white px-4 py-2 text-center font-semibold border-r border-neutral-700">
          {title}
        </div>
        <div className="bg-neutral-900 text-white px-4 py-2 text-center font-semibold border-r border-neutral-700">
          PERFORMANCE
        </div>
        <div className="bg-neutral-900 text-white px-4 py-2 text-center font-semibold">
          {timeframe === 'D' ? 'DAILY' : 'WEEKLY'} CHART TREND
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_2fr_1.5fr_1.5fr] gap-0 bg-neutral-100 border-b border-neutral-300 text-sm">
        <div className="px-4 py-2.5 font-semibold text-neutral-900 border-r border-neutral-300">Segment</div>
        <div className="px-4 py-2.5 font-semibold text-neutral-900 text-center border-r border-neutral-300">Ticker</div>
        <div className="px-4 py-2.5 font-semibold text-neutral-900 text-center border-r border-neutral-300">1M</div>
        <div className="px-4 py-2.5 font-semibold text-neutral-900 text-center border-r border-neutral-300">3M</div>
        <div className="px-4 py-2.5 font-semibold text-neutral-900 text-center border-r border-neutral-300">vs 1Y High</div>
        <div className="px-4 py-2.5 font-semibold text-neutral-900 text-center border-r border-neutral-300">Trend Score (0-5)</div>
        <div className="px-4 py-2.5 font-semibold text-neutral-900 text-center border-r border-neutral-300">Rating</div>
        <div className="px-4 py-2.5 font-semibold text-neutral-900 text-center">Outlook</div>
      </div>

      {/* Data Rows */}
      {data.map((row, idx) => (
        <div 
          key={idx} 
          className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_2fr_1.5fr_1.5fr] gap-0 border-b border-neutral-200 hover:bg-neutral-50 cursor-pointer text-sm transition-colors"
          onClick={() => onNavigate('ticker-analysis', row.ticker)}
        >
          <div className="px-4 py-2.5 text-neutral-900 border-r border-neutral-200">{row.segment}</div>
          <div className="px-4 py-2.5 text-neutral-700 text-center border-r border-neutral-200 italic">{row.ticker}</div>
          <div className={`px-4 py-2.5 text-center border-r border-neutral-200 ${getPerformanceColor(row.perf1M)} text-neutral-900 font-medium`}>
            {getPerformanceIcon(row.perf1M)} {row.perf1M > 0 ? '+' : ''}{row.perf1M}%
          </div>
          <div className={`px-4 py-2.5 text-center border-r border-neutral-200 ${getPerformanceColor(row.perf3M)} text-neutral-900 font-medium`}>
            {getPerformanceIcon(row.perf3M)} {row.perf3M > 0 ? '+' : ''}{row.perf3M}%
          </div>
          <div className={`px-4 py-2.5 text-center border-r border-neutral-200 flex items-center justify-center gap-1.5 ${getPerformanceColor(row.vsHigh)} text-neutral-900 font-medium`}>
            {getVsHighIcon(row.vsHigh)} {row.vsHigh > 0 ? '+' : ''}{row.vsHigh}%
            {getCheckOrX(row.vsHigh, row.hasX)}
          </div>
          <div className="px-4 py-2.5 border-r border-neutral-200 flex items-center justify-between gap-2">
            <div className="flex gap-0.5">
              {renderStars(row.trendScore)}
            </div>
            <span className="text-neutral-900 font-medium">| {row.trendScore}</span>
          </div>
          <div className="px-4 py-2.5 text-center text-neutral-900 border-r border-neutral-200">{row.rating}</div>
          <div className="px-4 py-2.5 text-center text-neutral-700 italic">{row.outlook}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 shadow-sm sticky top-0 z-10">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('index')}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="font-semibold text-neutral-900">MWS's Momentum Pulse Check</h1>
                <span className="text-xs text-neutral-500">last updated 12/23/2025</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-600">[Select Timeframe ▶]</span>
                <div className="flex border border-neutral-300 rounded overflow-hidden">
                  <button
                    onClick={() => setTimeframe('D')}
                    className={`px-3 py-1 text-xs transition-colors ${timeframe === 'D' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-100'}`}
                  >
                    D
                  </button>
                  <button
                    onClick={() => setTimeframe('W')}
                    className={`px-3 py-1 text-xs border-l border-neutral-300 transition-colors ${timeframe === 'W' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-100'}`}
                  >
                    W
                  </button>
                </div>
              </div>
              <Button
                onClick={handleRefresh}
                disabled={loading}
                size="sm"
                variant="outline"
              >
                <RefreshCw className={`w-3 h-3 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        {loading && (
          <div className="bg-white border border-neutral-200 rounded-lg p-6 text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-neutral-500" />
            <p className="text-neutral-600">Loading data from Supabase...</p>
          </div>
        )}
        
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-2 text-red-800 mb-2">
              <AlertCircle className="w-5 h-5" />
              <h3 className="font-semibold">Error loading data</h3>
            </div>
            <p className="text-red-700 text-sm">{error.message}</p>
            <Button onClick={handleRefresh} variant="outline" size="sm" className="mt-4">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        )}
        
        {!loading && !error && (
          <div className="bg-white border border-neutral-200 rounded-lg p-6">
            {renderTableSection('MARKET SEGMENTS', marketSegmentsData)}
            {renderTableSection('SECTORS', sectorsData)}
            {renderTableSection('MEGA CAPS', megaCapsData)}
          </div>
        )}
      </main>
    </div>
  );
}