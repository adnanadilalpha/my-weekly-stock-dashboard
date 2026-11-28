'use client';

import type { ReactNode } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { AppHeader } from './app-header';
import { useMomentumCurrentWeek } from '@/lib/hooks/useMomentumData';
import { MOMENTUM_STRATEGIES } from '@/lib/momentum/types';
import type { MomentumCurrentPick } from '@/lib/momentum/types';
import { formatRatioAsPct, stopLossDollars, takeProfitDollars } from '@/lib/momentum/formulas';
import { DirBadge, ReturnPct, formatWeekStartDisplay } from '@/lib/momentum/display';
import type { AppMode } from '../types';

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Field({
  label,
  children,
  emphasize = false,
}: {
  label: string;
  children: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className={`mt-1 ${emphasize ? 'text-sm font-semibold text-foreground' : 'text-[13px] text-foreground'}`}>
        {children}
      </div>
    </div>
  );
}

function PickCard({
  pick,
  strategyLabel,
}: {
  pick: MomentumCurrentPick;
  strategyLabel: string;
}) {
  const stop$ = stopLossDollars(pick.weekOpen, pick.stopLossPct, pick.direction || null);
  const tp$ = takeProfitDollars(pick.weekOpen, pick.takeProfitPct, pick.direction || null);

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-slate-800 px-4 py-3 text-white">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-300">
            {strategyLabel}
          </div>
          <div className="mt-0.5 truncate font-sans text-lg font-semibold tracking-tight">
            {pick.ticker || '—'}
          </div>
        </div>
        <div className="shrink-0 [&_span]:bg-white/12 [&_span]:text-white">
          <DirBadge direction={pick.direction} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:grid-cols-4">
        <Field label="Week Open" emphasize>
          <span className="font-mono tabular-nums">{money(pick.weekOpen)}</span>
        </Field>
        <Field label="Current Price" emphasize>
          <span className="font-mono tabular-nums">{money(pick.currentPrice)}</span>
        </Field>
        <Field label="Return 5-d">
          <ReturnPct value={pick.return5d} pill />
        </Field>
        <Field label="Return with Stop/Loss">
          <ReturnPct value={pick.returnStopLoss} pill />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border bg-muted/25 px-4 py-3.5 sm:grid-cols-4">
        <Field label="Stop-loss (%)">
          <span className="font-mono text-[13px] font-semibold tabular-nums">
            {formatRatioAsPct(pick.stopLossPct, 1)}
          </span>
        </Field>
        <Field label="Take Profit (%)">
          <span className="font-mono text-[13px] font-semibold tabular-nums">
            {formatRatioAsPct(pick.takeProfitPct, 1)}
          </span>
        </Field>
        <Field label="Stop-loss ($)">
          <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{money(stop$)}</span>
        </Field>
        <Field label="Take Profit ($)">
          <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{money(tp$)}</span>
        </Field>
      </div>

      {pick.comments ? (
        <div className="border-t border-border px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Comments
          </div>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{pick.comments}</p>
        </div>
      ) : null}
    </article>
  );
}

export interface MomentumCurrentWeekPageProps {
  userEmail: string;
  currentAppMode: AppMode;
  onGoToPortfolio: () => void;
  onGoToMyHoldings?: () => void;
  onGoToMWS: () => void;
  onSignOut: () => void;
  onBack: () => void;
}

export function MomentumCurrentWeekPage({
  userEmail,
  currentAppMode,
  onGoToPortfolio,
  onGoToMyHoldings,
  onGoToMWS,
  onSignOut,
  onBack,
}: MomentumCurrentWeekPageProps) {
  const { week, loading, error, refetch } = useMomentumCurrentWeek();
  const label = (id: string) => MOMENTUM_STRATEGIES.find((s) => s.id === id)?.label ?? id;

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

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Portfolio
            </button>
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Current week&apos;s picks
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Three strategies · same levels as the Current Week sheet
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refetch()}
            disabled={loading}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {week ? (
          <div className="mb-5 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-[12px] font-medium text-foreground">
              Year {week.year}
            </span>
            <span className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-[12px] font-medium text-foreground">
              Week {week.week}
            </span>
            <span className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-[12px] font-medium text-foreground">
              Start {formatWeekStartDisplay(week.weekStart)}
            </span>
            <span
              className={`inline-flex items-center rounded-md px-2.5 py-1 text-[12px] font-semibold capitalize ${
                week.status === 'open'
                  ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {week.status}
            </span>
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {loading && !week ? (
          <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            Loading this week&apos;s picks…
          </div>
        ) : !week ? (
          <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            No current week yet.
          </div>
        ) : (
          <>
            {/* Mobile / tablet: one card per strategy */}
            <div className="grid gap-4 lg:hidden">
              {week.picks.map((p) => (
                <PickCard key={p.strategy} pick={p} strategyLabel={label(p.strategy)} />
              ))}
            </div>

            {/* Desktop: full table, grouped columns, sticky pick */}
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-max border-separate border-spacing-0 text-left text-[13px]">
                  <thead>
                    <tr>
                      <th
                        colSpan={3}
                        className="border-b border-white/10 bg-slate-800 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-200"
                      >
                        Pick
                      </th>
                      <th
                        colSpan={4}
                        className="border-b border-white/10 bg-slate-800 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-200"
                      >
                        Levels
                      </th>
                      <th
                        colSpan={3}
                        className="border-b border-white/10 bg-slate-800 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-200"
                      >
                        Performance
                      </th>
                      <th
                        colSpan={1}
                        className="border-b border-white/10 bg-slate-800 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-200"
                      >
                        Notes
                      </th>
                    </tr>
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
                        <th
                          key={h}
                          className="whitespace-nowrap border-b border-border bg-slate-50 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-600 dark:bg-slate-900/60 dark:text-slate-300"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {week.picks.map((p) => {
                      const stop$ = stopLossDollars(p.weekOpen, p.stopLossPct, p.direction || null);
                      const tp$ = takeProfitDollars(p.weekOpen, p.takeProfitPct, p.direction || null);
                      return (
                        <tr
                          key={p.strategy}
                          className="transition-colors hover:bg-muted/35 [&>td]:border-b [&>td]:border-border [&:last-child>td]:border-b-0"
                        >
                          <td className="whitespace-nowrap px-3 py-3.5 font-medium text-muted-foreground">
                            {label(p.strategy)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 text-[15px] font-semibold tracking-tight">
                            {p.ticker || '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5">
                            <DirBadge direction={p.direction} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 font-mono tabular-nums">
                            {money(p.weekOpen)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 font-mono text-[12px] font-semibold tabular-nums">
                            {formatRatioAsPct(p.stopLossPct, 1)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 font-mono text-[12px] font-semibold tabular-nums">
                            {formatRatioAsPct(p.takeProfitPct, 1)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 font-mono tabular-nums text-muted-foreground">
                            {money(stop$)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 font-mono tabular-nums text-muted-foreground">
                            {money(tp$)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5 font-mono font-semibold tabular-nums">
                            {money(p.currentPrice)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5">
                            <ReturnPct value={p.return5d} pill />
                          </td>
                          <td className="whitespace-nowrap px-3 py-3.5">
                            <ReturnPct value={p.returnStopLoss} pill />
                          </td>
                          <td className="max-w-52 truncate px-3 py-3.5 text-[12px] text-muted-foreground">
                            {p.comments || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
