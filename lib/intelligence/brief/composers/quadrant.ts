import type { MwsBriefOutput, QuadrantBriefInput, QuadrantId } from '../types';
import { formatPct, missingBrief, withDisclaimer } from '../format';

/**
 * X = % from 21-day EMA, Y = % from 30-week EMA.
 * Accepts new field names; falls back to legacy SMA keys for old fixtures.
 */
export function quadrantFromPct(
  pct21Day: number | null | undefined,
  pct30Week: number | null | undefined,
): QuadrantId {
  if (
    pct21Day == null ||
    pct30Week == null ||
    !Number.isFinite(pct21Day) ||
    !Number.isFinite(pct30Week)
  ) {
    return 'UNKNOWN';
  }
  const above21d = pct21Day >= 0;
  const above30w = pct30Week >= 0;
  if (above21d && above30w) return 'SYNCED_UPTREND';
  if (!above21d && above30w) return 'PULLBACK';
  if (!above21d && !above30w) return 'BROKEN_TREND';
  return 'TURNING';
}

/** Chart / brief labels for the four quadrants. */
const QUADRANT_LABEL: Record<Exclude<QuadrantId, 'UNKNOWN'>, string> = {
  SYNCED_UPTREND: 'Synced Uptrend — Above 21-day & 30-week EMA',
  PULLBACK: 'Pullback — Above 30-week, below 21-day EMA',
  BROKEN_TREND: 'Broken Trend — Below 21-day & 30-week EMA',
  TURNING: 'Turning — Below 30-week, above 21-day EMA',
};

function resolveAxes(input: QuadrantBriefInput): {
  pct21: number | null | undefined;
  pct30: number | null | undefined;
} {
  return {
    pct21: input.pct_from_21d_ema ?? input.pct_from_sma50,
    pct30: input.pct_from_30w_ema ?? input.pct_from_sma200,
  };
}

export function composeQuadrantBrief(input: QuadrantBriefInput): MwsBriefOutput {
  const ticker = (input.ticker ?? 'This ticker').toUpperCase();
  const { pct21, pct30 } = resolveAxes(input);
  const sourceFields = ['daily_price_vs_21ema', 'weekly_price_vs_30ema'];
  const q = quadrantFromPct(pct21, pct30);

  if (q === 'UNKNOWN') {
    return missingBrief('quadrant', `${ticker}: Relative strength`, sourceFields);
  }

  const bullets = [
    QUADRANT_LABEL[q],
    `% from 21-day EMA: ${formatPct(pct21)}`,
    `% from 30-week EMA: ${formatPct(pct30)}`,
  ];

  return withDisclaimer({
    composerId: 'quadrant',
    title: `${ticker} · ${QUADRANT_LABEL[q].split(' — ')[0]}`,
    body: bullets.join('\n'),
    bullets: [],
    sourceFields,
  });
}
