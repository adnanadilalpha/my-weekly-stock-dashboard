'use client';

import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Star, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { AppHeader } from './app-header';
import type { PageView } from '../types';
import type { AppMode } from '../types';
import { useTickerData } from '../../lib/hooks/useTickerData';
import { getTickerData } from '../../lib/queries/ticker';

interface TickerAnalysisPageProps {
  userEmail: string;
  onSignOut: () => void;
  onNavigate: (page: PageView) => void;
  initialTicker: string;
  currentAppMode: AppMode;
  onGoToPortfolio: () => void;
  onGoToMWS: () => void;
}

// All available tickers organized by category
const MARKET_SEGMENTS = ['SPY', 'QQQ', 'IWM', 'TLT', 'UUP', 'GLD', 'SLV', 'IBIT', 'ETHA', 'USO'];
const SECTORS = ['XLK', 'XLC', 'SMH', 'XLY', 'XLF', 'XLI', 'XLE', 'XLB', 'XLRE', 'XLU', 'XLV', 'XLP'];
const LARGE_CAPS = ['NVDA', 'MSFT', 'AAPL', 'GOOG', 'AMZN', 'META', 'TSLA', 'JPM', 'WMT', 'LLY', 'AVGO', 'CSCO', 'MCD', 'V', 'WFC', 'C', 'ORCL', 'MS', 'APP', 'MA', 'KO', 'ISRG', 'XOM', 'GS', 'LIN', 'JNJ', 'CAT', 'INTC', 'PLTR', 'IBM', 'DIS', 'NFLX', 'MRK', 'QCOM', 'BAC', 'AXP', 'PEP', 'COST', 'LRCX', 'BX', 'MU', 'CRM', 'AMGN', 'HD', 'RTX', 'SCHW', 'GE', 'TMO', 'INTU', 'AMD', 'AMAT', 'GEV', 'PG', 'ABT', 'UBER', 'CVX', 'TMUS', 'BA', 'UNH', 'SHOP'];

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
  // Large Caps
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
  'AVGO': 'Broadcom Inc.',
  'CSCO': 'Cisco Systems Inc.',
  'MCD': 'McDonald\'s Corporation',
  'V': 'Visa Inc.',
  'WFC': 'Wells Fargo & Company',
  'C': 'Citigroup Inc.',
  'ORCL': 'Oracle Corporation',
  'MS': 'Morgan Stanley',
  'APP': 'Applovin Corporation',
  'MA': 'Mastercard Incorporated',
  'KO': 'The Coca-Cola Company',
  'ISRG': 'Intuitive Surgical Inc.',
  'XOM': 'Exxon Mobil Corporation',
  'GS': 'The Goldman Sachs Group Inc.',
  'LIN': 'Linde plc',
  'JNJ': 'Johnson & Johnson',
  'CAT': 'Caterpillar Inc.',
  'INTC': 'Intel Corporation',
  'PLTR': 'Palantir Technologies Inc.',
  'IBM': 'International Business Machines Corporation',
  'DIS': 'The Walt Disney Company',
  'NFLX': 'Netflix Inc.',
  'MRK': 'Merck & Co. Inc.',
  'QCOM': 'Qualcomm Incorporated',
  'BAC': 'Bank of America Corp.',
  'AXP': 'American Express Company',
  'PEP': 'PepsiCo Inc.',
  'COST': 'Costco Wholesale Corporation',
  'LRCX': 'Lam Research Corporation',
  'BX': 'Blackstone Inc.',
  'MU': 'Micron Technology Inc.',
  'CRM': 'Salesforce Inc.',
  'AMGN': 'Amgen Inc.',
  'HD': 'The Home Depot Inc.',
  'RTX': 'RTX Corporation',
  'SCHW': 'The Charles Schwab Corporation',
  'GE': 'GE Aerospace',
  'TMO': 'Thermo Fisher Scientific Inc.',
  'INTU': 'Intuit Inc.',
  'AMD': 'Advanced Micro Devices Inc.',
  'AMAT': 'Applied Materials Inc.',
  'GEV': 'GE Vernova',
  'PG': 'The Procter & Gamble Company',
  'ABT': 'Abbott Laboratories',
  'UBER': 'Uber Technologies Inc.',
  'CVX': 'Chevron Corporation',
  'TMUS': 'T-Mobile US Inc.',
  'BA': 'The Boeing Company',
  'UNH': 'UnitedHealth Group Incorporated',
  'SHOP': 'Shopify Inc.',
};

