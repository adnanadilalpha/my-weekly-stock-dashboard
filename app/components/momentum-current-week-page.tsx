'use client';

import { AppHeader } from './app-header';
import { useMomentumCurrentWeek } from '@/lib/hooks/useMomentumData';
import { MOMENTUM_STRATEGIES } from '@/lib/momentum/types';
import {
  formatRatioAsPct,
  stopLossDollars,
  takeProfitDollars,
} from '@/lib/momentum/formulas';
import type { AppMode } from '../types';

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
  const { week, loading, error } = useMomentumCurrentWeek();
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
        onBack={onBack}
        backLabel="Back"
      />

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Current week&apos;s picks</h1>
        {week ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Year {week.year} · Week {week.week} · Start {week.weekStart} · Status{' '}
            {week.status === 'open' ? 'Open' : 'Closed'}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">This week&apos;s three strategies</p>
        )}

        {error ? (
          <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="mt-6 overflow-x-auto rounded-3xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <table className="w-full min-w-220 border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border/80 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                {[
                  'Strategy',
                  'Pick',
                  'Dir',
                  'Open',
                  'Stop %',
                  'TP %',
                  'Stop $',
                  'TP $',
                  'Price',
                  'Ret 5d',
                  'w/ Stop',
                  'Comments',
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !week ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : !week ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-muted-foreground">
                    No current week yet.
                  </td>
                </tr>
              ) : (
                week.picks.map((p) => {
                  const stop$ = stopLossDollars(p.weekOpen, p.stopLossPct, p.direction || null);
                  const tp$ = takeProfitDollars(p.weekOpen, p.takeProfitPct, p.direction || null);
                  return (
                    <tr key={p.strategy} className="border-b border-border/50">
                      <td className="px-4 py-3.5 font-medium">{label(p.strategy)}</td>
                      <td className="px-4 py-3.5">{p.ticker || '—'}</td>
                      <td className="px-4 py-3.5 capitalize">{p.direction || '—'}</td>
                      <td className="px-4 py-3.5 tabular-nums">{p.weekOpen ?? '—'}</td>
                      <td className="px-4 py-3.5 tabular-nums">{formatRatioAsPct(p.stopLossPct, 1)}</td>
                      <td className="px-4 py-3.5 tabular-nums">{formatRatioAsPct(p.takeProfitPct, 1)}</td>
                      <td className="px-4 py-3.5 tabular-nums text-muted-foreground">
                        {stop$ == null ? '—' : stop$.toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-muted-foreground">
                        {tp$ == null ? '—' : tp$.toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">{p.currentPrice ?? '—'}</td>
                      <td className="px-4 py-3.5 tabular-nums">{formatRatioAsPct(p.return5d, 2)}</td>
                      <td className="px-4 py-3.5 tabular-nums">{formatRatioAsPct(p.returnStopLoss, 2)}</td>
                      <td className="max-w-48 truncate px-4 py-3.5 text-muted-foreground">
                        {p.comments || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
