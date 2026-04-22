// Pure calculation helpers: returns, EMAs, score, labels.
// All formulas mirror the Google Sheets pipeline.

export type FormulaParams = {
  weight_1m_return: number;
  weight_3m_return: number;
  weight_vs_1y_high: number;
  weight_vs_9ema: number;
  weight_vs_30ema: number;
  threshold_1m_bull: number;
  threshold_1m_bear: number;
  threshold_3m_bull: number;
  threshold_3m_bear: number;
  threshold_1yh_strong: number;
  threshold_1yh_weak: number;
  ema_weekly_short: number;
  ema_weekly_long: number;
  ema_daily_short: number;
  ema_daily_long: number;
  score_strong: number;
  score_mixed_high: number;
  score_mixed_low: number;
  score_weak: number;
  extended_threshold: number;
  benchmark_leading: number;
  benchmark_lagging: number;
};

export function pctReturn(current: number, prior: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return null;
  return (current - prior) / prior;
}

export function distanceFrom52wHigh(current: number, high: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(high) || high === 0) return null;
  return (current - high) / high; // negative when below the high
}

/** Standard EMA using close prices chronological (oldest → newest). */
export function ema(values: number[], period: number): number | null {
  if (!Array.isArray(values) || values.length < period || period < 1) return null;
  const k = 2 / (period + 1);
  // Seed with SMA of first `period` values.
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

function componentScore3(value: number | null, bull: number, bear: number): number {
  // Map to 0,1,2,3 scale (bearish = 0, neutral = 1.5, bullish = 3) so that
  // SUMPRODUCT / 3 * 5 produces 0..5.
  if (value === null) return 1.5;
  if (value >= bull) return 3;
  if (value <= bear) return 0;
  return 1.5;
}

function highComponentScore(value: number | null, strong: number, weak: number): number {
  // For 1y-high: value is negative number (e.g. -0.05 = 5% below high).
  // strong = -0.05 (close to high), weak = -0.10 (far below).
  if (value === null) return 1.5;
  if (value >= strong) return 3;
  if (value <= weak) return 0;
  return 1.5;
}

function emaComponentScore(priceVsEma: number | null): number {
  // priceVsEma = (price - ema)/ema. Positive = above.
  if (priceVsEma === null) return 1.5;
  if (priceVsEma > 0) return 3;
  if (priceVsEma < 0) return 0;
  return 1.5;
}

export type ScoreInputs = {
  return1m: number | null;
  return3m: number | null;
  vs1yHigh: number | null;
  priceVsShortEma: number | null;
  priceVsLongEma: number | null;
};

/** SUMPRODUCT(weights[], components[]) / 3 * 5  → 0..5 score. */
export function trendScore(inputs: ScoreInputs, p: FormulaParams): number {
  const components = [
    { score: componentScore3(inputs.return1m, p.threshold_1m_bull, p.threshold_1m_bear), weight: p.weight_1m_return },
    { score: componentScore3(inputs.return3m, p.threshold_3m_bull, p.threshold_3m_bear), weight: p.weight_3m_return },
    { score: highComponentScore(inputs.vs1yHigh, p.threshold_1yh_strong, p.threshold_1yh_weak), weight: p.weight_vs_1y_high },
    { score: emaComponentScore(inputs.priceVsShortEma), weight: p.weight_vs_9ema },
    { score: emaComponentScore(inputs.priceVsLongEma), weight: p.weight_vs_30ema },
  ];
  const sumProduct = components.reduce((s, c) => s + c.score * c.weight, 0);
  const raw = (sumProduct / 3) * (5 / components.reduce((s, c) => s + c.weight, 0));
  // normalize: /3 * 5 using a 5-component equal-weight model; when weights differ,
  // we normalize by total weight so the max remains 5.
  return Math.max(0, Math.min(5, Number.isFinite(raw) ? raw : 0));
}

export type RatingLabelMap = {
  strong_bull: string;
  bull: string;
  neutral: string;
  bear: string;
  strong_bear: string;
};

export const DEFAULT_RATING_LABELS: RatingLabelMap = {
  strong_bull: 'Strong Bull',
  bull: 'Bull',
  neutral: 'Neutral',
  bear: 'Bear',
  strong_bear: 'Strong Bear',
};

export function ratingLabel(score: number, p: FormulaParams, labels?: Partial<RatingLabelMap>): string {
  const L: RatingLabelMap = { ...DEFAULT_RATING_LABELS, ...labels };
  if (score >= p.score_strong) return L.strong_bull;
  if (score >= p.score_mixed_high) return L.bull;
  if (score >= p.score_mixed_low) return L.neutral;
  if (score >= p.score_weak) return L.bear;
  return L.strong_bear;
}

export function ratingOutlook(score: number, p: FormulaParams): 'Bullish' | 'Neutral' | 'Bearish' {
  if (score >= p.score_mixed_high) return 'Bullish';
  if (score >= p.score_weak) return 'Neutral';
  return 'Bearish';
}
