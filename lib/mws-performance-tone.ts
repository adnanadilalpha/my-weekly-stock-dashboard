/** Client feedback #5: green/red only beyond ±1%; otherwise grey. */
export const PERFORMANCE_COLOR_THRESHOLD_PCT = 1;

export type PerformanceTone = 'positive' | 'negative' | 'neutral';

export function toDisplayPercent(value: number): number {
  return Math.abs(value) <= 1 ? value * 100 : value;
}

export function performanceToneFromPercent(pct: number): PerformanceTone {
  if (pct > PERFORMANCE_COLOR_THRESHOLD_PCT) return 'positive';
  if (pct < -PERFORMANCE_COLOR_THRESHOLD_PCT) return 'negative';
  return 'neutral';
}

export function performanceToneFromRawValue(value: number): PerformanceTone {
  return performanceToneFromPercent(toDisplayPercent(value));
}

export const PERFORMANCE_TONE_TEXT_CLASS: Record<PerformanceTone, string> = {
  positive: 'text-emerald-600 dark:text-emerald-400',
  negative: 'text-red-600 dark:text-red-400',
  neutral: 'text-muted-foreground',
};

export const PERFORMANCE_TONE_BAR_CLASS: Record<PerformanceTone, string> = {
  positive: 'bg-emerald-500',
  negative: 'bg-red-500',
  neutral: 'bg-neutral-400 dark:bg-neutral-500',
};

export const PERFORMANCE_TONE_CELL_CLASS: Record<PerformanceTone, string> = {
  positive: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/8',
  negative: 'text-rose-700 dark:text-rose-400 bg-rose-500/8',
  neutral: 'text-muted-foreground bg-muted/50',
};

export const PERFORMANCE_TONE_CHIP_CLASS: Record<PerformanceTone, string> = {
  positive: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  negative: 'bg-rose-500/15 text-rose-800 dark:text-rose-300',
  neutral: 'bg-muted/80 text-muted-foreground',
};

export function parsePercentFromDisplayString(value: string): number | null {
  const m = value.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
