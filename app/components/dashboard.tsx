'use client';

import { useState, useEffect } from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import { StockTable } from './stock-table';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';

interface DashboardProps {
  userEmail: string;
  onSignOut: () => void;
}

interface UserPreferences {
  ticker: string;
  timeframe: string;
}

export function Dashboard({ userEmail, onSignOut }: DashboardProps) {
  const [ticker, setTicker] = useState('AAPL');
  const [timeframe, setTimeframe] = useState('Weekly');
  const [lastSynced, setLastSynced] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success'>('idle');

  // Load user preferences on mount
  useEffect(() => {
    const savedPrefs = localStorage.getItem('userPreferences');
    if (savedPrefs) {
      const prefs: UserPreferences = JSON.parse(savedPrefs);
      setTicker(prefs.ticker);
      setTimeframe(prefs.timeframe);
    }
    
    // Set initial last synced time
    const now = new Date();
    setLastSynced(formatDateTime(now));
  }, []);

  // Save preferences when they change
  useEffect(() => {
    const prefs: UserPreferences = { ticker, timeframe };
    localStorage.setItem('userPreferences', JSON.stringify(prefs));
    
    // Auto-sync when preferences change
    handleSync();
  }, [ticker, timeframe]);

  const formatDateTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncStatus('syncing');

    // Simulate sync process:
    // 1. Save selection to Supabase
    await new Promise(resolve => setTimeout(resolve, 400));
    
    // 2. Background sync applies to sheet control cells
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // 3. Google Sheets recalculates
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // 4. Fetch updated values + formatting
    await new Promise(resolve => setTimeout(resolve, 400));

    const now = new Date();
    setLastSynced(formatDateTime(now));
    setIsSyncing(false);
    setSyncStatus('success');

    // Reset success status after brief display
    setTimeout(() => setSyncStatus('idle'), 2000);
  };

  const handleRefresh = () => {
    handleSync();
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-neutral-900 mb-1">MyWeekly Stock</h1>
              <p className="text-sm text-neutral-600">Real-time sync with Google Sheets</p>
            </div>
            <Button
              onClick={onSignOut}
              variant="outline"
              size="sm"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-md">
              <span className="text-sm text-neutral-600">Email:</span>
              <span className="text-sm text-neutral-900">{userEmail}</span>
            </div>

            <Separator orientation="vertical" className="h-8" />

            <div className="space-y-1.5">
              <Label htmlFor="ticker" className="text-sm text-neutral-600">
                Ticker
              </Label>
              <Select value={ticker} onValueChange={setTicker}>
                <SelectTrigger id="ticker" className="w-[140px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AAPL">AAPL</SelectItem>
                  <SelectItem value="GOOGL">GOOGL</SelectItem>
                  <SelectItem value="MSFT">MSFT</SelectItem>
                  <SelectItem value="AMZN">AMZN</SelectItem>
                  <SelectItem value="TSLA">TSLA</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="timeframe" className="text-sm text-neutral-600">
                Timeframe
              </Label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger id="timeframe" className="w-[140px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Daily">Daily</SelectItem>
                  <SelectItem value="Weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleRefresh}
              disabled={isSyncing}
              className="mb-0.5"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Refresh'}
            </Button>
          </div>

          {/* Sync Status */}
          <div className="mt-4 flex items-center gap-2">
            {syncStatus === 'syncing' && (
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                Syncing with Google Sheets…
              </Badge>
            )}
            {syncStatus === 'success' && (
              <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
                Sync complete
              </Badge>
            )}
            {lastSynced && (
              <span className="text-xs text-neutral-500">
                Last synced: {lastSynced}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        <div className="bg-white border border-neutral-200 rounded-lg shadow-sm overflow-hidden">
          <StockTable 
            ticker={ticker} 
            timeframe={timeframe}
            isSyncing={isSyncing}
          />
        </div>
      </main>
    </div>
  );
}