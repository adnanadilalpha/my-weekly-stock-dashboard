'use client';

import { ChevronRight, RefreshCw } from 'lucide-react';
import { AppHeader } from './app-header';
import { useMomentumKpis } from '@/lib/hooks/useMomentumData';
import { formatRatioAsPct, formatTotalReturnPct } from '@/lib/momentum/formulas';
import type { AppMode, PortfolioPage } from '../types';

export interface MomentumPicksDashboardProps {
  userEmail: string;
  currentAppMode: AppMode;
  onGoToPortfolio: () => void;
  onGoToMyHoldings?: () => void;
  onGoToMWS: () => void;
  onSignOut: () => void;
  onSelectPortfolio: (page: PortfolioPage) => void;
}

export function MomentumPicksDashboard({
  userEmail,
  currentAppMode,
  onGoToPortfolio,
  onGoToMyHoldings,
  onGoToMWS,
  onSignOut,
  onSelectPortfolio,
}: MomentumPicksDashboardProps) {
  const { kpis, loading, error, refetch } = useMomentumKpis();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        userEmail={userEmail}
        currentAppMode={currentAppMode}
        onGoToPortfolio={onGoToPortfolio}
        onGoToMyHoldings={onGoToMyHoldings}
        onGoToMWS={onGoToMWS}
        onSignOut={onSignOut}
      />

      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              MWS Momentum Picks
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Performance + this week&apos;s three strategies
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm font-medium text-foreground hover:bg-muted/70"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: 'Total Return', value: loading ? '…' : formatTotalReturnPct(kpis.totalReturn, 0) },
            { label: 'CAGR', value: loading ? '…' : formatRatioAsPct(kpis.cagr, 1) },
            { label: 'Hit Rate', value: loading ? '…' : formatRatioAsPct(kpis.hitRate, 0) },
          ].map((k) => (
            <div
              key={k.label}
              className="rounded-3xl border border-border/80 bg-card px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                {k.label}
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground tabular-nums">
                {k.value}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onSelectPortfolio('current-week')}
            className="group flex items-center justify-between gap-3 rounded-3xl border border-border/80 bg-card px-5 py-5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:bg-muted/40"
          >
            <div>
              <div className="text-base font-semibold text-foreground">Current week&apos;s picks</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {kpis.latestWeek != null
                  ? `Week ${kpis.latestWeek + 1} · 3 strategies`
                  : 'This week · 3 strategies'}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>

          <button
            type="button"
            onClick={() => onSelectPortfolio('track-record')}
            className="group flex items-center justify-between gap-3 rounded-3xl border border-border/80 bg-card px-5 py-5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:bg-muted/40"
          >
            <div>
              <div className="text-base font-semibold text-foreground">Track record</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Full history · Download CSV
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </main>
    </div>
  );
}
