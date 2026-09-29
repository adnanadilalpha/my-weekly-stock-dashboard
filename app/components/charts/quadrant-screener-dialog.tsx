'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, Search } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { RelativeStrengthScatter } from './relative-strength-scatter';
import { fetchUniverseRelativeStrength } from '@/lib/hooks/useRelativeStrength';
import type { RelativeStrengthPoint } from '@/lib/relative-strength';
import { QUADRANT_COLORS, QUADRANT_COPY, toChartPoints } from '@/lib/relative-strength';
import type { QuadrantId } from '@/lib/intelligence/brief';
import { useActivity } from '@/lib/activity/ActivityProvider';
import { cn } from '../ui/utils';

type FilterId = 'ALL' | Exclude<QuadrantId, 'UNKNOWN'>;

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'SYNCED_UPTREND', label: 'Synced Uptrend' },
  { id: 'PULLBACK', label: 'Pullback' },
  { id: 'TURNING', label: 'Turning' },
  { id: 'BROKEN_TREND', label: 'Broken Trend' },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTicker?: (ticker: string) => void;
  initialFilter?: FilterId;
};

export function QuadrantScreenerDialog({
  open,
  onOpenChange,
  onSelectTicker,
  initialFilter = 'ALL',
}: Props) {
  const activity = useActivity();
  const [points, setPoints] = useState<RelativeStrengthPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>(initialFilter);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setFilter(initialFilter);
    setSearch('');
    activity?.trackEvent({
      eventType: 'feature_use',
      eventName: 'quadrant_screener_open',
    });
  }, [open, initialFilter, activity]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPoints(await fetchUniverseRelativeStrength());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load universe');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const charted = useMemo(() => toChartPoints(points), [points]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return charted.filter((p) => {
      if (filter !== 'ALL' && p.quadrant !== filter) return false;
      if (q && !p.ticker.includes(q) && !(p.label ?? '').toUpperCase().includes(q)) return false;
      return true;
    });
  }, [charted, filter, search]);

  const filteredPoints: RelativeStrengthPoint[] = useMemo(
    () =>
      filtered.map((p) => ({
        ticker: p.ticker,
        label: p.label,
        pctFrom21DayEma: p.pctFrom21DayEma,
        pctFrom30WeekEma: p.pctFrom30WeekEma,
        dailyRating: p.dailyRating,
        dailyCurrentPrice: p.dailyCurrentPrice,
        highlight: p.highlight,
      })),
    [filtered],
  );

  const counts = useMemo(() => {
    const c: Record<FilterId, number> = {
      ALL: charted.length,
      SYNCED_UPTREND: 0,
      PULLBACK: 0,
      TURNING: 0,
      BROKEN_TREND: 0,
    };
    for (const p of charted) {
      if (p.quadrant !== 'UNKNOWN') c[p.quadrant] += 1;
    }
    return c;
  }, [charted]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex h-[min(92dvh,860px)] max-h-[92dvh] w-[calc(100%-1.25rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-2xl border-border/70 bg-white p-0 shadow-2xl sm:max-w-6xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-neutral-100 px-5 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="text-[17px] font-semibold tracking-tight text-neutral-900">
            Quadrant Screener
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-neutral-500">
            Filter the MWS universe by 21-day & 30-week EMA quadrant position.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-100 px-4 py-3 sm:px-5">
          <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticker…"
              className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-neutral-300"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              const color =
                f.id !== 'ALL' ? QUADRANT_COLORS[f.id as Exclude<QuadrantId, 'UNKNOWN'>] : null;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                    active
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300',
                  )}
                >
                  {color && (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: active ? '#fff' : color.dot }}
                    />
                  )}
                  {f.label}
                  <span className={cn('font-mono text-[10px]', active ? 'text-white/70' : 'text-neutral-400')}>
                    {counts[f.id]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px]">
          <section className="min-h-0 p-2 sm:p-3">
            {error && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                Loading universe…
              </div>
            ) : (
              <RelativeStrengthScatter
                points={filteredPoints}
                fill
                showBrief={false}
                showTitle={false}
                onSelectTicker={onSelectTicker}
              />
            )}
          </section>

          <aside className="hidden min-h-0 overflow-y-auto border-l border-neutral-100 bg-neutral-50/60 p-3 lg:block">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              Showing {filtered.length}
            </p>
            <ul className="space-y-1">
              {filtered.slice(0, 80).map((p) => {
                const copy =
                  p.quadrant !== 'UNKNOWN' ? QUADRANT_COPY[p.quadrant] : { title: '—', subtitle: '' };
                const color =
                  p.quadrant !== 'UNKNOWN' ? QUADRANT_COLORS[p.quadrant] : null;
                return (
                  <li key={p.ticker}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white"
                      onClick={() => onSelectTicker?.(p.ticker)}
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color?.dot ?? '#a3a3a3' }}
                      />
                      <span className="font-mono text-[12px] font-semibold text-neutral-900">
                        {p.ticker}
                      </span>
                      <span className="truncate text-[11px] text-neutral-500">{copy.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {filtered.length > 80 && (
              <p className="mt-2 text-[11px] text-neutral-400">+{filtered.length - 80} more on chart</p>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function QuadrantScreenerButton({
  onSelectTicker,
  className,
  size = 'sm',
  variant = 'outline',
  label = 'Screener',
  initialFilter,
}: {
  onSelectTicker?: (ticker: string) => void;
  className?: string;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ghost' | 'default';
  label?: string;
  initialFilter?: FilterId;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Filter className="mr-1.5 h-4 w-4" />
        {label}
      </Button>
      <QuadrantScreenerDialog
        open={open}
        onOpenChange={setOpen}
        onSelectTicker={onSelectTicker}
        initialFilter={initialFilter}
      />
    </>
  );
}
