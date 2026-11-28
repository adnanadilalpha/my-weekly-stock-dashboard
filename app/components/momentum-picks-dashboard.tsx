'use client';

import { ChevronRight, RefreshCw } from 'lucide-react';
import { AppHeader } from './app-header';
import {
  useMomentumCurrentWeek,
  useMomentumKpis,
  useMomentumTrackRecord,
} from '@/lib/hooks/useMomentumData';
import { formatRatioAsPct, formatTotalReturnPct } from '@/lib/momentum/formulas';
import {
  DirBadge,
  ReturnPct,
  TotalReturnPct,
  formatWeekStartDisplay,
} from '@/lib/momentum/display';
import { MOMENTUM_STRATEGIES } from '@/lib/momentum/types';
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
  const { kpis, loading: kpisLoading, error: kpisError, refetch: refetchKpis } = useMomentumKpis();
  const {
    week,
    loading: weekLoading,
    error: weekError,
    refetch: refetchWeek,
  } = useMomentumCurrentWeek();
  const {
    weeks,
    loading: trackLoading,
    error: trackError,
    refetch: refetchTrack,
  } = useMomentumTrackRecord();

  const loading = kpisLoading || weekLoading || trackLoading;
  const error = kpisError || weekError || trackError;
  const recentWeeks = weeks.slice(0, 5);
  const strategyLabel = (id: string) => MOMENTUM_STRATEGIES.find((s) => s.id === id)?.label ?? id;

  const refetchAll = () => {
    void refetchKpis();
    void refetchWeek();
    void refetchTrack();
  };

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
            <h1 className="text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-[1.45rem] md:text-[1.75rem]">
              MWS Momentum Picks
            </h1>
            <p className="mt-1 text-xs leading-snug text-muted-foreground sm:text-[13px]">
              Performance + this week&apos;s three strategies
            </p>
          </div>
          <button
            type="button"
            onClick={refetchAll}
            disabled={loading}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50 sm:text-[13px]"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              label: 'Total Return',
              value: kpisLoading ? '…' : formatTotalReturnPct(kpis.totalReturn, 0),
              accent: true,
            },
            { label: 'CAGR', value: kpisLoading ? '…' : formatRatioAsPct(kpis.cagr, 1), accent: false },
            { label: 'Hit Rate', value: kpisLoading ? '…' : formatRatioAsPct(kpis.hitRate, 0), accent: false },
          ].map((k) => (
            <div
              key={k.label}
              className="flex min-h-[102px] flex-col justify-between rounded-xl border border-border bg-card p-3.5 shadow-sm sm:p-4"
            >
              <div className="text-[11px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
                {k.label}
              </div>
              <div
                className={`mt-1.5 font-sans text-[1.125rem] font-semibold leading-none tracking-tight sm:text-[1.25rem] md:text-[1.375rem] ${
                  k.accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                }`}
              >
                {k.value}
              </div>
            </div>
          ))}
        </div>

        {/* Current week preview */}
        <button
          type="button"
          onClick={() => onSelectPortfolio('current-week')}
          className="group mt-6 w-full overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-colors hover:bg-muted/30 sm:rounded-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Current week&apos;s picks</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {week
                  ? `Year ${week.year} · Week ${week.week} · Start ${formatWeekStartDisplay(week.weekStart)}`
                  : 'This week · 3 strategies'}
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
              View full
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>

          <div className="divide-y divide-border">
            {weekLoading && !week ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>
            ) : !week || week.picks.every((p) => !p.ticker) ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                No picks set for the current week yet.
              </div>
            ) : (
              week.picks.map((p) => (
                <div
                  key={p.strategy}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid sm:grid-cols-[7rem_4.5rem_auto_1fr_auto_auto] sm:items-center"
                >
                  <span className="text-[12px] font-medium text-muted-foreground">
                    {strategyLabel(p.strategy)}
                  </span>
                  <span className="text-[14px] font-semibold tracking-tight text-foreground">
                    {p.ticker || '—'}
                  </span>
                  <DirBadge direction={p.direction} />
                  <span className="font-mono text-[12px] tabular-nums text-muted-foreground sm:justify-self-end">
                    Open {p.weekOpen == null ? '—' : p.weekOpen.toFixed(2)}
                  </span>
                  <ReturnPct value={p.return5d} pill />
                  <ReturnPct value={p.returnStopLoss} pill />
                </div>
              ))
            )}
          </div>
        </button>

        {/* Track record preview */}
        <button
          type="button"
          onClick={() => onSelectPortfolio('track-record')}
          className="group mt-4 w-full overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-colors hover:bg-muted/30 sm:rounded-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Track record</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Latest weeks{weeks.length ? ` · ${weeks.length} total` : ''} · Download CSV in full view
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
              View full
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-separate border-spacing-0 text-left text-[12px]">
              <thead>
                <tr>
                  {['Year', 'Week', 'Start', 'Dow', 'Large Cap', 'Nasdaq', 'Avg Stop', 'Cum Stop'].map(
                    (h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap border-b border-border px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground sm:px-4"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {trackLoading && recentWeeks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-sm text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : recentWeeks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-sm text-muted-foreground">
                      No closed weeks yet.
                    </td>
                  </tr>
                ) : (
                  recentWeeks.map((w) => (
                    <tr
                      key={w.id}
                      className="[&>td]:border-b [&>td]:border-border [&:last-child>td]:border-b-0"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 sm:px-4">{w.year}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 sm:px-4">{w.week}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-muted-foreground sm:px-4">
                        {formatWeekStartDisplay(w.weekStart)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold sm:px-4">
                        {w.pick1Ticker ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold sm:px-4">
                        {w.pick2Ticker ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold sm:px-4">
                        {w.pick3Ticker ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 sm:px-4">
                        <ReturnPct value={w.weeklyAvgStopLoss} pill />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 sm:px-4">
                        <TotalReturnPct value={w.cumulativeStopLoss} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </button>
      </main>
    </div>
  );
}
