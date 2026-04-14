'use client';

import { FileText, BarChart3, TrendingUp, LayoutDashboard, Layers, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { TickerIcon } from './ui/ticker-icon';
import { AppHeader } from './app-header';
import type { PageView } from '../types';
import type { AppMode } from '../types';
import { useState } from 'react';

interface IndexPageProps {
  userEmail: string;
  onSignOut: () => void;
  onNavigate: (page: PageView, ticker?: string) => void;
  currentAppMode: AppMode;
  onGoToPortfolio: () => void;
  onGoToMWS: () => void;
}

const SEGMENTS = [
  'S&P500', 'Nasdaq', 'Small Caps', 'Treasuries', 'US Dollar fund',
  'Gold', 'Silver', 'Bitcoin', 'Ethereum', 'Oil'
];

const SECTORS = [
  'Technology', 'Telecommunication Services', 'Semiconductors',
  'Consumer Cyclicals', 'Financials', 'Industrials', 'Energy',
  'Materials', 'Real Estate', 'Utilities', 'Healthcare', 'Consumer Defensive'
];

const LARGE_CAPS = [
  'Nvidia', 'Microsoft', 'Apple', 'Alphabet', 'Amazon',
  'Meta', 'Tesla', 'JPMorgan', 'Walmart', 'Eli Lilly',
  'Broadcom', 'Cisco Systems', 'McDonald\'s', 'Visa', 'Wells Fargo',
  'Citigroup', 'Oracle', 'Morgan Stanley', 'Applovin', 'Mastercard',
  'Coca-Cola Company', 'Intuitive Surgical', 'Exxon Mobil', 'Goldman Sachs', 'Linde',
  'Johnson & Johnson', 'Caterpillar', 'Intel', 'Palantir', 'International Business Machines',
  'Disney', 'Netflix', 'Merck', 'Qualcomm', 'Bank of America',
  'American Express', 'PepsiCo', 'Costco', 'Lam Research', 'Blackstone',
  'Micron', 'Salesforce', 'Amgen', 'Home Depot', 'RTX Corporation',
  'Charles Schwab', 'GE Aerospace', 'Thermo Fisher Scientific', 'Intuit', 'Advanced Micro Devices',
  'Applied Materials', 'GE Vernova', 'Procter & Gamble', 'Abbott Laboratories', 'Uber',
  'Chevron', 'T-Mobile US', 'Boeing', 'UnitedHealth Group', 'Shopify'
];

// Mapping of display names to ticker symbols
const TICKER_MAP: Record<string, string> = {
  'S&P500': 'SPY',
  'Nasdaq': 'QQQ',
  'Small Caps': 'IWM',
  'Treasuries': 'TLT',
  'US Dollar fund': 'UUP',
  'Gold': 'GLD',
  'Silver': 'SLV',
  'Bitcoin': 'IBIT',
  'Ethereum': 'ETHA',
  'Oil': 'USO',
  'Technology': 'XLK',
  'Telecommunication Services': 'XLC',
  'Semiconductors': 'SMH',
  'Consumer Cyclicals': 'XLY',
  'Financials': 'XLF',
  'Industrials': 'XLI',
  'Energy': 'XLE',
  'Materials': 'XLB',
  'Real Estate': 'XLRE',
  'Utilities': 'XLU',
  'Healthcare': 'XLV',
  'Consumer Defensive': 'XLP',
  'Nvidia': 'NVDA',
  'Microsoft': 'MSFT',
  'Apple': 'AAPL',
  'Alphabet': 'GOOG',
  'Amazon': 'AMZN',
  'Meta': 'META',
  'Tesla': 'TSLA',
  'JPMorgan': 'JPM',
  'Walmart': 'WMT',
  'Eli Lilly': 'LLY',
  'Broadcom': 'AVGO',
  'Cisco Systems': 'CSCO',
  'McDonald\'s': 'MCD',
  'Visa': 'V',
  'Wells Fargo': 'WFC',
  'Citigroup': 'C',
  'Oracle': 'ORCL',
  'Morgan Stanley': 'MS',
  'Applovin': 'APP',
  'Mastercard': 'MA',
  'Coca-Cola Company': 'KO',
  'Intuitive Surgical': 'ISRG',
  'Exxon Mobil': 'XOM',
  'Goldman Sachs': 'GS',
  'Linde': 'LIN',
  'Johnson & Johnson': 'JNJ',
  'Caterpillar': 'CAT',
  'Intel': 'INTC',
  'Palantir': 'PLTR',
  'International Business Machines': 'IBM',
  'Disney': 'DIS',
  'Netflix': 'NFLX',
  'Merck': 'MRK',
  'Qualcomm': 'QCOM',
  'Bank of America': 'BAC',
  'American Express': 'AXP',
  'PepsiCo': 'PEP',
  'Costco': 'COST',
  'Lam Research': 'LRCX',
  'Blackstone': 'BX',
  'Micron': 'MU',
  'Salesforce': 'CRM',
  'Amgen': 'AMGN',
  'Home Depot': 'HD',
  'RTX Corporation': 'RTX',
  'Charles Schwab': 'SCHW',
  'GE Aerospace': 'GE',
  'Thermo Fisher Scientific': 'TMO',
  'Intuit': 'INTU',
  'Advanced Micro Devices': 'AMD',
  'Applied Materials': 'AMAT',
  'GE Vernova': 'GEV',
  'Procter & Gamble': 'PG',
  'Abbott Laboratories': 'ABT',
  'Uber': 'UBER',
  'Chevron': 'CVX',
  'T-Mobile US': 'TMUS',
  'Boeing': 'BA',
  'UnitedHealth Group': 'UNH',
  'Shopify': 'SHOP',
};

export function IndexPage({ userEmail, onSignOut, onNavigate, currentAppMode, onGoToPortfolio, onGoToMWS }: IndexPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ name: string; ticker: string }>>([]);

  const searchableItems = [...SEGMENTS, ...SECTORS, ...LARGE_CAPS].map((name) => ({
    name,
    ticker: TICKER_MAP[name] || name,
  }));

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      setSearchResults([]);
      return;
    }
    const normalizedQuery = query.trim().toLowerCase();
    const results = searchableItems.filter((item) =>
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.ticker.toLowerCase().includes(normalizedQuery)
    );
    setSearchResults(results);
  };

  const handleSelectResult = (ticker: string) => {
    onNavigate('ticker-analysis', ticker);
    setSearchQuery('');
    setSearchResults([]);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        userEmail={userEmail}
        currentAppMode={currentAppMode}
        onGoToPortfolio={onGoToPortfolio}
        onGoToMWS={onGoToMWS}
        onSignOut={onSignOut}
      />
      <main className="p-4 sm:p-6 max-w-[1220px] mx-auto space-y-5 sm:space-y-6">
        <div>
          <h1 className="text-neutral-900 text-lg sm:text-xl">MWS&apos;s Momentum Pulse Check</h1>
          <p className="text-xs sm:text-sm text-neutral-600 mt-0.5">Market Analysis Dashboard</p>
        </div>
        {/* Global Search */}
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search all tickers, segments, sectors, and large caps..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-3 sm:py-4 bg-white border border-slate-300 rounded-xl focus:border-slate-900 focus:outline-none focus:ring-0 transition-colors text-sm sm:text-base text-slate-900 placeholder:text-slate-400"
            />
          </div>
          
          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-full mt-2 w-full bg-white border border-slate-200 rounded-xl max-h-64 sm:max-h-96 overflow-y-auto z-50">
              <div className="p-2">
                <div className="text-xs text-neutral-500 px-2 sm:px-3 py-1.5 sm:py-2 font-medium">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                </div>
                {searchResults.map((result, idx) => (
                  (() => {
                    const resultTicker = result.ticker;
                    return (
                  <button
                    key={idx}
                    onClick={() => handleSelectResult(resultTicker)}
                    className="w-full text-left px-2 sm:px-3 py-2 sm:py-2.5 hover:bg-neutral-100 rounded transition-colors flex items-center justify-between group"
                  >
                    <span className="text-xs sm:text-sm text-neutral-900 font-medium truncate pr-2 flex items-center gap-2">
                      <TickerIcon ticker={resultTicker} size={14} />
                      <span className="truncate">{result.name}</span>
                      <span className="text-neutral-500">{resultTicker}</span>
                    </span>
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-1 transition-all flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                    );
                  })()
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          <button
            onClick={() => onNavigate('readme')}
            className="group flex items-start gap-3 sm:gap-4 p-4 sm:p-5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors text-left cursor-pointer"
          >
            <div className="p-2 sm:p-3 bg-neutral-100 rounded-lg group-hover:bg-neutral-900 transition-colors flex-shrink-0">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-700 group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm sm:text-base text-neutral-900 mb-1 group-hover:text-neutral-900">Read Me</div>
              <div className="text-xs sm:text-sm text-neutral-600 group-hover:text-neutral-700">
                1-page explanation of the Pulse Check tool
              </div>
            </div>
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-1 transition-all mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <button
            onClick={() => onNavigate('ticker-analysis')}
            className="group flex items-start gap-3 sm:gap-4 p-4 sm:p-5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors text-left cursor-pointer"
          >
            <div className="p-2 sm:p-3 bg-neutral-100 rounded-lg group-hover:bg-neutral-900 transition-colors flex-shrink-0">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-700 group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm sm:text-base text-neutral-900 mb-1 group-hover:text-neutral-900">On-Demand Pulse Check</div>
              <div className="text-xs sm:text-sm text-neutral-600 group-hover:text-neutral-700">
              Pull up the detailed Momentum Pulse. Heck for one the 70+ ticker covered in the app.
              </div>
            </div>
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-1 transition-all mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <button
            onClick={() => onNavigate('dashboard')}
            className="group flex items-start gap-3 sm:gap-4 p-4 sm:p-5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors text-left cursor-pointer"
          >
            <div className="p-2 sm:p-3 bg-neutral-100 rounded-lg group-hover:bg-neutral-900 transition-colors flex-shrink-0">
              <LayoutDashboard className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-700 group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm sm:text-base text-neutral-900 mb-1 group-hover:text-neutral-900">Dashboard</div>
              <div className="text-xs sm:text-sm text-neutral-600 group-hover:text-neutral-700">
                Summary Performance / Trend across Market Segments and Sectors
              </div>
            </div>
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-1 transition-all mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Two Column Layout for Desktop, Stacked for Mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* SEGMENT Ticker Pages */}
          <Card className="border-slate-200 shadow-none">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-neutral-700" />
                <CardTitle className="text-neutral-900">SEGMENT Ticker Page</CardTitle>
                <Badge variant="secondary" className="ml-auto">{SEGMENTS.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SEGMENTS.map((segment) => (
                  <Button
                    key={segment}
                    variant="outline"
                    className="justify-start h-auto py-2 text-xs sm:text-sm hover:bg-neutral-100 hover:border-neutral-400"
                    onClick={() => onNavigate('ticker-analysis', TICKER_MAP[segment])}
                  >
                    <span className="flex items-center gap-2">
                      <TickerIcon ticker={TICKER_MAP[segment]} size={14} />
                      <span>{segment}</span>
                    </span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* SECTOR Ticker Pages */}
          <Card className="border-slate-200 shadow-none">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-neutral-700" />
                <CardTitle className="text-neutral-900">SECTOR Ticker Pages</CardTitle>
                <Badge variant="secondary" className="ml-auto">{SECTORS.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SECTORS.map((sector) => (
                  <Button
                    key={sector}
                    variant="outline"
                    className="justify-start h-auto py-2 px-3 text-xs sm:text-sm hover:bg-neutral-100 hover:border-neutral-400 text-left whitespace-normal leading-tight"
                    onClick={() => onNavigate('ticker-analysis', TICKER_MAP[sector])}
                  >
                    <span className="block w-full overflow-wrap-anywhere">
                      <span className="inline-flex items-center gap-2">
                        <TickerIcon ticker={TICKER_MAP[sector]} size={14} />
                        <span>{sector}</span>
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>

        {/* LARGE CAPS Ticker Pages - Full Width */}
        <Card className="border-slate-200 shadow-none">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-neutral-700" />
              <CardTitle className="text-neutral-900">LARGE CAPS Ticker Pages</CardTitle>
              <Badge variant="secondary" className="ml-auto">{LARGE_CAPS.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2 max-h-[600px] overflow-y-auto">
              {LARGE_CAPS.map((stock) => (
                <Button
                  key={stock}
                  variant="outline"
                  className="justify-start h-auto py-2 px-2 sm:px-3 text-xs sm:text-sm hover:bg-neutral-100 hover:border-neutral-400 text-left whitespace-normal leading-tight"
                  onClick={() => onNavigate('ticker-analysis', TICKER_MAP[stock])}
                >
                  <span className="block w-full overflow-wrap-anywhere">
                    <span className="inline-flex items-center gap-2">
                      <TickerIcon ticker={TICKER_MAP[stock]} size={14} />
                      <span>{stock}</span>
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}