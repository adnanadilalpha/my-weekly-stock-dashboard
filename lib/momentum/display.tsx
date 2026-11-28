import type { ReactNode } from 'react';
import { formatRatioAsPct, formatTotalReturnPct } from './formulas';

export function returnTone(value: number | null | undefined): 'pos' | 'neg' | 'neu' {
  if (value == null || !Number.isFinite(value) || value === 0) return 'neu';
  return value > 0 ? 'pos' : 'neg';
}

export function returnTextClass(value: number | null | undefined): string {
  const t = returnTone(value);
  if (t === 'pos') return 'text-emerald-600 dark:text-emerald-400';
  if (t === 'neg') return 'text-rose-600 dark:text-rose-400';
  return 'text-muted-foreground';
}

export function ReturnPct({
  value,
  digits = 1,
  pill = false,
}: {
  value: number | null | undefined;
  digits?: number;
  pill?: boolean;
}) {
  const text = formatRatioAsPct(value, digits);
  const tone = returnTone(value);
  if (!pill) {
    return (
      <span className={`font-mono text-xs font-semibold tabular-nums ${returnTextClass(value)}`}>
        {text}
      </span>
    );
  }
  const pillCls =
    tone === 'pos'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
      : tone === 'neg'
        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
        : 'bg-muted text-muted-foreground';
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums leading-tight ${pillCls}`}
    >
      {text}
    </span>
  );
}

export function TotalReturnPct({ value, digits = 1 }: { value: number | null | undefined; digits?: number }) {
  return (
    <span className={`font-mono text-xs font-semibold tabular-nums ${returnTextClass(value)}`}>
      {formatTotalReturnPct(value, digits)}
    </span>
  );
}

export function DirBadge({ direction }: { direction: string | null | undefined }) {
  const d = (direction ?? '').toLowerCase();
  if (d !== 'long' && d !== 'short') return <span className="text-muted-foreground">—</span>;
  const label = d === 'long' ? 'Long' : 'Short';
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
        d === 'long'
          ? 'bg-sky-500/12 text-sky-700 dark:text-sky-400'
          : 'bg-amber-500/12 text-amber-800 dark:text-amber-400'
      }`}
    >
      {label}
    </span>
  );
}

export function formatWeekStartDisplay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/** Sheet Current Week column headers (exact). */
export const CURRENT_WEEK_HEADERS = [
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
] as const;

/** Sheet Track Record column headers (exact order). */
export const TRACK_RECORD_COL_HEADERS = [
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

export const momentumTableWrap =
  'overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]';

export const momentumTableScroll = 'overflow-x-auto';

export const momentumTable = 'w-full border-separate border-spacing-0 text-left text-sm';

export const momentumGroupTh =
  'whitespace-nowrap border-b border-white/10 bg-slate-800 px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-white';

export const momentumColTh =
  'whitespace-nowrap border-b border-border/70 bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-600 dark:bg-slate-900/60 dark:text-slate-300';

export const momentumTd =
  'whitespace-nowrap border-b border-border/40 px-3 py-3 align-middle text-[13px] text-foreground';

export function GroupHeaderCell({
  label,
  colSpan,
  first,
  last,
}: {
  label: string;
  colSpan: number;
  first?: boolean;
  last?: boolean;
}): ReactNode {
  return (
    <th
      colSpan={colSpan}
      className={`${momentumGroupTh} ${first ? 'rounded-tl-2xl' : ''} ${last ? 'rounded-tr-2xl' : ''} ${
        label ? '' : 'bg-slate-700'
      }`}
    >
      {label || '\u00a0'}
    </th>
  );
}
