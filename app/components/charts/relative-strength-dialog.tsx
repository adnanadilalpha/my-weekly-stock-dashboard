'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ChevronDown, CircleHelp, Plus, Search, X } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { TickerIcon } from '../ui/ticker-icon';
import { RelativeStrengthScatter } from './relative-strength-scatter';
import { fetchTickersRelativeStrength } from '@/lib/hooks/useRelativeStrength';
import { loadUniversePickerRows } from '@/lib/mws-universe-picker-rows';
import type { RelativeStrengthPoint } from '@/lib/relative-strength';
import { QUADRANT_COLORS } from '@/lib/relative-strength';
import { useActivity } from '@/lib/activity/ActivityProvider';
import { featureFlags } from '@/lib/feature-flags';
import type { MwsPickerTickerRow } from '../mws-ticker-pick-grid';
import { cn } from '../ui/utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTickers?: string[];
  onSelectTicker?: (ticker: string) => void;
};

const GUIDE_SECTIONS = [
  {
    id: 'SYNCED_UPTREND' as const,
    title: 'Synced Uptrend',
    body: 'Above both EMAs. The long- and short-term trends are pulling in the same direction — this is where winners often keep working.',
  },
  {
    id: 'PULLBACK' as const,
    title: 'Pullback',
    body: 'Above the 30-week, below the 21-day EMA. The long-term trend is intact, but short-term momentum has slipped. A reclaim of the 21-day can mark renewed strength.',
  },
  {
    id: 'TURNING' as const,
    title: 'Turning',
    body: 'Below the 30-week EMA, above the 21-day EMA. The long-term trend is still down, but short-term momentum is trying to turn. Watch for a reclaim of the 30-week EMA.',
  },
  {
    id: 'BROKEN_TREND' as const,
    title: 'Broken Trend',
    body: 'Below both EMAs. Both horizons agree the trend is down — treat with caution.',
  },
] as const;

