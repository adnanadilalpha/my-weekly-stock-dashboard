import type { MwsBriefOutput, QuadrantBriefInput, QuadrantId } from '../types';
import { formatPct, missingBrief, withDisclaimer } from '../format';

export function quadrantFromPct(
  pct50: number | null | undefined,
  pct200: number | null | undefined,
): QuadrantId {
  if (pct50 == null || pct200 == null || !Number.isFinite(pct50) || !Number.isFinite(pct200)) {
    return 'UNKNOWN';
  }
  const above50 = pct50 >= 0;
  const above200 = pct200 >= 0;
  if (above50 && above200) return 'STRONG';
  if (!above50 && above200) return 'PULLBACK';
  if (!above50 && !above200) return 'WEAK';
  return 'RECOVERY';
}

/** Chart legend labels (fixed product copy for the four quadrants). */
const QUADRANT_LABEL: Record<Exclude<QuadrantId, 'UNKNOWN'>, string> = {
  STRONG: 'STRONG — Above both 50d & 200d',
  PULLBACK: 'PULLBACK — Above 200d, below 50d',
  WEAK: 'WEAK — Below both 50d & 200d',
  RECOVERY: 'RECOVERY — Above 50d, below 200d',
};

export function composeQuadrantBrief(input: QuadrantBriefInput): MwsBriefOutput {
  const ticker = (input.ticker ?? 'This ticker').toUpperCase();
  const sourceFields = ['pct_from_sma50', 'pct_from_sma200'];
  const q = quadrantFromPct(input.pct_from_sma50, input.pct_from_sma200);

  if (q === 'UNKNOWN') {
    return missingBrief('quadrant', `${ticker}: Relative strength`, sourceFields);
  }

  const bullets = [
    QUADRANT_LABEL[q],
    `% from 50-day MA: ${formatPct(input.pct_from_sma50)}`,
    `% from 200-day MA: ${formatPct(input.pct_from_sma200)}`,
  ];

  return withDisclaimer({
    composerId: 'quadrant',
    title: `${ticker} · ${q}`,
    body: bullets.join('\n'),
    bullets: [],
    sourceFields,
  });
}
