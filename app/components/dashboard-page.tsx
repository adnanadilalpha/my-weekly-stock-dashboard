'use client';

import { useState } from 'react';
import { ArrowLeft, RefreshCw, Star, Check, X } from 'lucide-react';
import { Button } from './ui/button';
import type { PageView } from '../types';

interface DashboardPageProps {
  userEmail: string;
  onSignOut: () => void;
  onNavigate: (page: PageView, ticker?: string) => void;
}

const marketSegments = [
  { segment: 'S&P500', ticker: 'SPY', perf1M: 2.3, perf3M: 3.6, vsHigh: -0.8, trendScore: 1.7, rating: 'Sideways', outlook: 'Stable' },
  { segment: 'Nasdaq', ticker: 'QQQ', perf1M: 2.3, perf3M: 3.4, vsHigh: -2.9, trendScore: 1.7, rating: 'Sideways', outlook: 'Stable' },
  { segment: 'Small Caps', ticker: 'IWM', perf1M: 5.2, perf3M: 4.4, vsHigh: -2.4, trendScore: 3.3, rating: 'Uptrend', outlook: 'Stable' },
  { segment: 'Treasuries', ticker: 'TLT', perf1M: -3, perf3M: -2.3, vsHigh: -7.2, trendScore: 0.8, rating: 'Strong Downtrend', outlook: 'Stable' },
  { segment: 'US Dollar fund', ticker: 'UUP', perf1M: -5, perf3M: -2, vsHigh: -9.8, trendScore: 0.3, rating: 'Strong Downtrend', outlook: 'Stable' },
  { segment: 'Gold', ticker: 'GLD', perf1M: 7.5, perf3M: 19, vsHigh: -0.5, trendScore: 5, rating: 'Strong Uptrend', outlook: 'Stable' },
  { segment: 'Silver', ticker: 'SLV', perf1M: 34.7, perf3M: 57.7, vsHigh: -1.4, trendScore: 5, rating: 'Strong Uptrend', outlook: 'Extended' },
  { segment: 'Bitcoin', ticker: 'IBIT', perf1M: -2.2, perf3M: -23.3, vsHigh: -31.2, trendScore: 0.2, rating: 'Strong Downtrend', outlook: 'Stable', hasX: true },
  { segment: 'Ethereum', ticker: 'ETHA', perf1M: -1.6, perf3M: -29.8, vsHigh: -40, trendScore: 0, rating: 'Strong Downtrend', outlook: 'Stable', hasX: true },
  { segment: 'Oil', ticker: 'USO', perf1M: -1.2, perf3M: -8.9, vsHigh: -17.7, trendScore: 1.5, rating: 'Downtrend', outlook: 'Reversing', hasX: true },
];

const sectors = [
  { segment: 'Technology', ticker: 'XLK', perf1M: 3.6, perf3M: 4, vsHigh: -5.3, trendScore: 1.7, rating: 'Sideways', outlook: 'Stable' },
  { segment: 'Telecommunication Services', ticker: 'XLC', perf1M: 3.5, perf3M: -0.4, vsHigh: -2.2, trendScore: 2.7, rating: 'Sideways', outlook: 'Stable' },
  { segment: 'Semiconductors', ticker: 'SMH', perf1M: 6.2, perf3M: 12.2, vsHigh: -4.1, trendScore: 2.7, rating: 'Sideways', outlook: 'Firming' },
  { segment: 'Consumer Cyclicals', ticker: 'XLY', perf1M: 6.8, perf3M: 1.8, vsHigh: -1.3, trendScore: 3.3, rating: 'Uptrend', outlook: 'Stable' },
  { segment: 'Financials', ticker: 'XLF', perf1M: 6.8, perf3M: 3.1, vsHigh: -0.2, trendScore: 3.7, rating: 'Uptrend', outlook: 'Stable' },
  { segment: 'Industrials', ticker: 'XLI', perf1M: 4.7, perf3M: 2.7, vsHigh: -0.8, trendScore: 3.3, rating: 'Uptrend', outlook: 'Stable' },
  { segment: 'Energy', ticker: 'XLE', perf1M: -0.6, perf3M: -1.8, vsHigh: -6.5, trendScore: 0.5, rating: 'Sideways', outlook: 'Stable' },
  { segment: 'Materials', ticker: 'XLB', perf1M: 5.4, perf3M: 1.2, vsHigh: -1.8, trendScore: 4, rating: 'Strong Uptrend', outlook: 'Stable' },
  { segment: 'Real Estate', ticker: 'XLRE', perf1M: -2.2, perf3M: -4.6, vsHigh: -8.7, trendScore: 0.8, rating: 'Strong Downtrend', outlook: 'Stable' },
  { segment: 'Utilities', ticker: 'XLU', perf1M: -4.3, perf3M: -1, vsHigh: -9, trendScore: 0.8, rating: 'Strong Downtrend', outlook: 'Stable' },
  { segment: 'Healthcare', ticker: 'XLV', perf1M: 0, perf3M: 13.8, vsHigh: -2.3, trendScore: 3.3, rating: 'Uptrend', outlook: 'Stable' },
  { segment: 'Consumer Defensive', ticker: 'XLP', perf1M: 0.7, perf3M: -1.1, vsHigh: -8.1, trendScore: 1.2, rating: 'Downtrend', outlook: 'Stable' },
];

