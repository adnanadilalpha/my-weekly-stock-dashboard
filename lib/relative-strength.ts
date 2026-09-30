import { quadrantFromPct, type QuadrantId } from '@/lib/intelligence/brief';

import type { ScreenerMeta } from '@/lib/screening/types';

export type RelativeStrengthPoint = {
  ticker: string;
  label?: string;
  /** Decimal distance from 21-day EMA (X axis). */
  pctFrom21DayEma: number | null;
  /** Decimal distance from 30-week EMA (Y axis). */
  pctFrom30WeekEma: number | null;
  dailyRating?: string | null;
  dailyCurrentPrice?: number | null;
  highlight?: boolean;
  /** Present on Quadrant Screener universe loads. */
  screener?: ScreenerMeta;
};

export type RelativeStrengthChartPoint = RelativeStrengthPoint & {
  x: number;
  y: number;
  quadrant: QuadrantId;
};

/** Normalize stored EMA distance to display percent (0.05 → 5, or 5 → 5). */
export function emaDistanceToDisplayPct(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  // Decimals stay in ~[-1, 1] for normal names; allow up to ±2 as ratio (±200%).
  return Math.abs(raw) <= 2 ? raw * 100 : raw;
}

/** @deprecated Use emaDistanceToDisplayPct */
export const smaDistanceToDisplayPct = emaDistanceToDisplayPct;

export function toChartPoints(points: RelativeStrengthPoint[]): RelativeStrengthChartPoint[] {
  return points
    .filter(
      (p) =>
        p.pctFrom21DayEma != null &&
        p.pctFrom30WeekEma != null &&
        Number.isFinite(p.pctFrom21DayEma) &&
        Number.isFinite(p.pctFrom30WeekEma),
    )
    .map((p) => ({
      ...p,
      x: emaDistanceToDisplayPct(p.pctFrom21DayEma as number),
      y: emaDistanceToDisplayPct(p.pctFrom30WeekEma as number),
      quadrant: quadrantFromPct(p.pctFrom21DayEma, p.pctFrom30WeekEma),
    }));
}

/**
 * Product quadrant colors — light, distinct from the external dark reference.
 * Synced = teal, Pullback = indigo, Broken = rose, Turning = amber.
 */
export const QUADRANT_COLORS: Record<
  Exclude<QuadrantId, 'UNKNOWN'>,
  { fill: string; label: string; dot: string }
> = {
  SYNCED_UPTREND: { fill: 'rgba(13, 148, 136, 0.12)', label: '#0f766e', dot: '#0d9488' },
  PULLBACK: { fill: 'rgba(99, 102, 241, 0.12)', label: '#4338ca', dot: '#6366f1' },
  BROKEN_TREND: { fill: 'rgba(225, 29, 72, 0.11)', label: '#be123c', dot: '#e11d48' },
  TURNING: { fill: 'rgba(217, 119, 6, 0.13)', label: '#b45309', dot: '#d97706' },
};

export const QUADRANT_COPY: Record<
  Exclude<QuadrantId, 'UNKNOWN'>,
  { title: string; subtitle: string }
> = {
  SYNCED_UPTREND: {
    title: 'Synced Uptrend',
    subtitle: 'Above 21-day & 30-week EMA',
  },
  PULLBACK: {
    title: 'Pullback',
    subtitle: 'Above 30-week, below 21-day EMA',
  },
  BROKEN_TREND: {
    title: 'Broken Trend',
    subtitle: 'Below 21-day & 30-week EMA',
  },
  TURNING: {
    title: 'Turning',
    subtitle: 'Below 30-week, above 21-day EMA',
  },
};

/**
 * Shared symmetric domain so all four quadrants are equal size (0,0 centered).
 * Outliers are ignored for scale (90th percentile) so one wild ticker doesn't blow the chart.
 */
export function sharedSymmetricDomain(
  xs: number[],
  ys: number[],
  opts?: { minExtent?: number; hardMax?: number },
): { domain: [number, number]; ticks: number[] } {
  const minExtent = opts?.minExtent ?? 20;
  const hardMax = opts?.hardMax ?? 60;
  const vals = [...xs, ...ys].filter((n) => Number.isFinite(n));

  if (vals.length === 0) {
    return { domain: [-minExtent, minExtent], ticks: buildTicks(minExtent) };
  }

  const absSorted = vals.map(Math.abs).sort((a, b) => a - b);
  const p90Idx = Math.max(0, Math.ceil(absSorted.length * 0.9) - 1);
  const p90 = absSorted[p90Idx] ?? minExtent;
  const raw = Math.max(minExtent, p90 * 1.12);
  const step = raw <= 25 ? 5 : 10;
  let extent = Math.ceil(raw / step) * step;
  extent = Math.min(Math.max(extent, minExtent), hardMax);

  return { domain: [-extent, extent], ticks: buildTicks(extent, step) };
}

/** Tick marks for an arbitrary visible [lo, hi] window (used when zoomed/panned). */
export function ticksForWindow(lo: number, hi: number): number[] {
  const span = Math.max(1e-6, hi - lo);
  const rough = span / 6;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step =
    residual <= 1.5 ? magnitude : residual <= 3.5 ? 2 * magnitude : residual <= 7.5 ? 5 * magnitude : 10 * magnitude;
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) {
    ticks.push(Number(v.toFixed(6)));
  }
  return ticks;
}

function buildTicks(extent: number, step = extent <= 25 ? 5 : 10): number[] {
  const ticks: number[] = [];
  for (let v = -extent; v <= extent + 1e-9; v += step) {
    ticks.push(Number(v.toFixed(6)));
  }
  return ticks;
}

/** @deprecated Prefer sharedSymmetricDomain — kept for any external callers. */
export function axisDomain(values: number[], softClamp = 20): [number, number] {
  const { domain } = sharedSymmetricDomain(values, values, { minExtent: softClamp });
  return domain;
}
