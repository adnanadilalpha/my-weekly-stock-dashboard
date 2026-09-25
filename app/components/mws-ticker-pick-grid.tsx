'use client';

import { Check } from 'lucide-react';
import { cn } from './ui/utils';

export type MwsPickerTickerRow = {
  name: string;
  ticker: string;
};

type Props = {
  rows: MwsPickerTickerRow[];
  selectedTickers: Set<string>;
  onToggle: (row: MwsPickerTickerRow) => void;
  search: string;
  onSearchChange: (value: string) => void;
  /** When set, untoggled rows are disabled once selection reaches this size. */
  maxSelected?: number;
  disabled?: boolean;
  searchPlaceholder?: string;
  hint?: string;
  emptyLabel?: string;
  /** Narrow single-column list for side panels (Relative Strength dialog). */
  compact?: boolean;
};

/**
 * Same searchable name+symbol grid used in the MWS hub Customize → Personalized Tickers tab.
 */
export function MwsTickerPickGrid({
  rows,
  selectedTickers,
  onToggle,
  search,
  onSearchChange,
  maxSelected,
  disabled = false,
  searchPlaceholder = 'Search tickers by name or symbol…',
  hint,
  emptyLabel = 'No tickers match.',
  compact = false,
}: Props) {
  const selectedCount = selectedTickers.size;
  const pickerItems = search.trim()
    ? rows.filter(
        (x) =>
          x.name.toLowerCase().includes(search.toLowerCase()) ||
          x.ticker.toLowerCase().includes(search.toLowerCase()),
      )
    : rows;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {hint ? <p className="mb-2 shrink-0 text-xs text-muted-foreground">{hint}</p> : null}
      <input
        type="search"
        placeholder={searchPlaceholder}
        value={search}
        disabled={disabled}
        onChange={(e) => onSearchChange(e.target.value)}
        className="mb-2.5 h-9 w-full shrink-0 rounded-lg border border-border bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-violet-500/50 focus-visible:ring-2 focus-visible:ring-violet-500/25"
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {pickerItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div
            className={cn(
              'grid gap-1.5',
              compact
                ? 'grid-cols-1'
                : 'grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]',
            )}
          >
            {pickerItems.map((item) => {
              const key = item.ticker.toUpperCase();
              const on = selectedTickers.has(key);
              const atCap = maxSelected != null && !on && selectedCount >= maxSelected;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  disabled={disabled || atCap}
                  onClick={() => onToggle(item)}
                  className={cn(
                    'flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors',
                    on
                      ? 'border-violet-600 bg-violet-500/10 font-semibold text-violet-800 shadow-sm dark:border-violet-400 dark:bg-violet-950/45 dark:text-violet-200'
                      : 'border-border bg-card text-foreground hover:border-border hover:bg-muted/50',
                    (disabled || atCap) && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span
                      className={cn(
                        'font-mono text-[11px] tabular-nums',
                        on ? 'text-violet-700 dark:text-violet-300' : 'text-muted-foreground',
                      )}
                    >
                      {item.ticker}
                    </span>
                    {on ? (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white dark:bg-violet-500">
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
