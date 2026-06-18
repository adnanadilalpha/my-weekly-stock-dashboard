-- Align trend formula with client spec (27.04.2026): weights, admin labels, rating names.

-- Trend score weights (10% / 20% / 30% / 20% / 20%).
update public.formula_settings
set
  value = 0.10,
  default_value = 0.10,
  label = 'Price vs 9-period EMA',
  description = 'Trend weight for price vs 9-day (daily) or 9-week (weekly) EMA. Client default 10%.'
where key = 'weight_1m_return';

update public.formula_settings
set
  value = 0.20,
  default_value = 0.20,
  label = 'Price vs 21/30-period EMA',
  description = 'Trend weight for price vs 21-day (daily) or 30-week (weekly) EMA. Client default 20%.'
where key = 'weight_3m_return';

update public.formula_settings
set
  value = 0.30,
  default_value = 0.30,
  label = '9 vs 21/30 EMA spread',
  description = 'Trend weight for short vs long EMA cross (most important). Client default 30%. Not used for performance scoring.'
where key = 'weight_vs_1y_high';

update public.formula_settings
set
  value = 0.20,
  default_value = 0.20,
  label = 'Slope of 9-period EMA',
  description = 'Trend weight for 9-day/week EMA slope vs 5 bars ago. Client default 20%.'
where key = 'weight_vs_9ema';

update public.formula_settings
set
  value = 0.20,
  default_value = 0.20,
  label = 'Slope of 21/30-period EMA',
  description = 'Trend weight for 21-day or 30-week EMA slope vs 5 bars ago. Client default 20%.'
where key = 'weight_vs_30ema';

-- Clarify performance-only return thresholds (unchanged values; clearer admin copy).
update public.formula_settings
set description = 'Performance only: 1-month return bull threshold (not used in trend score).'
where key = 'threshold_1m_bull';

update public.formula_settings
set description = 'Performance only: 1-month return bear threshold (not used in trend score).'
where key = 'threshold_1m_bear';

update public.formula_settings
set description = 'Performance only: 3-month return bull threshold (not used in trend score).'
where key = 'threshold_3m_bull';

update public.formula_settings
set description = 'Performance only: 3-month return bear threshold (not used in trend score).'
where key = 'threshold_3m_bear';

update public.formula_settings
set description = 'Performance only: vs 1-year high strong threshold (not used in trend score).'
where key = 'threshold_1yh_strong';

update public.formula_settings
set description = 'Performance only: vs 1-year high weak threshold (not used in trend score).'
where key = 'threshold_1yh_weak';

-- Client rating labels (revert prod "Strong Performer / Bull" naming).
update public.formula_rating_labels
set
  label = 'Strong Uptrend',
  description = 'Momentum is strongly aligned to the upside with clear trend leadership.'
where tier = 'strong_bull';

update public.formula_rating_labels
set
  label = 'Uptrend',
  description = 'Trend remains positive with constructive follow-through above key averages.'
where tier = 'bull';

update public.formula_rating_labels
set
  label = 'Sideways',
  description = 'Mixed signals with no decisive directional edge.'
where tier = 'neutral';

update public.formula_rating_labels
set
  label = 'Downtrend',
  description = 'Bearish pressure is present with price below key moving averages.'
where tier = 'bear';

update public.formula_rating_labels
set
  label = 'Strong Downtrend',
  description = 'Heavy downside alignment with persistent bearish momentum.'
where tier = 'strong_bear';
