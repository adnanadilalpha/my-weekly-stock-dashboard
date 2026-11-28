'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Radar, RefreshCw } from 'lucide-react';
import { AppHeader } from './app-header';
import { useMomentumTrackRecord } from '@/lib/hooks/useMomentumData';
import { downloadTrackRecordCsv } from '@/lib/momentum/csv';
import { formatRatioAsPct, formatTotalReturnPct } from '@/lib/momentum/formulas';
import type { MomentumTrackWeek } from '@/lib/momentum/types';
import type { AppMode } from '../types';

function formatWeekStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function pctTone(value: number | null | undefined): 'pos' | 'neg' | 'neu' {
  if (value == null || !Number.isFinite(value) || value === 0) return 'neu';
  return value > 0 ? 'pos' : 'neg';
}

function PctCell({ value, pill = false }: { value: number | null | undefined; pill?: boolean }) {
  const text = formatRatioAsPct(value, 1);
  const tone = pctTone(value);
  if (pill && tone !== 'neu') {
    return (
      <span
        className={`inline-flex rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums leading-tight sm:text-[11.5px] ${
          tone === 'pos'
            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
            : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
        }`}
      >
        {text}
      </span>
    );
  }
  const color =
    tone === 'pos'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'neg'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-foreground';
  return <span className={`font-mono text-[11px] font-semibold tabular-nums sm:text-[12px] ${color}`}>{text}</span>;
}

function CumCell({ value }: { value: number | null | undefined }) {
  const text = formatTotalReturnPct(value, 1);
  const tone = pctTone(value);
  const color =
    tone === 'pos'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'neg'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-foreground';
  return <span className={`font-mono text-[11px] font-semibold tabular-nums sm:text-[12px] ${color}`}>{text}</span>;
}

const GROUP_SEGMENTS = [
  { label: '', span: 3 },
  { label: 'Dow 30', span: 4 },
  { label: 'Large Cap', span: 4 },
  { label: 'Nasdaq', span: 4 },
  { label: 'Consolidated (5-D)', span: 4 },
] as const;

const COL_HEADERS = [
  'Year',
  'Week',
  'Week Start',
  'Pick',
  'Direction',
  'Return 5-d',
  'Return Stop/Loss',
  'Pick',
  'Direction',
  'Return 5-d',
  'Return Stop/Loss',
  'Pick',
  'Direction',
  'Return 5-d',
  'Return Stop/Loss',
  'Weekly Avg 5d',
  'Cumulative 5d',
  'Weekly Avg Stop-Loss',
  'Cumulative Stop-Loss',
] as const;

const td =
  'whitespace-nowrap bg-card px-2.5 py-2 align-middle font-sans text-[11px] sm:px-3 sm:py-2.5 sm:text-[12px]';

