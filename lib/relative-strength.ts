import { quadrantFromPct, type QuadrantId } from '@/lib/intelligence/brief';

export type RelativeStrengthPoint = {
  ticker: string;
  label?: string;
  pctFromSma50: number | null;
  pctFromSma200: number | null;
  dailyRating?: string | null;
  dailyCurrentPrice?: number | null;
  highlight?: boolean;
};

export type RelativeStrengthChartPoint = RelativeStrengthPoint & {
  x: number;
  y: number;
  quadrant: QuadrantId;
};

/** Normalize stored SMA distance to display percent (0.05 → 5, or 5 → 5). */
export function smaDistanceToDisplayPct(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  // Decimals stay in ~[-1, 1] for normal names; allow up to ±2 as ratio (±200%).
  return Math.abs(raw) <= 2 ? raw * 100 : raw;
}

export function toChartPoints(points: RelativeStrengthPoint[]): RelativeStrengthChartPoint[] {
  return points
    .filter(
      (p) =>
        p.pctFromSma50 != null &&
        p.pctFromSma200 != null &&
        Number.isFinite(p.pctFromSma50) &&
        Number.isFinite(p.pctFromSma200),
    )
    .map((p) => ({
      ...p,
      x: smaDistanceToDisplayPct(p.pctFromSma50 as number),
      y: smaDistanceToDisplayPct(p.pctFromSma200 as number),
      quadrant: quadrantFromPct(p.pctFromSma50, p.pctFromSma200),
    }));
}

export const QUADRANT_COLORS: Record<
  Exclude<QuadrantId, 'UNKNOWN'>,
  { fill: string; label: string; dot: string }
> = {
  STRONG: { fill: 'rgba(34, 197, 94, 0.10)', label: '#15803d', dot: '#16a34a' },
  PULLBACK: { fill: 'rgba(234, 179, 8, 0.12)', label: '#a16207', dot: '#ca8a04' },
  WEAK: { fill: 'rgba(239, 68, 68, 0.10)', label: '#b91c1c', dot: '#dc2626' },
  RECOVERY: { fill: 'rgba(59, 130, 246, 0.10)', label: '#1d4ed8', dot: '#2563eb' },
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
