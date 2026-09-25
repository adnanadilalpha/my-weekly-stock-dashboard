'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScatterChart } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { MwsTickerPickGrid, type MwsPickerTickerRow } from '../mws-ticker-pick-grid';
import { RelativeStrengthScatter } from './relative-strength-scatter';
import { fetchTickersRelativeStrength } from '@/lib/hooks/useRelativeStrength';
import { loadUniversePickerRows } from '@/lib/mws-universe-picker-rows';
import type { RelativeStrengthPoint } from '@/lib/relative-strength';
import { useActivity } from '@/lib/activity/ActivityProvider';
import { featureFlags } from '@/lib/feature-flags';
import { cn } from '../ui/utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select these tickers when the dialog opens. */
  initialTickers?: string[];
  onSelectTicker?: (ticker: string) => void;
};

export function RelativeStrengthDialog({
  open,
  onOpenChange,
  initialTickers = [],
  onSelectTicker,
}: Props) {
  const activity = useActivity();
  const [rows, setRows] = useState<MwsPickerTickerRow[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [points, setPoints] = useState<RelativeStrengthPoint[]>([]);
  const [loadingUniverse, setLoadingUniverse] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seedKey = useMemo(
    () =>
      [...new Set(initialTickers.map((t) => t.trim().toUpperCase()).filter(Boolean))]
        .sort()
        .join(','),
    [initialTickers],
  );

  useEffect(() => {
    if (!open) return;
    const init = new Set(seedKey ? seedKey.split(',') : []);
    setSelected(init);
    setSearch('');
    setError(null);
    activity?.trackEvent({
      eventType: 'feature_use',
      eventName: 'relative_strength_open',
      metadata: { seedCount: init.size },
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

  const selectedList = useMemo(() => [...selected], [selected]);

  useEffect(() => {
    if (!open) return;
    if (selectedList.length === 0) {
      setPoints([]);
      return;
    }
    let cancelled = false;
    setLoadingChart(true);
    setError(null);
    fetchTickersRelativeStrength(selectedList)
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
  }, [open, selectedList]);

  const onToggle = useCallback((row: MwsPickerTickerRow) => {
    const key = row.ticker.toUpperCase();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Override base `grid` — height must be locked or the ticker universe blows the modal open.
          '!flex h-[min(88dvh,760px)] max-h-[88dvh] w-[calc(100%-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-4xl',
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-3.5 text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <ScatterChart className="h-4 w-4 text-muted-foreground" />
            Relative Strength
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-[13px]">
            Pick tickers, then compare % from the 50-day and 200-day moving averages.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,38%)_minmax(0,62%)] md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-1">
          <aside className="flex min-h-0 flex-col overflow-hidden border-b border-border bg-muted/15 p-3 md:border-b-0 md:border-r">
            <div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-0.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Tickers
              </span>
              <span className="tabular-nums text-[11px] text-muted-foreground">{selected.size}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {loadingUniverse ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
              ) : (
                <MwsTickerPickGrid
                  rows={rows}
                  selectedTickers={selected}
                  onToggle={onToggle}
                  search={search}
                  onSearchChange={setSearch}
                  compact
                  hint="Search, then toggle. Chart updates live."
                />
              )}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto bg-background p-3 sm:p-4">
            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
            {selected.size === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Select tickers to plot Relative Strength.
              </p>
            ) : loadingChart ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Loading chart…</p>
            ) : (
              <RelativeStrengthScatter
                points={points}
                height={420}
                onSelectTicker={onSelectTicker}
              />
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Compact trigger used on My Holdings, ticker analysis, dashboard, etc. */
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
        <ScatterChart className="mr-1.5 h-4 w-4" />
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