export function RelativeStrengthDialog({
  open,
  onOpenChange,
  initialTickers = [],
  onSelectTicker,
}: Props) {
  const activity = useActivity();
  const searchRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<MwsPickerTickerRow[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [points, setPoints] = useState<RelativeStrengthPoint[]>([]);
  const [loadingUniverse, setLoadingUniverse] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const seedKey = useMemo(
    () =>
      [...new Set(initialTickers.map((t) => t.trim().toUpperCase()).filter(Boolean))]
        .sort()
        .join(','),
    [initialTickers],
  );

  const nameByTicker = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.ticker.toUpperCase(), row.name);
    return map;
  }, [rows]);

  useEffect(() => {
    if (!open) return;
    const init = seedKey ? seedKey.split(',') : [];
    setSelected(init);
    setSearch('');
    setError(null);
    setGuideOpen(false);
    activity?.trackEvent({
      eventType: 'feature_use',
      eventName: 'relative_strength_open',
      metadata: { seedCount: init.length },
    });
  }, [open, seedKey, activity]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingUniverse(true);
    loadUniversePickerRows()
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load tickers');
      })
      .finally(() => {
        if (!cancelled) setLoadingUniverse(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (selected.length === 0) {
      setPoints([]);
      return;
    }
    let cancelled = false;
    setLoadingChart(true);
    setError(null);
    fetchTickersRelativeStrength(selected)
      .then((pts) => {
        if (!cancelled) setPoints(pts);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load chart');
      })
      .finally(() => {
        if (!cancelled) setLoadingChart(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selected]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return rows
      .filter((row) => {
        const key = row.ticker.toUpperCase();
        if (selectedSet.has(key)) return false;
        return (
          row.ticker.toLowerCase().includes(q) || row.name.toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [rows, search, selectedSet]);

  const addTicker = useCallback((ticker: string) => {
    const key = ticker.toUpperCase();
    setSelected((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setSearch('');
  }, []);

  const removeTicker = useCallback((ticker: string) => {
    const key = ticker.toUpperCase();
    setSelected((prev) => prev.filter((t) => t !== key));
  }, []);

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          '!flex h-[min(90dvh,820px)] max-h-[90dvh] w-[calc(100%-1.25rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl border-border/70 bg-white p-0 shadow-2xl sm:max-w-5xl',
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-neutral-100 px-5 py-4 pr-12 text-left sm:px-6 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-[17px] font-semibold tracking-tight text-neutral-900">
                Relative Strength
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed text-neutral-500">
                Mid- to long-term view: distance from the 21-day EMA (short-term) and 30-week EMA
                (long-term).
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => setGuideOpen((v) => !v)}
              className={cn(
                'mr-6 flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                guideOpen
                  ? 'border-neutral-300 bg-neutral-100 text-neutral-900'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50',
              )}
              aria-expanded={guideOpen}
            >
              <CircleHelp className="h-3.5 w-3.5" />
              How to read
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform', guideOpen && 'rotate-180')}
              />
            </button>
          </div>

          {guideOpen && (
            <div className="mt-3 max-h-[min(42vh,360px)] space-y-3 overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50/80 p-4 text-left">
              <p className="text-[13px] leading-relaxed text-neutral-700">
                Built for investors and swing traders — not day traders. It combines the daily and
                weekly charts so you can see whether short- and long-term trends agree.
              </p>
              <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-neutral-600">
                <li>
                  <span className="font-semibold text-neutral-800">Vertical axis</span> — distance
                  from the 30-week EMA (long-term trendline). Above = long-term up; below = down.
                </li>
                <li>
                  <span className="font-semibold text-neutral-800">Horizontal axis</span> — distance
                  from the 21-day EMA (short-term filter). Healthy uptrends often retest this line;
                  a break below can be the first crack in momentum.
                </li>
                <li>
                  The farther a dot sits from the center, the stronger — or more stretched — the
                  move.
                </li>
                <li>
                  <span className="font-semibold text-neutral-800">Zoom the chart</span> — scroll
                  (or use + / −). <span className="font-semibold text-neutral-800">Pan</span> by
                  dragging. Hit Reset to return to the full view.
                </li>
              </ul>
              <div className="grid gap-2 sm:grid-cols-2">
                {GUIDE_SECTIONS.map((section) => (
                  <div
                    key={section.id}
                    className="rounded-lg border border-neutral-200/80 bg-white px-3 py-2.5"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: QUADRANT_COLORS[section.id].dot }}
                        aria-hidden
                      />
                      <span
                        className="text-[12.5px] font-semibold"
                        style={{ color: QUADRANT_COLORS[section.id].label }}
                      >
                        {section.title}
                      </span>
                    </div>
                    <p className="text-[12px] leading-relaxed text-neutral-600">{section.body}</p>
                  </div>
                ))}
              </div>
              <p className="text-[12px] leading-relaxed text-neutral-500">
                In short: stay with Synced Uptrends, respect Broken Trends, and dig deeper on
                Pullback and Turning — that&apos;s where the homework starts.
              </p>
            </div>
          )}
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="flex max-h-[38vh] min-h-0 flex-col border-b border-neutral-100 bg-neutral-50/60 md:max-h-none md:border-b-0 md:border-r">
            <div className="shrink-0 space-y-3 p-4">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                  aria-hidden
                />
                <input
                  ref={searchRef}
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search or add tickers…"
                  className="h-10 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:ring-2 focus:ring-neutral-900/5"
                />
              </div>

              {search.trim() && (
                <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
                  {loadingUniverse ? (
                    <p className="px-3 py-3 text-xs text-neutral-500">Loading…</p>
                  ) : searchHits.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-neutral-500">No matching tickers.</p>
                  ) : (
                    <ul className="max-h-48 overflow-y-auto py-1">
                      {searchHits.map((row) => {
                        const key = row.ticker.toUpperCase();
                        return (
                          <li key={key}>
                            <button
                              type="button"
                              onClick={() => addTicker(key)}
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-neutral-50"
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
                                <TickerIcon ticker={key} size={28} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-semibold text-neutral-900">
                                  {key}
                                </span>
                                <span className="block truncate text-[11px] text-neutral-500">
                                  {row.name}
                                </span>
                              </span>
                              <Plus className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
              {selected.length === 0 ? (
                <div className="flex h-full min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white/70 px-4 text-center">
                  <p className="text-[13px] text-neutral-500">
                    Search above to add tickers to the chart.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {selected.map((ticker) => {
                    const name = nameByTicker.get(ticker) ?? ticker;
                    return (
                      <li key={ticker}>
                        <div className="group flex items-center gap-3 rounded-xl border border-neutral-200/80 bg-white px-3 py-2.5 shadow-sm transition-colors hover:border-neutral-300">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
                            <TickerIcon ticker={ticker} size={32} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-semibold tracking-tight text-neutral-900">
                              {ticker}
                            </div>
                            <div className="truncate text-[11px] text-neutral-500">{name}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeTicker(ticker)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                            aria-label={`Remove ${ticker}`}
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col bg-white p-2 sm:p-3">
            {error && (
              <p className="mb-2 shrink-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            {selected.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/50 px-6 text-center">
                <p className="max-w-xs text-sm leading-relaxed text-neutral-500">
                  Add tickers on the left to plot Relative Strength.
                </p>
              </div>
            ) : loadingChart ? (
              <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
                Loading chart…
              </div>
            ) : (
              <div className="min-h-0 flex-1">
                <RelativeStrengthScatter
                  points={points}
                  fill
                  showBrief={false}
                  onSelectTicker={onSelectTicker}
                />
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RelativeStrengthButton({
  initialTickers,
  onSelectTicker,
  className,
  size = 'sm',
  variant = 'outline',
  label = 'Relative Strength',
}: {
  initialTickers?: string[];
  onSelectTicker?: (ticker: string) => void;
  className?: string;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ghost' | 'default';
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!featureFlags.relativeStrength) return null;

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        <BarChart3 className="mr-1.5 h-4 w-4" />
        {label}
      </Button>
      <RelativeStrengthDialog
        open={open}
        onOpenChange={setOpen}
        initialTickers={initialTickers}
        onSelectTicker={(t) => {
          onSelectTicker?.(t);
        }}
      />
    </>
  );
}
