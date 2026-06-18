import {
  ratingTierFromTrendScore,
  type FormulaRatingTier,
  type TrendScoreTierThresholds,
} from '@/lib/mws-formula-badges';

export type TrendStatusFilter = 'all' | 'up' | 'flat' | 'down';

export function isUptrendRatingTier(tier: FormulaRatingTier | null): boolean {
  return tier === 'strong_bull' || tier === 'bull';
}

export function isSidewaysRatingTier(tier: FormulaRatingTier | null): boolean {
  return tier === 'neutral';
}

export function isDowntrendRatingTier(tier: FormulaRatingTier | null): boolean {
  return tier === 'bear' || tier === 'strong_bear';
}

export function ratingTierForTrendScore(
  score: number,
  thresholds: TrendScoreTierThresholds,
): FormulaRatingTier | null {
  return ratingTierFromTrendScore(score, thresholds);
}

/** Client formula bands: Sideways is (score_mixed_low, score_mixed_high], not score 2–3. */
export function matchesTrendStatusFilter(
  score: number,
  filter: TrendStatusFilter,
  thresholds: TrendScoreTierThresholds,
): boolean {
  if (filter === 'all') return true;
  const tier = ratingTierForTrendScore(score, thresholds);
  if (filter === 'up') return isUptrendRatingTier(tier);
  if (filter === 'flat') return isSidewaysRatingTier(tier);
  if (filter === 'down') return isDowntrendRatingTier(tier);
  return true;
}

export function trendStatusSummary(
  scores: number[],
  thresholds: TrendScoreTierThresholds,
): { upN: number; sidewaysN: number; dnN: number; avg: string } {
  let upN = 0;
  let sidewaysN = 0;
  let dnN = 0;
  for (const score of scores) {
    const tier = ratingTierForTrendScore(score, thresholds);
    if (isUptrendRatingTier(tier)) upN += 1;
    else if (isSidewaysRatingTier(tier)) sidewaysN += 1;
    else if (isDowntrendRatingTier(tier)) dnN += 1;
  }
  const avg = scores.length
    ? (scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(1)
    : '—';
  return { upN, sidewaysN, dnN, avg };
}
