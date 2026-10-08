'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Filter, Search, X } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { RelativeStrengthScatter } from './relative-strength-scatter';
import { fetchUniverseRelativeStrength } from '@/lib/hooks/useRelativeStrength';
import type { RelativeStrengthPoint } from '@/lib/relative-strength';
import { QUADRANT_COLORS, QUADRANT_COPY, toChartPoints } from '@/lib/relative-strength';
import type { QuadrantId } from '@/lib/intelligence/brief';
import { useActivity } from '@/lib/activity/ActivityProvider';
import {
  MARKET_CAP_LABELS,
  SCREENER_INDEX_LABELS,
  type MarketCapBucket,
  type ScreenerIndexId,
} from '@/lib/screening/types';
import { CLIENT_CAP_BUCKETS } from '@/lib/screening/client-ticker-meta';
import { cn } from '../ui/utils';

type FilterId = 'ALL' | Exclude<QuadrantId, 'UNKNOWN'>;

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'SYNCED_UPTREND', label: 'Synced Uptrend' },
  { id: 'PULLBACK', label: 'Pullback' },
  { id: 'TURNING', label: 'Turning' },
  { id: 'BROKEN_TREND', label: 'Broken Trend' },
];

const MARKET_CAP_OPTIONS: { id: MarketCapBucket; label: string }[] = CLIENT_CAP_BUCKETS.map(
  (id) => ({ id, label: MARKET_CAP_LABELS[id] }),
);

const INDEX_OPTIONS: { id: ScreenerIndexId; label: string }[] = [
  { id: 'sp500', label: SCREENER_INDEX_LABELS.sp500 },
  { id: 'nasdaq100', label: SCREENER_INDEX_LABELS.nasdaq100 },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTicker?: (ticker: string) => void;
  initialFilter?: FilterId;
};

function toggleValue(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((v) => v !== id) : [...list, id];
}

function summaryLabel(
  selected: string[],
  options: { id: string; label: string }[],
  allLabel: string,
): string {
  if (selected.length === 0) return allLabel;
  if (selected.length === 1) {
    return options.find((o) => o.id === selected[0])?.label ?? selected[0];
  }
  return `${selected.length} selected`;
}

