'use client';

import { Download } from 'lucide-react';
import { AppHeader } from './app-header';
import { useMomentumTrackRecord } from '@/lib/hooks/useMomentumData';
import { downloadTrackRecordCsv, formatPickCell } from '@/lib/momentum/csv';
import { formatRatioAsPct, formatTotalReturnPct } from '@/lib/momentum/formulas';
import type { AppMode } from '../types';

export interface MomentumTrackRecordPageProps {
  userEmail: string;
  currentAppMode: AppMode;
  onGoToPortfolio: () => void;
  onGoToMyHoldings?: () => void;
  onGoToMWS: () => void;
  onSignOut: () => void;
  onBack: () => void;
}

export function MomentumTrackRecordPage({
  userEmail,
  currentAppMode,
  onGoToPortfolio,
  onGoToMyHoldings,
  onGoToMWS,
  onSignOut,
  onBack,
}: MomentumTrackRecordPageProps) {
  const { weeks, loading, error } = useMomentumTrackRecord();

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Track record</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Full closed-week history{weeks.length ? ` · ${weeks.length} weeks` : ''}
            </p>
          </div>
          <button
            type="button"
            disabled={weeks.length === 0}
            onClick={() => downloadTrackRecordCsv(weeks)}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm font-medium text-foreground hover:bg-muted/70 disabled:opacity-50"
          >
            <Download className="h-4 w-4 text-muted-foreground" />
            Download CSV
          </button>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="mt-6 overflow-x-auto rounded-3xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <table className="w-full min-w-200 border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border/80 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                {['Year', 'Week', 'Start', 'Pick 1', 'Pick 2', 'Pick 3', 'Avg Stop', 'Cum Stop'].map(
                  (h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3.5">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {loading && weeks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : weeks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-muted-foreground">
                    No track record yet.
                  </td>
                </tr>
              ) : (
                weeks.map((w) => (
                  <tr key={w.id} className="border-b border-border/50">
                    <td className="px-4 py-3.5">{w.year}</td>
                    <td className="px-4 py-3.5">{w.week}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">{w.weekStart}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {formatPickCell(w.pick1Ticker, w.pick1Direction, w.pick1Return5d, w.pick1ReturnStopLoss)}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {formatPickCell(w.pick2Ticker, w.pick2Direction, w.pick2Return5d, w.pick2ReturnStopLoss)}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {formatPickCell(w.pick3Ticker, w.pick3Direction, w.pick3Return5d, w.pick3ReturnStopLoss)}
                    </td>
                    <td className="px-4 py-3.5 tabular-nums">{formatRatioAsPct(w.weeklyAvgStopLoss, 2)}</td>
                    <td className="px-4 py-3.5 tabular-nums font-medium">
                      {formatTotalReturnPct(w.cumulativeStopLoss, 1)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
