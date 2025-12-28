'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, Star, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import type { PageView } from '../types';

interface TickerAnalysisPageProps {
  userEmail: string;
  onSignOut: () => void;
  onNavigate: (page: PageView) => void;
  initialTicker: string;
}

// All available tickers organized by category
const MARKET_SEGMENTS = ['SPY', 'QQQ', 'IWM', 'TLT', 'UUP', 'GLD', 'SLV', 'IBIT', 'ETHA', 'USO'];
const SECTORS = ['XLK', 'XLC', 'SMH', 'XLY', 'XLF', 'XLI', 'XLE', 'XLB', 'XLRE', 'XLU', 'XLV', 'XLP'];
const MEGA_CAPS = ['NVDA', 'MSFT', 'AAPL', 'GOOG', 'AMZN', 'META', 'TSLA', 'JPM', 'WMT', 'LLY'];

// Mapping of ticker symbols to full company/fund names
const TICKER_NAMES: Record<string, string> = {
  // Market Segments
  'SPY': 'SPDR S&P 500 ETF Trust',
  'QQQ': 'Invesco QQQ Trust',
  'IWM': 'iShares Russell 2000 ETF',
  'TLT': 'iShares 20+ Year Treasury Bond ETF',
  'UUP': 'Invesco DB US Dollar Index Bullish Fund',
  'GLD': 'SPDR Gold Shares',
  'SLV': 'iShares Silver Trust',
  'IBIT': 'iShares Bitcoin Trust',
  'ETHA': 'iShares Ethereum Trust',
  'USO': 'United States Oil Fund',
  // Sectors
  'XLK': 'Technology Select Sector SPDR Fund',
  'XLC': 'Communication Services Select Sector SPDR Fund',
  'SMH': 'VanEck Semiconductor ETF',
  'XLY': 'Consumer Discretionary Select Sector SPDR Fund',
  'XLF': 'Financial Select Sector SPDR Fund',
  'XLI': 'Industrial Select Sector SPDR Fund',
  'XLE': 'Energy Select Sector SPDR Fund',
  'XLB': 'Materials Select Sector SPDR Fund',
  'XLRE': 'Real Estate Select Sector SPDR Fund',
  'XLU': 'Utilities Select Sector SPDR Fund',
  'XLV': 'Health Care Select Sector SPDR Fund',
  'XLP': 'Consumer Staples Select Sector SPDR Fund',
  // Mega Caps
  'NVDA': 'NVIDIA Corporation',
  'MSFT': 'Microsoft Corporation',
  'AAPL': 'Apple Inc.',
  'GOOG': 'Alphabet Inc.',
  'AMZN': 'Amazon.com Inc.',
  'META': 'Meta Platforms Inc.',
  'TSLA': 'Tesla Inc.',
  'JPM': 'JPMorgan Chase & Co.',
  'WMT': 'Walmart Inc.',
  'LLY': 'Eli Lilly and Company',
};