const megaCaps = [
  { segment: 'Nvidia', ticker: 'NVDA', perf1M: 1.4, perf3M: 4.6, vsHigh: -12.8, trendScore: 3.3, rating: 'Uptrend', outlook: 'Stable', hasX: true },
  { segment: 'Microsoft', ticker: 'MSFT', perf1M: 2.5, perf3M: -4.8, vsHigh: -12.5, trendScore: 1.7, rating: 'Sideways', outlook: 'Stable', hasX: true },
  { segment: 'Apple', ticker: 'AAPL', perf1M: -1.9, perf3M: 6.4, vsHigh: -6.2, trendScore: 1.3, rating: 'Downtrend', outlook: 'Stable' },
  { segment: 'Alphabet', ticker: 'GOOG', perf1M: -1.5, perf3M: 26.6, vsHigh: -4.5, trendScore: 3.7, rating: 'Uptrend', outlook: 'Stable' },
  { segment: 'Amazon', ticker: 'AMZN', perf1M: 1.8, perf3M: 4.6, vsHigh: -11, trendScore: 2, rating: 'Sideways', outlook: 'Stable', hasX: true },
  { segment: 'Meta', ticker: 'META', perf1M: 8.1, perf3M: -12.3, vsHigh: -16.8, trendScore: 4, rating: 'Strong Uptrend', outlook: 'Stable', hasX: true },
  { segment: 'Tesla', ticker: 'TSLA', perf1M: 16.5, perf3M: 9.9, vsHigh: -2.4, trendScore: 5, rating: 'Strong Uptrend', outlook: 'Stable' },
  { segment: 'JPMorgan', ticker: 'JPM', perf1M: 9.1, perf3M: 3.7, vsHigh: -0.2, trendScore: 4.3, rating: 'Strong Uptrend', outlook: 'Stable' },
  { segment: 'Walmart', ticker: 'WMT', perf1M: 7.1, perf3M: 8.5, vsHigh: -5.1, trendScore: 2.5, rating: 'Sideways', outlook: 'Stable' },
  { segment: 'Eli Lilly', ticker: 'LLY', perf1M: 0.7, perf3M: 45.2, vsHigh: -3.1, trendScore: 5, rating: 'Strong Uptrend', outlook: 'Stable' },
];

export function DashboardPage({ userEmail, onSignOut, onNavigate }: DashboardPageProps) {
  const [timeframe, setTimeframe] = useState<'D' | 'W'>('D');
  const [isSyncing, setIsSyncing] = useState(false);

  const handleRefresh = async () => {
    setIsSyncing(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsSyncing(false);
  };

  const getPerformanceColor = (value: number) => {
    if (value > 5) return 'bg-green-500';
    if (value > 0) return 'bg-green-200';
    if (value === 0) return 'bg-yellow-200';
    if (value > -5) return 'bg-red-200';
    return 'bg-red-500';
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

  const renderTableSection = (title: string, data: typeof marketSegments) => (
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
          DAILY CHART TREND
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
            {row.perf1M > 0 ? '+' : ''}{row.perf1M}%
          </div>
          <div className={`px-4 py-2.5 text-center border-r border-neutral-200 ${getPerformanceColor(row.perf3M)} text-neutral-900 font-medium`}>
            {row.perf3M > 0 ? '+' : ''}{row.perf3M}%
          </div>
          <div className={`px-4 py-2.5 text-center border-r border-neutral-200 flex items-center justify-center gap-1.5 ${getPerformanceColor(row.vsHigh)} text-neutral-900 font-medium`}>
            {row.vsHigh > 0 ? '+' : ''}{row.vsHigh}%
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
                disabled={isSyncing}
                size="sm"
                variant="outline"
              >
                <RefreshCw className={`w-3 h-3 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        <div className="bg-white border border-neutral-200 rounded-lg p-6">
          {renderTableSection('MARKET SEGMENTS', marketSegments)}
          {renderTableSection('SECTORS', sectors)}
          {renderTableSection('MEGA CAPS', megaCaps)}
        </div>
      </main>
    </div>
  );
}