function MultiFilterSelect({
  label,
  allLabel,
  selected,
  onChange,
  options,
}: {
  label: string;
  allLabel: string;
  selected: string[];
  onChange: (next: string[]) => void;
  options: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const active = selected.length > 0;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border bg-white px-2.5 text-left text-[12px] outline-none focus:ring-2 focus:ring-neutral-300',
              active
                ? 'border-neutral-400 text-neutral-900'
                : 'border-neutral-200 text-neutral-800',
            )}
          >
            <span className="min-w-0 truncate">
              {summaryLabel(selected, options, allLabel)}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(100vw-2rem,16rem)] p-1.5"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-neutral-700 hover:bg-neutral-50"
              onClick={() => onChange([])}
            >
              <span
                className={cn(
                  'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                  selected.length === 0
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-300 bg-white',
                )}
              >
                {selected.length === 0 && <Check className="h-2.5 w-2.5" />}
              </span>
              {allLabel}
            </button>
            {options.map((o) => {
              const checked = selected.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-neutral-800 hover:bg-neutral-50"
                  onClick={() => onChange(toggleValue(selected, o.id))}
                >
                  <span
                    className={cn(
                      'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                      checked
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-300 bg-white',
                    )}
                  >
                    {checked && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <span className="min-w-0 truncate">{o.label}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

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
  const [sectors, setSectors] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [marketCaps, setMarketCaps] = useState<MarketCapBucket[]>([]);
  const [indexes, setIndexes] = useState<ScreenerIndexId[]>([]);

  useEffect(() => {
    if (!open) return;
    setFilter(initialFilter);
    setSearch('');
    setSectors([]);
    setIndustries([]);
    setMarketCaps([]);
    setIndexes([]);
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

  const sectorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of charted) {
      const s = p.screener?.sector?.trim();
      if (s) set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b)).map((s) => ({ id: s, label: s }));
  }, [charted]);

  const industryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of charted) {
      if (sectors.length > 0 && !sectors.includes(p.screener?.sector ?? '')) continue;
      const ind = p.screener?.industry?.trim();
      if (ind) set.add(ind);
    }
    return [...set].sort((a, b) => a.localeCompare(b)).map((s) => ({ id: s, label: s }));
  }, [charted, sectors]);

  useEffect(() => {
    if (industries.length === 0) return;
    const allowed = new Set(industryOptions.map((o) => o.id));
    const next = industries.filter((id) => allowed.has(id));
    if (next.length !== industries.length) setIndustries(next);
  }, [industries, industryOptions]);

  const matchesAdvanced = useCallback(
    (p: (typeof charted)[number]) => {
      const meta = p.screener;
      if (sectors.length > 0 && !sectors.includes(meta?.sector ?? '')) return false;
      if (industries.length > 0 && !industries.includes(meta?.industry ?? '')) return false;
      if (marketCaps.length > 0 && !marketCaps.includes(meta?.marketCap as MarketCapBucket)) {
        return false;
      }
      if (indexes.length > 0) {
        const ok =
          (indexes.includes('sp500') && meta?.inSp500) ||
          (indexes.includes('nasdaq100') && meta?.inNasdaq100);
        if (!ok) return false;
      }
      return true;
    },
    [sectors, industries, marketCaps, indexes],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return charted.filter((p) => {
      if (filter !== 'ALL' && p.quadrant !== filter) return false;
      if (q && !p.ticker.includes(q) && !(p.label ?? '').toUpperCase().includes(q)) return false;
      return matchesAdvanced(p);
    });
  }, [charted, filter, search, matchesAdvanced]);

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
        screener: p.screener,
      })),
    [filtered],
  );

  const counts = useMemo(() => {
    const base = charted.filter(matchesAdvanced);
    const c: Record<FilterId, number> = {
      ALL: base.length,
      SYNCED_UPTREND: 0,
      PULLBACK: 0,
      TURNING: 0,
      BROKEN_TREND: 0,
    };
    for (const p of base) {
      if (p.quadrant !== 'UNKNOWN') c[p.quadrant] += 1;
    }
    return c;
  }, [charted, matchesAdvanced]);

  const advancedActive =
    sectors.length > 0 ||
    industries.length > 0 ||
    marketCaps.length > 0 ||
    indexes.length > 0;

  const clearAdvanced = useCallback(() => {
    setSectors([]);
    setIndustries([]);
    setMarketCaps([]);
    setIndexes([]);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex h-[min(92dvh,860px)] max-h-[92dvh] w-[calc(100%-1.25rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-2xl border-border/70 bg-white p-0 shadow-2xl sm:max-w-6xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-neutral-100 px-5 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="text-[17px] font-semibold tracking-tight text-neutral-900">
            Quadrant Screener
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-neutral-500">
            Filter the MWS universe by quadrant, sector, industry, market cap, and index membership.
            Multi-select within each filter.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 space-y-3 border-b border-neutral-100 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ticker…"
                className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-neutral-300"
              />
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
              <MultiFilterSelect
                label="Sector"
                allLabel="All sectors"
                selected={sectors}
                onChange={setSectors}
                options={sectorOptions}
              />
              <MultiFilterSelect
                label="Industry"
                allLabel="All industries"
                selected={industries}
                onChange={setIndustries}
                options={industryOptions}
              />
              <MultiFilterSelect
                label="Market cap"
                allLabel="All sizes"
                selected={marketCaps}
                onChange={(next) => setMarketCaps(next as MarketCapBucket[])}
                options={MARKET_CAP_OPTIONS}
              />
              <MultiFilterSelect
                label="Index"
                allLabel="Any index"
                selected={indexes}
                onChange={(next) => setIndexes(next as ScreenerIndexId[])}
                options={INDEX_OPTIONS}
              />
            </div>
            {advancedActive && (
              <button
                type="button"
                onClick={clearAdvanced}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 text-[12px] font-medium text-neutral-600 hover:bg-neutral-50"
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
              </button>
            )}
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
