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
    <header className="bg-white border-b border-neutral-200 shadow-sm sticky top-0 z-10">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 w-full sm:w-auto">
            {onBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="flex-shrink-0"
              >
                <span className="sr-only">{backLabel}</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Button>
            )}
            <nav className="flex items-center gap-1 rounded-lg bg-neutral-100 p-1">
              <button
                type="button"
                onClick={onGoToPortfolio}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentAppMode === 'portfolio'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <PieChart className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">Portfolio</span>
              </button>
              <button
                type="button"
                onClick={onGoToMWS}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentAppMode === 'mws'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">MWS Dashboard</span>
              </button>
            </nav>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
            <div className="text-left sm:text-right">
              <p className="text-xs text-neutral-500">Signed in as</p>
              <p className="text-xs sm:text-sm text-neutral-900 break-all sm:break-normal">{userEmail}</p>
            </div>
            <Button onClick={onSignOut} variant="outline" size="sm" className="w-full sm:w-auto">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
