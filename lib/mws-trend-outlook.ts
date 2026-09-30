/**
 * Outlook sub-label within a Rating band (client sheet 27.04.2026).
 * Keep in sync with `supabase/functions/_stock_impl/compute.ts` → `trendOutlook`.
 *
 * Sideways Softening/Firming uses Price vs long EMA ±1.5% (same IF shape as the sheet).
 * The sheet labels that criterion "9 vs 30 EMA", but Softening/Firming templates and the
 * IWM client case require price-vs-long — EMA-cross alone mis-labels most Sideways rows
 * as Firming because cross is also 30% of the trend score.
 */

export type TrendOutlookLabel =
  | 'Extended'
  | 'Stable'
  | 'Cooling'
  | 'Reversing'
  | 'Firming'
  | 'Softening'
  | 'Warming';

export type TrendOutlookParams = {
  score_mixed_high: number;
  score_mixed_low: number;
  extended_threshold: number;
};

export function trendOutlook(
  score: number,
  inputs: {
    priceVsShortEma: number | null;
    priceVsLongEma: number | null;
    /** Kept for call-site compatibility; Sideways outlook does not use EMA cross. */
    emaCross?: number | null;
  },
  p: TrendOutlookParams,
): TrendOutlookLabel {
  const pvs = inputs.priceVsShortEma;
  const pvl = inputs.priceVsLongEma;
  const uptrendFloor = p.score_mixed_high;
  const sidewaysFloor = p.score_mixed_low;
  const ext =
    Number.isFinite(p.extended_threshold) && p.extended_threshold > 0 && p.extended_threshold <= 1
      ? p.extended_threshold
      : 0.05;
  // Sheet Sideways band (±1.5%); applied to Price vs long EMA (see file header).
  const sidewaysBand = 0.015;

  if (score > uptrendFloor) {
    if (pvs !== null && pvs > ext) return 'Extended';
    if (pvl !== null && pvl < 0) return 'Reversing';
    if (pvs !== null && pvs < 0) return 'Cooling';
    return 'Stable';
  }

  // Sideways: Softening / Firming / Stable from Price vs long EMA ±1.5%.
  if (score > sidewaysFloor) {
    if (pvl !== null && pvl < -sidewaysBand) return 'Softening';
    if (pvl !== null && pvl > sidewaysBand) return 'Firming';
    return 'Stable';
  }

  if (pvs !== null && pvs < -ext) return 'Extended';
  if (pvl !== null && pvl > 0) return 'Reversing';
  if (pvs !== null && pvs > 0) return 'Warming';
  return 'Stable';
}