// Mapping of tickers to their sector and appropriate benchmark
const TICKER_SECTORS: Record<string, { category: string; benchmark: string; benchmarkName: string }> = {
  // Market Segments - compare against QQQ
  'SPY': { category: 'Market Index', benchmark: 'QQQ', benchmarkName: 'Nasdaq 100' },
  'QQQ': { category: 'Market Index', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  'IWM': { category: 'Small Cap Index', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  'TLT': { category: 'Bonds', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  'UUP': { category: 'Currency', benchmark: 'GLD', benchmarkName: 'Gold' },
  'GLD': { category: 'Commodities', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  'SLV': { category: 'Commodities', benchmark: 'GLD', benchmarkName: 'Gold' },
  'IBIT': { category: 'Crypto', benchmark: 'QQQ', benchmarkName: 'Nasdaq 100' },
  'ETHA': { category: 'Crypto', benchmark: 'IBIT', benchmarkName: 'Bitcoin' },
  'USO': { category: 'Commodities', benchmark: 'XLE', benchmarkName: 'Energy Sector' },
  // Sectors - compare against SPY
  'XLK': { category: 'Technology Sector', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  'XLC': { category: 'Communication Services', benchmark: 'XLK', benchmarkName: 'Technology' },
  'SMH': { category: 'Semiconductors', benchmark: 'XLK', benchmarkName: 'Technology' },
  'XLY': { category: 'Consumer Discretionary', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  'XLF': { category: 'Financial Sector', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  'XLI': { category: 'Industrial Sector', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  'XLE': { category: 'Energy Sector', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  'XLB': { category: 'Materials Sector', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  'XLRE': { category: 'Real Estate Sector', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  'XLU': { category: 'Utilities Sector', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  'XLV': { category: 'Healthcare Sector', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  'XLP': { category: 'Consumer Staples', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  // Mega Caps - compare against their sector
  'NVDA': { category: 'Technology', benchmark: 'XLK', benchmarkName: 'Technology Sector' },
  'MSFT': { category: 'Technology', benchmark: 'XLK', benchmarkName: 'Technology Sector' },
  'AAPL': { category: 'Technology', benchmark: 'XLK', benchmarkName: 'Technology Sector' },
  'GOOG': { category: 'Communication Services', benchmark: 'XLC', benchmarkName: 'Communication Services' },
  'AMZN': { category: 'Consumer Discretionary', benchmark: 'XLY', benchmarkName: 'Consumer Discretionary' },
  'META': { category: 'Communication Services', benchmark: 'XLC', benchmarkName: 'Communication Services' },
  'TSLA': { category: 'Consumer Discretionary', benchmark: 'XLY', benchmarkName: 'Consumer Discretionary' },
  'JPM': { category: 'Financials', benchmark: 'XLF', benchmarkName: 'Financial Sector' },
  'WMT': { category: 'Consumer Staples', benchmark: 'XLP', benchmarkName: 'Consumer Staples' },
  'LLY': { category: 'Healthcare', benchmark: 'XLV', benchmarkName: 'Healthcare Sector' },
};

// Helper to generate mock data for any ticker
const generateMockData = (ticker: string) => {
  const isPositive = Math.random() > 0.5;
  const trend = Math.random();
  const sectorInfo = TICKER_SECTORS[ticker] || { category: 'Other', benchmark: 'SPY', benchmarkName: 'S&P 500' };
  
  return {
    name: TICKER_NAMES[ticker] || `${ticker} - Company Name`,
    lastUpdated: '12/24/2025',
    performance: {
      summary: isPositive ? 'Strong performer | Outperforming benchmarks' : 'Mixed performer | Lagging vs benchmarks',
      description: `$${ticker} has posted ${isPositive ? 'strong' : 'mixed'} results and ${isPositive ? 'outperforms' : 'lags'} main benchmarks. It trades ${isPositive ? 'near' : 'well below'} its 1-year high.`,
      oneMonth: parseFloat((Math.random() * 20 - 10).toFixed(1)),
      threeMonth: parseFloat((Math.random() * 30 - 15).toFixed(1)),
      oneMonthColor: isPositive ? 'green' : 'red',
      threeMonthColor: isPositive ? 'green' : 'red',
      vsHigh1Y: parseFloat((Math.random() * -20).toFixed(1)),
      vsSP500_Benchmark: isPositive ? 'Outperforming' : 'Lagging',
      vsBenchmark2: isPositive ? 'Outperforming' : 'Lagging',
      sectorInfo,
      benchmarks: {
        spy: { oneMonth: 2.3, threeMonth: 3.5 },
        sector: { 
          ticker: sectorInfo.benchmark,
          name: sectorInfo.benchmarkName,
          oneMonth: parseFloat((Math.random() * 15 - 5).toFixed(1)), 
          threeMonth: parseFloat((Math.random() * 25 - 10).toFixed(1))
        }
      }
    },
    trend: {
      rating: parseFloat((trend * 5).toFixed(1)),
      direction: trend > 0.6 ? 'Strong Uptrend' : trend > 0.3 ? 'Uptrend' : 'Downtrend',
      outlook: Math.random() > 0.5 ? 'Stable' : 'Extended',
      description: `Momentum signals ${isPositive ? 'aligned to upside' : 'show weakness'}. Price trading ${isPositive ? 'above' : 'below'} EMAs.`,
      signals: [
        { label: 'Price vs 9-day EMA', value: parseFloat((Math.random() * 10 - 5).toFixed(1)), isNegative: !isPositive },
        { label: 'Price vs 21-day EMA', value: parseFloat((Math.random() * 10 - 5).toFixed(1)), isNegative: !isPositive },
        { label: '9-day EMA vs. 21-day EMA', value: parseFloat((Math.random() * 5 - 2.5).toFixed(1)), isNegative: !isPositive },
        { label: 'Slope 9-day EMA', value: isPositive ? 'Rising' : 'Falling', isNegative: !isPositive },
        { label: 'Slope 21-day EMA', value: isPositive ? 'Rising' : 'Falling', isNegative: !isPositive },
      ],
      keyLevels: [
        { label: 'Current Price', value: (Math.random() * 200 + 50).toFixed(2) },
        { label: '9-day EMA', value: (Math.random() * 200 + 50).toFixed(2) },
        { label: '21-day EMA', value: (Math.random() * 200 + 50).toFixed(2) },
        { label: '1-month High', value: (Math.random() * 250 + 100).toFixed(2) },
        { label: '1-month Low', value: (Math.random() * 150 + 25).toFixed(2) },
      ]
    }
  };
};

// Specific mock data for key tickers
const tickerData: Record<string, any> = {
  'SPY': {
    name: 'SPDR S&P 500 ETF Trust',
    lastUpdated: '12/24/2025',
    performance: {
      summary: 'Strong performer | In line with benchmarks',
      description: '$SPY tracks the S&P 500 index. It trades near its 1-year high, showing consistent strength across major sectors.',
      oneMonth: 2.3,
      threeMonth: 3.6,
      oneMonthColor: 'green',
      threeMonthColor: 'green',
      vsHigh1Y: -0.8,
      vsSP500_Benchmark: 'In line',
      vsXLV_Benchmark: 'In line',
      benchmarks: {
        spy: { oneMonth: 2.3, threeMonth: 3.5 },
        qqq: { oneMonth: 2.3, threeMonth: 3.4 }
      }
    },
    trend: {
      rating: 1.7,
      direction: 'Sideways',
      outlook: 'Stable',
      description: 'Momentum signals show consolidation. Price trading near both EMAs with no clear directional bias.',
      signals: [
        { label: 'Price vs 9-day EMA', value: 0.2, isNegative: false },
        { label: 'Price vs 21-day EMA', value: -0.3, isNegative: true },
        { label: '9-day EMA vs. 21-day EMA', value: 0.1, isNegative: false },
        { label: 'Slope 9-day EMA', value: 'Flat', isNegative: false },
        { label: 'Slope 21-day EMA', value: 'Rising', isNegative: false },
      ],
      keyLevels: [
        { label: 'Current Price', value: '478.25' },
        { label: '9-day EMA', value: '477.32' },
        { label: '21-day EMA', value: '479.11' },
        { label: '1-month High', value: '482.15' },
        { label: '1-month Low', value: '467.89' },
      ]
    }
  },
  'NVDA': {
    name: 'NVIDIA Corporation',
    lastUpdated: '12/24/2025',
    performance: {
      summary: 'Mixed performer | Underperforming recent highs',
      description: '$NVDA has posted mixed results. Leading AI chip maker facing consolidation after strong rally.',
      oneMonth: 1.4,
      threeMonth: 4.6,
      oneMonthColor: 'green',
      threeMonthColor: 'green',
      vsHigh1Y: -12.8,
      vsSP500_Benchmark: 'In line',
      vsXLV_Benchmark: 'Outperforming',
      benchmarks: {
        spy: { oneMonth: 2.3, threeMonth: 3.5 },
        xlk: { oneMonth: 3.6, threeMonth: 4.0 }
      }
    },
    trend: {
      rating: 3.3,
      direction: 'Uptrend',
      outlook: 'Stable',
      description: 'Momentum signals remain constructive. Price trading above key EMAs despite recent pullback.',
      signals: [
        { label: 'Price vs 9-day EMA', value: 2.1, isNegative: false },
        { label: 'Price vs 21-day EMA', value: 5.3, isNegative: false },
        { label: '9-day EMA vs. 21-day EMA', value: 3.2, isNegative: false },
        { label: 'Slope 9-day EMA', value: 'Rising', isNegative: false },
        { label: 'Slope 21-day EMA', value: 'Rising', isNegative: false },
      ],
      keyLevels: [
        { label: 'Current Price', value: '138.42' },
        { label: '9-day EMA', value: '135.58' },
        { label: '21-day EMA', value: '131.45' },
        { label: '1-month High', value: '158.75' },
        { label: '1-month Low', value: '127.33' },
      ]
    }
  },
};

export function TickerAnalysisPage({ userEmail, onSignOut, onNavigate, initialTicker }: TickerAnalysisPageProps) {
  const [ticker, setTicker] = useState(initialTicker);
  const [timeframe, setTimeframe] = useState<'D' | 'W'>('D');
  const [isSyncing, setIsSyncing] = useState(false);

  // Get data for ticker - use specific data if available, otherwise generate mock data
  const data = tickerData[ticker] || generateMockData(ticker);

  // All available tickers for the dropdown
  const allTickers = [...MARKET_SEGMENTS, ...SECTORS, ...MEGA_CAPS].sort();

  const handleRefresh = async () => {
    setIsSyncing(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsSyncing(false);
  };

  const getPerformanceColor = (value: number) => {
    if (value > 5) return 'bg-green-500 text-white';
    if (value > 0) return 'bg-green-200 text-green-900';
    if (value > -5) return 'bg-red-200 text-red-900';
    return 'bg-red-500 text-white';
  };

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 0; i < 5; i++) {
      stars.push(
        <Star 
          key={i} 
          className={`w-4 h-4 ${i < Math.floor(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-neutral-300'}`} 
        />
      );
    }
    return stars;
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Compact Header */}
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
              
              <Select value={ticker} onValueChange={setTicker}>
                <SelectTrigger className="w-[180px] h-9 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {allTickers.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className="text-xs text-neutral-500">last updated {data.lastUpdated}</span>
            </div>

            <div className="flex items-center gap-2">
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

      {/* Main Content - Single Viewport */}
      <main className="p-6 max-w-[1400px] mx-auto">
        <div className="space-y-4">
          {/* Company Name Banner */}
          <div className="bg-neutral-900 text-white px-6 py-3 rounded">
            <h1 className="text-xl font-medium">{data.name}</h1>
          </div>

          {/* PERFORMANCE Section */}
          <div className="bg-white border border-neutral-200 rounded-lg">
            <div className="px-6 py-3 border-b border-neutral-200 bg-neutral-50">
              <h2 className="font-semibold text-neutral-900">PERFORMANCE</h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <p className="font-medium text-neutral-900">{data.performance.summary}</p>
                <p className="text-sm text-neutral-600 mt-1">{data.performance.description}</p>
              </div>

              {/* Performance Table */}
              <div className="border border-neutral-300 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-300">
                      <th className="px-4 py-2 text-left text-neutral-900 border-r border-neutral-300 w-1/4">Ticker</th>
                      <th className="px-4 py-2 text-center text-neutral-900 border-r border-neutral-300 w-1/4">1-month</th>
                      <th className="px-4 py-2 text-center text-neutral-900 border-r border-neutral-300 w-1/4">3-month</th>
                      <th className="px-4 py-2 text-center text-neutral-900 w-1/4">${ticker} performance vs:<br/>1Y High:</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-neutral-300">
                      <td className="px-4 py-2 font-medium text-neutral-900 border-r border-neutral-300">
                        ${ticker} ({data.name.split(' ')[0]})
                      </td>
                      <td className={`px-4 py-2 text-center border-r border-neutral-300 ${getPerformanceColor(data.performance.oneMonth)}`}>
                        {data.performance.oneMonth > 0 ? '+' : ''}{data.performance.oneMonth}%
                      </td>
                      <td className={`px-4 py-2 text-center border-r border-neutral-300 ${getPerformanceColor(data.performance.threeMonth)}`}>
                        {data.performance.threeMonth > 0 ? '+' : ''}{data.performance.threeMonth}%
                      </td>
                      <td className={`px-4 py-2 text-center ${getPerformanceColor(data.performance.vsHigh1Y)}`}>
                        {data.performance.vsHigh1Y > 0 ? '+' : ''}{data.performance.vsHigh1Y}%
                      </td>
                    </tr>
                    <tr className="border-b border-neutral-300">
                      <td className="px-4 py-2 text-neutral-700 border-r border-neutral-300">$SPY (S&P500)</td>
                      <td className={`px-4 py-2 text-center border-r border-neutral-300 ${getPerformanceColor(data.performance.benchmarks.spy.oneMonth)}`}>
                        {data.performance.benchmarks.spy.oneMonth}%
                      </td>
                      <td className={`px-4 py-2 text-center border-r border-neutral-300 ${getPerformanceColor(data.performance.benchmarks.spy.threeMonth)}`}>
                        {data.performance.benchmarks.spy.threeMonth}%
                      </td>
                      <td className="px-4 py-2 text-center text-neutral-700">
                        $SPY: {data.performance.vsSP500_Benchmark}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-neutral-700 border-r border-neutral-300">
                        ${data.performance.benchmarks.sector?.ticker || 'XLV'} ({data.performance.sectorInfo?.category || 'Healthcare'})
                      </td>
                      <td className={`px-4 py-2 text-center border-r border-neutral-300 ${getPerformanceColor(data.performance.benchmarks.sector?.oneMonth || data.performance.benchmarks[Object.keys(data.performance.benchmarks)[1]]?.oneMonth)}`}>
                        {data.performance.benchmarks.sector?.oneMonth || data.performance.benchmarks[Object.keys(data.performance.benchmarks)[1]]?.oneMonth}%
                      </td>
                      <td className={`px-4 py-2 text-center border-r border-neutral-300 ${getPerformanceColor(data.performance.benchmarks.sector?.threeMonth || data.performance.benchmarks[Object.keys(data.performance.benchmarks)[1]]?.threeMonth)}`}>
                        {data.performance.benchmarks.sector?.threeMonth || data.performance.benchmarks[Object.keys(data.performance.benchmarks)[1]]?.threeMonth}%
                      </td>
                      <td className={`px-4 py-2 text-center ${data.performance.vsBenchmark2 === 'Lagging' ? 'text-red-700' : 'text-green-700'}`}>
                        ${data.performance.benchmarks.sector?.ticker || Object.keys(data.performance.benchmarks)[1].toUpperCase()}: {data.performance.vsBenchmark2 || data.performance.vsXLV_Benchmark}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* DAILY CHART TREND Section */}
          <div className="bg-white border border-neutral-200 rounded-lg">
            <div className="px-6 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
              <h2 className="font-semibold text-neutral-900">DAILY CHART TREND</h2>
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
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Rating and Status */}
              <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
                <div className="flex items-center gap-3">
                  <div className="flex">
                    {renderStars(data.trend.rating)}
                  </div>
                  <span className="text-lg font-semibold text-neutral-900">| {data.trend.rating.toFixed(1)}</span>
                </div>
                <div className="text-right">
                  <p className="font-medium text-neutral-900">{data.trend.direction} | Outlook: {data.trend.outlook}</p>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-neutral-700 leading-relaxed bg-neutral-50 border border-neutral-200 rounded p-4">
                {data.trend.description}
              </p>

              {/* Two Column Layout */}
              <div className="grid grid-cols-2 gap-6">
                {/* Trend Signals */}
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-3 pb-2 border-b border-neutral-200">Trend Signals</h3>
                  <div className="space-y-2">
                    {data.trend.signals.map((signal: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-sm border-b border-neutral-100 pb-2 last:border-0">
                        <span className="text-neutral-700">{signal.label}</span>
                        <span className="flex items-center gap-1">
                          {typeof signal.value === 'number' ? (
                            <span className={signal.isNegative ? 'text-neutral-900' : 'text-green-700'}>
                              {signal.value}%
                            </span>
                          ) : (
                            <span className="text-neutral-900">{signal.value}</span>
                          )}
                          {signal.isNegative && typeof signal.value === 'number' && (
                            <span className="text-red-600 font-bold">✕</span>
                          )}
                          {signal.isNegative && typeof signal.value === 'string' && (
                            <span className="text-red-600 font-bold">✕</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Key Levels */}
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-3 pb-2 border-b border-neutral-200">Key Levels</h3>
                  <div className="space-y-2">
                    {data.trend.keyLevels.map((level: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-sm border-b border-neutral-100 pb-2 last:border-0">
                        <span className="text-neutral-700">{level.label}</span>
                        <span className="font-medium text-neutral-900">{level.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}