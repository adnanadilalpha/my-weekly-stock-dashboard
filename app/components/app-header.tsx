'use client';

import { LogOut, LayoutDashboard, PieChart } from 'lucide-react';
import { Button } from './ui/button';
import type { AppMode } from '../types';

export interface AppHeaderProps {
  userEmail: string;
  currentAppMode: AppMode;
  onGoToPortfolio: () => void;
  onGoToMWS: () => void;
  onSignOut: () => void;
  /** Optional: show a back button that calls this (e.g. back to portfolio dashboard or MWS index) */
  onBack?: () => void;
  backLabel?: string;
}

export function AppHeader({
  userEmail,
  currentAppMode,
  onGoToPortfolio,
  onGoToMWS,
  onSignOut,
  onBack,
  backLabel = 'Back',
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="w-full px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Left: nav pills */}
          <nav className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 p-1">
            <button
              type="button"
              onClick={onGoToPortfolio}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                currentAppMode === 'portfolio'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <PieChart className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Portfolio</span>
            </button>
            <button
              type="button"
              onClick={onGoToMWS}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                currentAppMode === 'mws'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">MWS Dashboard</span>
            </button>
          </nav>

          {/* Right: email + sign out (pushed to far right) */}
          <div className="ml-auto flex items-center gap-3 sm:gap-5">
            <div className="hidden text-right sm:block">
              <p className="text-xs text-muted-foreground">Signed in as</p>
              <p className="max-w-[240px] truncate text-xs font-medium text-foreground">{userEmail}</p>
            </div>
            <Button onClick={onSignOut} variant="outline" size="sm" className="h-9 rounded-lg">
              <LogOut className="mr-1.5 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
