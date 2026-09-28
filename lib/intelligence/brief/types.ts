/** MWS Brief engine — versioned contract. Keep in sync with docs/MWS_BRIEF_ENGINE_SPEC.md */

export const BRIEF_ENGINE_VERSION = '1.0.0';

export type BriefComposerId =
  | 'rating'
  | 'performance'
  | 'quadrant'
  | 'portfolio_holding'
  | 'overview';

export type MwsBriefOutput = {
  version: string;
  composerId: BriefComposerId;
  title: string;
  body: string;
  bullets: string[];
  disclaimer?: string;
  sourceFields: string[];
};

export type RatingBriefInput = {
  ticker?: string | null;
  daily_trend_score?: number | null;
  daily_rating?: string | null;
  daily_outlook?: string | null;
  daily_trend_description?: string | null;
  weekly_trend_score?: number | null;
  weekly_rating?: string | null;
  weekly_outlook?: string | null;
  weekly_trend_description?: string | null;
  timeframe?: 'daily' | 'weekly';
};

export type PerformanceBriefInput = {
  ticker?: string | null;
  performance_strength?: string | null;
  daily_performance_strength?: string | null;
  distance_to_highs?: string | null;
  daily_distance_to_highs?: string | null;
  daily_performance_summary?: string | null;
  daily_performance_description?: string | null;
  '1m_percent'?: number | null;
  '3m_percent'?: number | null;
  daily_1m_percent?: number | null;
  daily_3m_percent?: number | null;
  daily_vs_spy_comparison?: string | null;
  daily_vs_benchmark_comparison?: string | null;
  daily_vs_sector_comparison?: string | null;
};

export type QuadrantId =
  | 'SYNCED_UPTREND'
  | 'PULLBACK'
  | 'BROKEN_TREND'
  | 'TURNING'
  | 'UNKNOWN';

export type QuadrantBriefInput = {
  ticker?: string | null;
  /** Preferred: decimal distance from 21-day EMA (X). */
  pct_from_21d_ema?: number | null;
  /** Preferred: decimal distance from 30-week EMA (Y). */
  pct_from_30w_ema?: number | null;
  /** @deprecated Legacy SMA axes — still accepted by quadrant composer. */
  pct_from_sma50?: number | null;
  /** @deprecated Legacy SMA axes — still accepted by quadrant composer. */
  pct_from_sma200?: number | null;
};

export type PortfolioHoldingBriefInput = {
  ticker?: string | null;
  daily_rating?: string | null;
  daily_outlook?: string | null;
  daily_trend_score?: number | null;
  daily_trend_description?: string | null;
  daily_performance_description?: string | null;
  daily_performance_summary?: string | null;
  performance_strength?: string | null;
  daily_performance_strength?: string | null;
  in_mws_coverage?: boolean;
};
