'use client';

import { ChevronRight, RefreshCw } from 'lucide-react';
import { AppHeader } from './app-header';
import {
  useMomentumCurrentWeek,
  useMomentumKpis,
  useMomentumTrackRecord,
} from '@/lib/hooks/useMomentumData';
import {
  formatRatioAsPct,
  formatTotalReturnPct,
  stopLossDollars,
  takeProfitDollars,
} from '@/lib/momentum/formulas';
import {
  DirBadge,
  ReturnPct,
  TotalReturnPct,
  formatWeekStartDisplay,
} from '@/lib/momentum/display';
import { MOMENTUM_STRATEGIES } from '@/lib/momentum/types';
import type { AppMode, PortfolioPage } from '../types';

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const th =
  'whitespace-nowrap border-b border-border bg-muted/40 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground sm:px-3.5';
const td =
  'whitespace-nowrap border-b border-border px-3 py-2.5 align-middle text-[12px] sm:px-3.5 sm:py-3';

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

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
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

        {/* Current week — full table on home (only 3 rows; no separate "view full") */}
        <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:rounded-2xl">
          <div className="border-b border-border bg-muted/40 px-4 py-3">
            <div className="text-sm font-semibold text-foreground">Current week&apos;s picks</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {week
                ? `Year ${week.year} · Week ${week.week} · Start ${formatWeekStartDisplay(week.weekStart)}`
                : 'This week · 3 strategies'}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  {[
                    'Strategy',
                    'Pick',
                    'Direction',
                    'Week Open',
                    'Stop-loss (%)',
                    'Take Profit (%)',
                    'Stop-loss ($)',
                    'Take Profit',
                    'Current Price',
                    'Return 5-d',
                    'Return with Stop/Loss',
                    'Comments',
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekLoading && !week ? (
                  <tr>
                    <td className={`${td} text-muted-foreground`} colSpan={12}>
                      Loading…
                    </td>
                  </tr>
                ) : !week || week.picks.every((p) => !p.ticker) ? (
                  <tr>
                    <td className={`${td} text-muted-foreground`} colSpan={12}>
                      No picks set for the current week yet.
                    </td>
                  </tr>
                ) : (
                  week.picks.map((p) => {
                    const stop$ = stopLossDollars(p.weekOpen, p.stopLossPct, p.direction || null);
                    const tp$ = takeProfitDollars(p.weekOpen, p.takeProfitPct, p.direction || null);
                    return (
                      <tr
                        key={p.strategy}
                        className="[&:last-child>td]:border-b-0"
                      >
                        <td className={`${td} font-medium text-muted-foreground`}>
                          {strategyLabel(p.strategy)}
                        </td>
                        <td className={`${td} font-semibold tracking-tight`}>{p.ticker || '—'}</td>
                        <td className={td}>
                          <DirBadge direction={p.direction} />
                        </td>
                        <td className={`${td} font-mono tabular-nums`}>{money(p.weekOpen)}</td>
                        <td className={`${td} font-mono tabular-nums`}>
                          {formatRatioAsPct(p.stopLossPct, 1)}
                        </td>
                        <td className={`${td} font-mono tabular-nums`}>
                          {formatRatioAsPct(p.takeProfitPct, 1)}
                        </td>
                        <td className={`${td} font-mono tabular-nums text-muted-foreground`}>
                          {money(stop$)}
                        </td>
                        <td className={`${td} font-mono tabular-nums text-muted-foreground`}>
                          {money(tp$)}
                        </td>
                        <td className={`${td} font-mono font-semibold tabular-nums`}>
                          {money(p.currentPrice)}
                        </td>
                        <td className={td}>
                          <ReturnPct value={p.return5d} pill />
                        </td>
                        <td className={td}>
                          <ReturnPct value={p.returnStopLoss} pill />
                        </td>
                        <td className={`${td} max-w-48 truncate text-muted-foreground`}>
                          {p.comments || '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Track record — preview only; full history + CSV on separate page */}
        <button
          type="button"
          onClick={() => onSelectPortfolio('track-record')}
          className="group mt-4 w-full overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-colors hover:bg-muted/30 sm:rounded-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Track record</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Latest 5 weeks{weeks.length ? ` · ${weeks.length} total` : ''} · full history + CSV
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
              Open full history
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-separate border-spacing-0 text-left text-[12px]">
              <thead>
                <tr>
                  {['Year', 'Week', 'Start', 'Dow', 'Large Cap', 'Nasdaq', 'Avg Stop', 'Cum Stop'].map(
                    (h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {trackLoading && recentWeeks.length === 0 ? (
                  <tr>
                    <td className={`${td} text-muted-foreground`} colSpan={8}>
                      Loading…
                    </td>
                  </tr>
                ) : recentWeeks.length === 0 ? (
                  <tr>
                    <td className={`${td} text-muted-foreground`} colSpan={8}>
                      No closed weeks yet.
                    </td>
                  </tr>
                ) : (
                  recentWeeks.map((w) => (
                    <tr key={w.id} className="[&:last-child>td]:border-b-0">
                      <td className={td}>{w.year}</td>
                      <td className={td}>{w.week}</td>
                      <td className={`${td} font-mono tabular-nums text-muted-foreground`}>
                        {formatWeekStartDisplay(w.weekStart)}
                      </td>
                      <td className={`${td} font-semibold`}>{w.pick1Ticker ?? '—'}</td>
                      <td className={`${td} font-semibold`}>{w.pick2Ticker ?? '—'}</td>
                      <td className={`${td} font-semibold`}>{w.pick3Ticker ?? '—'}</td>
                      <td className={td}>
                        <ReturnPct value={w.weeklyAvgStopLoss} pill />
                      </td>
                      <td className={td}>
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