// Helper function to extract benchmark ticker from comparison text
// Examples: "$QQQ: In line" → "QQQ", "$SPY Energy Sector: In line" → "SPY Energy Sector"
function extractBenchmarkTicker(comparisonText: string | null | undefined): string | null {
  if (!comparisonText) return null;
  
  // Match pattern like "$QQQ: In line" or "$SPY Energy Sector: In line"
  const match = comparisonText.match(/^\$?([^:]+):/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

// Helper function to get benchmark name from ticker data (for display)
function getBenchmarkNameFromData(data: any, type: string | null): string {
  if (!data) return 'N/A';
  
  if (type === 'segment') {
    return data.name || 'N/A';
  } else if (type === 'sector') {
    return data.sector_name || 'N/A';
  } else if (type === 'mega_cap' || type === 'other_stock') {
    return data.company_name || 'N/A';
  }
  
  return 'N/A';
}


export function TickerAnalysisPage({ userEmail, onSignOut, onNavigate, initialTicker, currentAppMode, onGoToPortfolio, onGoToMWS }: TickerAnalysisPageProps) {
  const [ticker, setTicker] = useState(initialTicker);

  // Fetch data from Supabase
  const { data: supabaseData, type, loading, error, refetch } = useTickerData(ticker);

  // Fetch benchmark data (First benchmark from daily_vs_spy_comparison and second benchmark)
  const [firstBenchmarkData, setFirstBenchmarkData] = useState<any>(null);
  const [firstBenchmarkTicker, setFirstBenchmarkTicker] = useState<string | null>(null);
  const [firstBenchmarkName, setFirstBenchmarkName] = useState<string>('N/A');
  const [sectorBenchmarkData, setSectorBenchmarkData] = useState<any>(null);
  const [benchmarkTicker, setBenchmarkTicker] = useState<string | null>(null);
  const [benchmarkName, setBenchmarkName] = useState<string>('N/A');
  const [benchmarksLoading, setBenchmarksLoading] = useState(false);

  // All available tickers for the dropdown
  const allTickers = [...MARKET_SEGMENTS, ...SECTORS, ...LARGE_CAPS].sort();

  const handleRefresh = async () => {
    await refetch();
    await fetchBenchmarkData();
  };

  // Fetch benchmark data based on comparison text from Supabase
  const fetchBenchmarkData = async () => {
    if (!supabaseData) return;
    
    setBenchmarksLoading(true);
    try {
      // Extract first benchmark ticker from daily_vs_spy_comparison (row 12)
      const vsSpyComparison = (supabaseData as any).daily_vs_spy_comparison;
      const firstExtractedTicker = extractBenchmarkTicker(vsSpyComparison);
      setFirstBenchmarkTicker(firstExtractedTicker);
      
      // Fetch first benchmark data
      if (firstExtractedTicker) {
        // Handle cases like "SPY Energy Sector" - try to extract just the ticker part
        const tickerMatch = firstExtractedTicker.match(/^([A-Z]{2,5})\s/);
        const actualFirstTicker = tickerMatch ? tickerMatch[1] : firstExtractedTicker;
        
        const firstResult = await getTickerData(actualFirstTicker);
        if (firstResult.data) {
          setFirstBenchmarkData(firstResult.data);
          const firstName = getBenchmarkNameFromData(firstResult.data, firstResult.type);
          setFirstBenchmarkName(firstName);
        } else {
          setFirstBenchmarkData(null);
          setFirstBenchmarkName(firstExtractedTicker);
        }
      } else {
        setFirstBenchmarkData(null);
        setFirstBenchmarkName('N/A');
      }
      
      // Extract second benchmark ticker from comparison text (row 13)
      const vsBenchmarkComparison = type === 'mega_cap' 
        ? (supabaseData as any).daily_vs_sector_comparison 
        : (supabaseData as any).daily_vs_benchmark_comparison;
      
      const extractedTicker = extractBenchmarkTicker(vsBenchmarkComparison);
      setBenchmarkTicker(extractedTicker);
      
      // Fetch second benchmark if found
      if (extractedTicker) {
        // Handle cases like "SPY Energy Sector" - try to extract just the ticker part
        const tickerMatch = extractedTicker.match(/^([A-Z]{2,5})\s/);
        const actualTicker = tickerMatch ? tickerMatch[1] : extractedTicker;
        
        const sectorResult = await getTickerData(actualTicker);
        if (sectorResult.data) {
          setSectorBenchmarkData(sectorResult.data);
          // Get benchmark name for display from fetched data
          const name = getBenchmarkNameFromData(sectorResult.data, sectorResult.type);
          setBenchmarkName(name);
        } else {
          setSectorBenchmarkData(null);
          // If ticker not found, use the full extracted text (e.g., "SPY Energy Sector")
          setBenchmarkName(extractedTicker);
        }
      } else {
        setSectorBenchmarkData(null);
        setBenchmarkName('N/A');
      }
    } catch (err) {
      console.error('Error fetching benchmark data:', err);
    } finally {
      setBenchmarksLoading(false);
    }
  };

  // Fetch benchmark data when ticker or supabaseData changes
  useEffect(() => {
    if (supabaseData) {
      fetchBenchmarkData();
    }
  }, [ticker, supabaseData]);

  // Helper function to transform trend data
  const transformTrendData = (isDaily: boolean) => {
    if (!supabaseData) return null;

    const trendScore = isDaily ? supabaseData.daily_trend_score : supabaseData.weekly_trend_score;
    const trendRating = isDaily ? supabaseData.daily_rating : supabaseData.weekly_rating;
    const trendOutlook = isDaily ? supabaseData.daily_outlook : supabaseData.weekly_outlook;
    const trendDescription = isDaily ? supabaseData.daily_trend_description : supabaseData.weekly_trend_description;

    // Trend signals
    const priceVs9Ema = isDaily ? supabaseData.daily_price_vs_9ema : supabaseData.weekly_price_vs_9ema;
    const priceVs21Ema = isDaily ? supabaseData.daily_price_vs_21ema : (supabaseData as any).weekly_price_vs_30ema;
    const ema9Vs21Ema = isDaily ? supabaseData.daily_ema9_vs_21ema : (supabaseData as any).weekly_ema9_vs_30ema;
    const slope9Ema = isDaily ? supabaseData.daily_slope_9ema : supabaseData.weekly_slope_9ema;
    const slope21Ema = isDaily ? supabaseData.daily_slope_21ema : (supabaseData as any).weekly_slope_30ema;
    
    // Trend signal icons (from column D in sheets) - stored as strings (emojis like ❌, ✅, ⚪️)
    const priceVs9EmaIcon = isDaily ? supabaseData.daily_price_vs_9ema_icon : supabaseData.weekly_price_vs_9ema_icon;
    const priceVs21EmaIcon = isDaily ? supabaseData.daily_price_vs_21ema_icon : supabaseData.weekly_price_vs_30ema_icon;
    const ema9Vs21EmaIcon = isDaily ? supabaseData.daily_ema9_vs_21ema_icon : supabaseData.weekly_ema9_vs_30ema_icon;
    const slope9EmaIcon = isDaily ? supabaseData.daily_slope_9ema_icon : supabaseData.weekly_slope_9ema_icon;
    const slope21EmaIcon = isDaily ? supabaseData.daily_slope_21ema_icon : supabaseData.weekly_slope_30ema_icon;

    // Key levels
    const currentPrice = isDaily ? supabaseData.daily_current_price : supabaseData.weekly_current_price;
    const ema9 = isDaily ? supabaseData.daily_ema_9 : supabaseData.weekly_ema_9;
    const ema21 = isDaily ? supabaseData.daily_ema_21 : (supabaseData as any).weekly_ema_30;
    const monthHigh = isDaily ? supabaseData.daily_month_high : supabaseData.weekly_month_high;
    const monthLow = isDaily ? supabaseData.daily_month_low : supabaseData.weekly_month_low;

    return {
      rating: trendScore ?? 0,
      direction: trendRating || 'N/A',
      outlook: trendOutlook || 'N/A',
      description: trendDescription || 'N/A',
      signals: [
        { label: isDaily ? 'Price vs 9-day EMA' : 'Price vs 9-week EMA', value: priceVs9Ema ?? 0, isNegative: (priceVs9Ema ?? 0) < 0, icon: priceVs9EmaIcon || null },
        { label: isDaily ? 'Price vs 21-day EMA' : 'Price vs 30-week EMA', value: priceVs21Ema ?? 0, isNegative: (priceVs21Ema ?? 0) < 0, icon: priceVs21EmaIcon || null },
        { label: isDaily ? '9-day EMA vs. 21-day EMA' : '9-week EMA vs. 30-week EMA', value: ema9Vs21Ema ?? 0, isNegative: (ema9Vs21Ema ?? 0) < 0, icon: ema9Vs21EmaIcon || null },
        { label: isDaily ? 'Slope 9-day EMA' : 'Slope 9-week EMA', value: slope9Ema || 'N/A', isNegative: slope9Ema === 'Falling', icon: slope9EmaIcon || null },
        { label: isDaily ? 'Slope 21-day EMA' : 'Slope 30-week EMA', value: slope21Ema || 'N/A', isNegative: slope21Ema === 'Falling', icon: slope21EmaIcon || null },
      ],
      keyLevels: [
        { label: 'Current Price', value: currentPrice?.toFixed(2) || 'N/A' },
        { label: isDaily ? '9-day EMA' : '9-week EMA', value: ema9?.toFixed(2) || 'N/A' },
        { label: isDaily ? '21-day EMA' : '30-week EMA', value: ema21?.toFixed(2) || 'N/A' },
        { label: isDaily ? '1-month High' : '3-month High', value: monthHigh?.toFixed(2) || 'N/A' },
        { label: isDaily ? '1-month Low' : '3-month Low', value: monthLow?.toFixed(2) || 'N/A' },
      ]
    };
  };

  // Transform Supabase data to expected format
  const data = useMemo(() => {
    if (!supabaseData) return null;
    
    // Get name based on type
    let name = '';
    if (type === 'segment') {
      name = (supabaseData as any).name || TICKER_NAMES[ticker] || ticker;
    } else if (type === 'sector') {
      name = (supabaseData as any).sector_name || TICKER_NAMES[ticker] || ticker;
    } else if (type === 'mega_cap' || type === 'other_stock') {
      name = (supabaseData as any).company_name || TICKER_NAMES[ticker] || ticker;
    }

    // Format last updated date and time in human-readable format (user's local timezone)
    const lastUpdated = supabaseData.updated_at 
      ? new Date(supabaseData.updated_at).toLocaleString('en-US', { 
          month: 'long', 
          day: 'numeric', 
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      : 'N/A';

    // PERFORMANCE DATA - Use new simplified fields with fallback to old fields
    const perf1M = (supabaseData as any)['1m_percent'] ?? supabaseData.daily_1m_percent;
    const perf3M = (supabaseData as any)['3m_percent'] ?? supabaseData.daily_3m_percent;
    const vsHigh1Y = (supabaseData as any)['vs_1y_high'] ?? supabaseData.daily_vs_1y_high;
    const perfSummary = supabaseData.daily_performance_summary;
    const perfDescription = supabaseData.daily_performance_description;
    const vsSpyComparison = supabaseData.daily_vs_spy_comparison;
    const vsBenchmarkComparison = type === 'mega_cap' 
      ? (supabaseData as any).daily_vs_sector_comparison 
      : (supabaseData as any).daily_vs_benchmark_comparison;

    return {
      name,
      lastUpdated,
      performance: {
        summary: perfSummary || 'N/A',
        description: perfDescription || 'N/A',
        oneMonth: perf1M ?? 0,
        threeMonth: perf3M ?? 0,
        vsHigh1Y: vsHigh1Y ?? 0,
        performanceStrength: (supabaseData as any)['performance_strength'] ?? supabaseData.daily_performance_strength ?? null,
        distanceToHighs: (supabaseData as any)['distance_to_highs'] ?? supabaseData.daily_distance_to_highs ?? null,
        price1M: supabaseData.price_1m ?? null,
        price3M: supabaseData.price_3m ?? null,
        spyPrice1M: supabaseData.spy_price_1m ?? null,
        spyPrice3M: supabaseData.spy_price_3m ?? null,
        sectorPrice1M: type === 'mega_cap' ? (supabaseData as any).sector_price_1m ?? null : null,
        sectorPrice3M: type === 'mega_cap' ? (supabaseData as any).sector_price_3m ?? null : null,
        vsSP500_Benchmark: vsSpyComparison || 'N/A',
        vsBenchmark2: vsBenchmarkComparison || 'N/A',
        benchmarks: {
          first: {
            ticker: (supabaseData as any).first_benchmark_ticker ?? (firstBenchmarkTicker || 'N/A'),
            name: firstBenchmarkName,
            oneMonth: (supabaseData as any).first_benchmark_1m_percent ?? firstBenchmarkData?.daily_1m_percent ?? (firstBenchmarkData as any)?.['1m_percent'] ?? 0,
            threeMonth: (supabaseData as any).first_benchmark_3m_percent ?? firstBenchmarkData?.daily_3m_percent ?? (firstBenchmarkData as any)?.['3m_percent'] ?? 0
          },
          sector: { 
            ticker: (supabaseData as any).second_benchmark_ticker ?? (benchmarkTicker || 'N/A'),
            name: benchmarkName,
            oneMonth: (supabaseData as any).second_benchmark_1m_percent ?? sectorBenchmarkData?.daily_1m_percent ?? (sectorBenchmarkData as any)?.['1m_percent'] ?? 0,
            threeMonth: (supabaseData as any).second_benchmark_3m_percent ?? sectorBenchmarkData?.daily_3m_percent ?? (sectorBenchmarkData as any)?.['3m_percent'] ?? 0
          }
        }
      },
      dailyTrend: transformTrendData(true),
      weeklyTrend: transformTrendData(false)
    };
  }, [supabaseData, ticker, type, firstBenchmarkData, firstBenchmarkTicker, firstBenchmarkName, sectorBenchmarkData, benchmarkTicker, benchmarkName]);

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

  // Helper function to get comparison icon and text
  const getComparisonIcon = (comparisonText: string | null | undefined) => {
    if (!comparisonText || comparisonText === 'N/A') return { icon: null, text: comparisonText || 'N/A' };
    
    // Extract the comparison status (Leading, In line, Lagging)
    const leadingMatch = comparisonText.match(/Leading/i);
    const inLineMatch = comparisonText.match(/In line/i);
    const laggingMatch = comparisonText.match(/Lagging/i);
    
    if (leadingMatch) {
      return { icon: '✅', text: comparisonText };
    } else if (inLineMatch) {
      return { icon: '⚪️', text: comparisonText };
    } else if (laggingMatch) {
      return { icon: '❌', text: comparisonText };
    }
    
    return { icon: null, text: comparisonText };
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

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-neutral-500" />
          <p className="text-neutral-600">Loading data from Supabase...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
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
        <main className="p-6">
          <h1 className="font-semibold text-neutral-900 mb-4">Error Loading Ticker</h1>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center gap-2 text-red-800 mb-2">
              <AlertCircle className="w-5 h-5" />
              <h3 className="font-semibold">Error loading data</h3>
            </div>
            <p className="text-red-700 text-sm mb-4">
              {error ? error.message : `Ticker "${ticker}" not found in Supabase`}
            </p>
            <Button onClick={handleRefresh} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </main>
      </div>
    );
  }

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
      <main className="p-4 sm:p-6 max-w-[1400px] mx-auto">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Select value={ticker} onValueChange={setTicker}>
              <SelectTrigger className="w-full sm:w-[180px] h-9 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {allTickers.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-neutral-500 hidden sm:inline whitespace-nowrap">last updated {data.lastUpdated}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 sm:hidden flex-1">last updated {data.lastUpdated}</span>
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
        <div className="space-y-3 sm:space-y-4">
          {/* Company Name Banner */}
          <div className="bg-neutral-900 text-white px-4 sm:px-6 py-2 sm:py-3 rounded">
            <h1 className="text-lg sm:text-xl font-medium truncate">{data.name}</h1>
          </div>

          {/* PERFORMANCE Section */}
          <div className="bg-white border border-neutral-200 rounded-lg">
            <div className="px-4 sm:px-6 py-2 sm:py-3 border-b border-neutral-200 bg-neutral-50">
              <h2 className="font-semibold text-sm sm:text-base text-neutral-900">PERFORMANCE</h2>
            </div>
            <div className="px-4 sm:px-6 py-3 sm:py-4 space-y-3">
              <div>
                <p className="font-medium text-sm sm:text-base text-neutral-900">{data.performance.summary}</p>
                <p className="text-xs sm:text-sm text-neutral-600 mt-1">{data.performance.description}</p>
              </div>

              {/* Performance Table */}
              <div className="border border-neutral-300 rounded overflow-x-auto">
                <table className="w-full text-xs sm:text-sm min-w-[600px]">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-300">
                      <th className="px-2 sm:px-4 py-2 text-left text-neutral-900 border-r border-neutral-300 w-1/4">Ticker</th>
                      <th className="px-2 sm:px-4 py-2 text-center text-neutral-900 border-r border-neutral-300 w-1/4">1-month</th>
                      <th className="px-2 sm:px-4 py-2 text-center text-neutral-900 border-r border-neutral-300 w-1/4">3-month</th>
                      <th className="px-2 sm:px-4 py-2 text-center text-neutral-900 w-1/4">${ticker} performance vs:</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-neutral-300">
                      <td className="px-2 sm:px-4 py-2 font-medium text-neutral-900 border-r border-neutral-300">
                        ${ticker} ({data.name.split(' ')[0]})
                      </td>
                      <td className="px-2 sm:px-4 py-2 border-r border-neutral-300">
                        <div className="flex items-center">
                          <div className="w-4 sm:w-5 flex items-center justify-start flex-shrink-0">{getPerformanceIcon(data.performance.oneMonth)}</div>
                          <div className="flex-1 text-center tabular-nums">{data.performance.oneMonth > 0 ? '+' : ''}{data.performance.oneMonth}%</div>
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-2 border-r border-neutral-300">
                        <div className="flex items-center">
                          <div className="w-4 sm:w-5 flex items-center justify-start flex-shrink-0">{getPerformanceIcon(data.performance.threeMonth)}</div>
                          <div className="flex-1 text-center tabular-nums">{data.performance.threeMonth > 0 ? '+' : ''}{data.performance.threeMonth}%</div>
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-2">
                        <div className="flex items-center">
                          <div className="w-4 sm:w-5 flex items-center justify-start flex-shrink-0">{getVsHighIcon(data.performance.vsHigh1Y)}</div>
                          <div className="flex-1 text-center tabular-nums">
                            <span className="text-xs text-neutral-600">1Y High:</span> {data.performance.vsHigh1Y > 0 ? '+' : ''}{data.performance.vsHigh1Y}%
                          </div>
                        </div>
                      </td>
                    </tr>
                    <tr className="border-b border-neutral-300">
                      <td className="px-2 sm:px-4 py-2 text-neutral-700 border-r border-neutral-300 truncate">
                        {(supabaseData as any).first_benchmark_name || `$${data.performance.benchmarks.first?.ticker || 'N/A'}`}
                      </td>
                      <td className="px-2 sm:px-4 py-2 border-r border-neutral-300">
                        <div className="flex items-center">
                          <div className="w-4 sm:w-5 flex items-center justify-start flex-shrink-0">{getPerformanceIcon(data.performance.benchmarks.first?.oneMonth || 0)}</div>
                          <div className="flex-1 text-center tabular-nums">{(data.performance.benchmarks.first?.oneMonth || 0) > 0 ? '+' : ''}{data.performance.benchmarks.first?.oneMonth || 0}%</div>
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-2 border-r border-neutral-300">
                        <div className="flex items-center">
                          <div className="w-4 sm:w-5 flex items-center justify-start flex-shrink-0">{getPerformanceIcon(data.performance.benchmarks.first?.threeMonth || 0)}</div>
                          <div className="flex-1 text-center tabular-nums">{(data.performance.benchmarks.first?.threeMonth || 0) > 0 ? '+' : ''}{data.performance.benchmarks.first?.threeMonth || 0}%</div>
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-2">
                        {(() => {
                          const comparison = getComparisonIcon(data.performance.vsSP500_Benchmark);
                          return (
                            <div className="flex items-center">
                              <div className="w-4 sm:w-5 flex items-center justify-start flex-shrink-0">{comparison.icon || ''}</div>
                              <div className="flex-1 text-center text-xs sm:text-sm text-neutral-700">{comparison.text}</div>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-2 sm:px-4 py-2 text-neutral-700 border-r border-neutral-300 truncate">
                        {(supabaseData as any).second_benchmark_name || `$${data.performance.benchmarks.sector?.ticker || 'N/A'}`}
                      </td>
                      <td className="px-2 sm:px-4 py-2 border-r border-neutral-300">
                        <div className="flex items-center">
                          <div className="w-4 sm:w-5 flex items-center justify-start flex-shrink-0">{getPerformanceIcon(data.performance.benchmarks.sector?.oneMonth || 0)}</div>
                          <div className="flex-1 text-center tabular-nums">{(data.performance.benchmarks.sector?.oneMonth || 0) > 0 ? '+' : ''}{data.performance.benchmarks.sector?.oneMonth || 0}%</div>
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-2 border-r border-neutral-300">
                        <div className="flex items-center">
                          <div className="w-4 sm:w-5 flex items-center justify-start flex-shrink-0">{getPerformanceIcon(data.performance.benchmarks.sector?.threeMonth || 0)}</div>
                          <div className="flex-1 text-center tabular-nums">{(data.performance.benchmarks.sector?.threeMonth || 0) > 0 ? '+' : ''}{data.performance.benchmarks.sector?.threeMonth || 0}%</div>
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-2">
                        {(() => {
                          const comparison = getComparisonIcon(data.performance.vsBenchmark2);
                          return (
                            <div className="flex items-center">
                              <div className="w-4 sm:w-5 flex items-center justify-start flex-shrink-0">{comparison.icon || ''}</div>
                              <div className="flex-1 text-center text-xs sm:text-sm text-neutral-700">{comparison.text}</div>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Helper function to render trend section */}
          {(() => {
            const renderTrendSection = (title: string, trendData: any) => {
              if (!trendData) return null;
              
              return (
                <div className="bg-white border border-neutral-200 rounded-lg">
                  <div className="px-4 sm:px-6 py-2 sm:py-3 border-b border-neutral-200 bg-neutral-50">
                    <h2 className="font-semibold text-sm sm:text-base text-neutral-900">{title}</h2>
                  </div>
                  <div className="px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
                    {/* Rating and Status */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 pb-3 border-b border-neutral-200">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="flex">
                          {renderStars(trendData.rating)}
                        </div>
                        <span className="text-base sm:text-lg font-semibold text-neutral-900">| {typeof trendData.rating === 'number' ? trendData.rating.toFixed(1) : trendData.rating}</span>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-xs sm:text-sm font-medium text-neutral-900">{trendData.direction} | Outlook: {trendData.outlook}</p>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed bg-neutral-50 border border-neutral-200 rounded p-3 sm:p-4">
                      {trendData.description}
                    </p>

                    {/* Two Column Layout */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                      {/* Trend Signals */}
                      <div>
                        <h3 className="font-semibold text-sm sm:text-base text-neutral-900 mb-2 sm:mb-3 pb-2 border-b border-neutral-200">Trend Signals</h3>
                        <div className="space-y-2">
                          {trendData.signals.map((signal: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-xs sm:text-sm border-b border-neutral-100 pb-2 last:border-0">
                              <span className="text-neutral-700 pr-2">{signal.label}</span>
                              <span className="flex items-center gap-1 flex-shrink-0">
                                {typeof signal.value === 'number' && signal.value !== 0 ? (
                                  <span className="text-neutral-900">
                                    {typeof signal.value === 'number' ? signal.value.toFixed(1) : signal.value}%
                                  </span>
                                ) : typeof signal.value === 'number' ? (
                                  <span className="text-neutral-900">0%</span>
                                ) : (
                                  <span className="text-neutral-900">{signal.value}</span>
                                )}
                                {/* Use stored icon from sheet if available, otherwise fallback to generated icon */}
                                {signal.icon ? (
                                  <span>{signal.icon}</span>
                                ) : signal.isNegative && signal.value !== 'N/A' ? (
                                  <span className="text-red-600 font-bold">✕</span>
                                ) : null}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Key Levels */}
                      <div>
                        <h3 className="font-semibold text-sm sm:text-base text-neutral-900 mb-2 sm:mb-3 pb-2 border-b border-neutral-200">Key Levels</h3>
                        <div className="space-y-2">
                          {trendData.keyLevels.map((level: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-xs sm:text-sm border-b border-neutral-100 pb-2 last:border-0">
                              <span className="text-neutral-700 pr-2">{level.label}</span>
                              <span className="font-medium text-neutral-900 flex-shrink-0">{level.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            };

            return (
              <>
                {/* WEEKLY CHART TREND Section */}
                {renderTrendSection('WEEKLY CHART TREND', data.weeklyTrend)}
                
                {/* DAILY CHART TREND Section */}
                {renderTrendSection('DAILY CHART TREND', data.dailyTrend)}
              </>
            );
          })()}
        </div>
      </main>
    </div>
  );
}