function TrackRow({ w }: { w: MomentumTrackWeek }) {
  return (
    <tr className="transition-colors hover:bg-muted/40 [&>td]:border-b [&>td]:border-border [&:last-child>td]:border-b-0">
      <td className={td}>{w.year}</td>
      <td className={td}>{w.week}</td>
      <td className={`${td} font-mono tabular-nums`}>{formatWeekStart(w.weekStart)}</td>

      <td className={td}>
        <span className="font-sans text-[11px] font-semibold tracking-tight text-foreground sm:text-[12px]">
          {w.pick1Ticker ?? '—'}
        </span>
      </td>
      <td className={td}>{w.pick1Direction ? w.pick1Direction[0].toUpperCase() + w.pick1Direction.slice(1) : '—'}</td>
      <td className={td}>
        <PctCell value={w.pick1Return5d} />
      </td>
      <td className={td}>
        <PctCell value={w.pick1ReturnStopLoss} />
      </td>

      <td className={td}>
        <span className="font-sans text-[11px] font-semibold tracking-tight text-foreground sm:text-[12px]">
          {w.pick2Ticker ?? '—'}
        </span>
      </td>
      <td className={td}>{w.pick2Direction ? w.pick2Direction[0].toUpperCase() + w.pick2Direction.slice(1) : '—'}</td>
      <td className={td}>
        <PctCell value={w.pick2Return5d} />
      </td>
      <td className={td}>
        <PctCell value={w.pick2ReturnStopLoss} />
      </td>

      <td className={td}>
        <span className="font-sans text-[11px] font-semibold tracking-tight text-foreground sm:text-[12px]">
          {w.pick3Ticker ?? '—'}
        </span>
      </td>
      <td className={td}>{w.pick3Direction ? w.pick3Direction[0].toUpperCase() + w.pick3Direction.slice(1) : '—'}</td>
      <td className={td}>
        <PctCell value={w.pick3Return5d} />
      </td>
      <td className={td}>
        <PctCell value={w.pick3ReturnStopLoss} />
      </td>

      <td className={td}>
        <PctCell value={w.weeklyAvg5d} pill />
      </td>
      <td className={td}>
        <CumCell value={w.cumulative5d} />
      </td>
      <td className={td}>
        <PctCell value={w.weeklyAvgStopLoss} pill />
      </td>
      <td className={td}>
        <CumCell value={w.cumulativeStopLoss} />
      </td>
    </tr>
  );
}

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
  const { weeks, loading, error, refetch } = useMomentumTrackRecord();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = useState({ canLeft: false, canRight: false });

  const updateScrollEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollEdges({
      canLeft: el.scrollLeft > 2,
      canRight: max > 2 && el.scrollLeft < max - 2,
    });
  }, []);

  useEffect(() => {
    updateScrollEdges();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollEdges, { passive: true });
    const ro = new ResizeObserver(updateScrollEdges);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollEdges);
      ro.disconnect();
    };
  }, [updateScrollEdges, weeks.length]);

  const scrollBy = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });
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

      <main className="mx-auto w-full max-w-[1600px] px-3 py-5 sm:px-5 sm:py-6 lg:px-8">
        <div className="mb-5 flex w-full min-w-0 flex-col items-stretch justify-between gap-3 sm:mb-6 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-[1.45rem] md:text-[1.75rem]">
              Track record
            </h1>
            <p className="mt-1 text-xs leading-snug text-muted-foreground sm:text-[13px]">
              Weekly log{weeks.length ? ` · ${weeks.length} weeks` : ''}
            </p>
          </div>
          <div className="flex w-full min-w-0 shrink-0 flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 sm:w-auto sm:justify-start sm:text-[13px]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Portfolio
            </button>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={loading}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50 sm:w-auto sm:justify-start sm:text-[13px]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              disabled={weeks.length === 0}
              onClick={() => downloadTrackRecordCsv(weeks)}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50 sm:w-auto sm:justify-start sm:text-[13px]"
            >
              <Download className="h-3.5 w-3.5" />
              Download CSV
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:rounded-2xl">
          <div className="border-b border-border bg-amber-50/70 px-3 py-2 text-[11px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200 sm:px-4 sm:text-xs">
            Note: Large Cap picks start in 2025 and Nasdaq picks start in 2026.
          </div>
          <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Radar className="h-[13px] w-[13px]" />
              </span>
              <span className="text-[11px] font-semibold uppercase leading-tight tracking-[0.08em] text-muted-foreground">
                Portfolio positions
              </span>
            </div>
            <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-border/70 pl-2 sm:ml-2 sm:pl-3">
              <button
                type="button"
                aria-label="Scroll table to the left"
                disabled={!scrollEdges.canLeft}
                onClick={() => scrollBy(-1)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Scroll table to the right"
                disabled={!scrollEdges.canRight}
                onClick={() => scrollBy(1)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="min-h-0 w-full max-w-full min-w-0 max-h-[min(70vh,640px)] flex-1 overflow-x-auto overflow-y-auto overscroll-x-contain bg-card [-webkit-overflow-scrolling:touch] sm:max-h-[min(75vh,720px)]"
          >
            <table className="w-full min-w-max border-separate border-spacing-0 text-left text-[11px] leading-snug text-foreground antialiased sm:text-[12px]">
              <thead>
                <tr>
                  {GROUP_SEGMENTS.map((seg, idx) => (
                    <th
                      key={`g-${idx}`}
                      colSpan={seg.span}
                      className="sticky top-0 z-20 whitespace-nowrap border-b border-border bg-blue-900 px-2.5 py-1.5 text-center text-[10px] font-semibold uppercase leading-tight tracking-[0.05em] text-blue-50 shadow-sm sm:px-3 sm:text-[10.5px]"
                    >
                      <div className="flex items-center justify-center whitespace-nowrap">
                        {seg.label || '\u00a0'}
                      </div>
                    </th>
                  ))}
                </tr>
                <tr>
                  {COL_HEADERS.map((label, i) => (
                    <th
                      key={`${label}-${i}`}
                      className="sticky top-[30px] z-20 whitespace-nowrap border-b border-border bg-card px-2.5 py-2.5 text-left text-[10px] font-semibold uppercase leading-tight tracking-[0.05em] text-muted-foreground shadow-sm sm:px-3 sm:py-3 sm:text-[10.5px]"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && weeks.length === 0 ? (
                  <tr>
                    <td className={`${td} text-muted-foreground`} colSpan={19}>
                      Loading…
                    </td>
                  </tr>
                ) : weeks.length === 0 ? (
                  <tr>
                    <td className={`${td} text-muted-foreground`} colSpan={19}>
                      No track record yet.
                    </td>
                  </tr>
                ) : (
                  weeks.map((w) => <TrackRow key={w.id} w={w} />)
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
