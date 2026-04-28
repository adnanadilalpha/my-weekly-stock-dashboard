create table if not exists public.formula_trend_templates (
  tier text not null check (tier in ('strong_bull', 'bull', 'neutral', 'bear', 'strong_bear')),
  outlook text not null check (outlook in ('Extended', 'Stable', 'Cooling', 'Reversing', 'Firming', 'Softening', 'Warming')),
  timeframe text not null check (timeframe in ('Weekly', 'Daily')),
  description text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (tier, outlook, timeframe)
);

create table if not exists public.formula_performance_templates (
  strength text not null check (strength in ('Strong', 'Mixed', 'Weak')),
  distance_to_highs text not null check (distance_to_highs in ('Close to Highs', 'Medium distance to Highs', 'Far from Highs')),
  benchmark_relation text not null check (benchmark_relation in ('Leading', 'In line', 'Lagging')),
  label text not null,
  description text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (strength, distance_to_highs, benchmark_relation)
);

insert into public.formula_trend_templates (tier, outlook, timeframe, description)
values
  ('strong_bull', 'Extended', 'Weekly', 'Momentum is undoubtedly aligned to the upside, with price well above both EMAs. The trend is powerful but stretched, showing signs of short-term overextension. A brief pause or pullback would be typical before trend continuation.'),
  ('strong_bull', 'Extended', 'Daily', 'Momentum is undoubtedly aligned to the upside, with price well above both EMAs. The trend is powerful but stretched, showing signs of short-term overextension. A brief pause or pullback would be typical before trend continuation.'),
  ('strong_bull', 'Stable', 'Weekly', 'Momentum signals are fully aligned to the upside, with price trading above both EMAs. Price action is healthy, confirming trend strength with limited signs of exhaustion. Continuation is the base case as long as price holds above the 9-week EMA, which serves as the short-term anchor.'),
  ('strong_bull', 'Stable', 'Daily', 'Momentum signals are fully aligned to the upside, with price trading above both EMAs. Price action is healthy, confirming trend strength with limited signs of exhaustion. Continuation is the base case as long as price holds above the 9-day EMA, which serves as the short-term anchor.'),
  ('strong_bull', 'Cooling', 'Weekly', 'The broader trend remains bullish, with price still above the medium-term EMAs. Momentum has cooled as price slipped below the 9-week EMA. A test of the 30-week EMA could be in play and will be a key level for bulls to defend to maintain trend structure.'),
  ('strong_bull', 'Cooling', 'Daily', 'The broader trend remains bullish, with price still above the medium-term EMAs. Momentum has cooled as price slipped below or close to the 9-day EMA. A test of the 21-day EMA could be in play and will be a key level for bulls to defend to maintain trend structure.'),
  ('strong_bull', 'Reversing', 'Weekly', 'The broader uptrend has weakened materially, with price breaking below the 30-week EMA. Momentum is shifting to the downside, and buyers are losing control. A confirmed reversal would occur if the 9-week EMA crosses below the 30-week EMA.'),
  ('strong_bull', 'Reversing', 'Daily', 'The broader uptrend has weakened materially, with price breaking below the 21-day EMA. Momentum is shifting to the downside, and buyers are losing control. A confirmed reversal would occur if the 9-day EMA crosses below the 21-day EMA.'),
  ('bull', 'Extended', 'Weekly', 'Momentum is firmly positive, with price well above both EMAs. The trend has run hot in recently, showing signs of short-term overextension. A period of consolidation or sideways movement would be healthy to let averages catch up and sustain the uptrend.'),
  ('bull', 'Extended', 'Daily', 'Momentum is firmly positive, with price well above both EMAs. The trend has run hot in recently, showing signs of short-term overextension. A period of consolidation or sideways movement would be healthy to let averages catch up and sustain the uptrend.'),
  ('bull', 'Stable', 'Weekly', 'The uptrend is intact, with price holding above key EMAs. Momentum is steady, showing balanced strength without signs of excess. As long as price stays above the 9-week EMA, the trend should continue gradually higher.'),
  ('bull', 'Stable', 'Daily', 'The uptrend is intact, with price holding above key EMAs. Momentum is steady, showing balanced strength without signs of excess. As long as price stays above the 9-day EMA, the trend should continue gradually higher.'),
  ('bull', 'Cooling', 'Weekly', 'The uptrend remains mostly positive, but momentum has slowed down recently. Price has slipped below the 9-week EMA and needs to reclaim it to avoid deeper consolidation. Failure to do so would likely trigger a test of the 30-week EMA, a key trend line for bulls to defend.'),
  ('bull', 'Cooling', 'Daily', 'The uptrend remains mostly positive, but momentum has slowed down recently. Price has slipped below the 9-day EMA and needs to reclaim it to avoid deeper consolidation. Failure to do so would likely trigger a test of the 21-day EMA, a key trend line for bulls to defend.'),
  ('bull', 'Reversing', 'Weekly', 'The broader uptrend has weakened materially, with price breaking below the 30-week EMA. Momentum is shifting to the downside, and buyers are losing control. A confirmed reversal would occur if the 9-week EMA crosses below the 30-week EMA.'),
  ('bull', 'Reversing', 'Daily', 'The broader uptrend has weakened materially, with price breaking below the 21-day EMA. Momentum is shifting to the downside, and buyers are losing control. A confirmed reversal would occur if the 9-day EMA crosses below the 21-day EMA.'),
  ('neutral', 'Firming', 'Weekly', 'The broader trend is mixed but momentum is slighlty tilting to the upside. Price is holding above the 30-week EMA, suggesting buyers are in modest control. A sustained move above recent highs could confirm a new upward phase.'),
  ('neutral', 'Firming', 'Daily', 'The broader trend is mixed, but momentum is slighlty tilting to the upside. Price is holding above the 21-day EMA, suggesting buyers are in modest control. A sustained move above recent highs could confirm a new upward phase.'),
  ('neutral', 'Stable', 'Weekly', 'Momentum signals are mixed, with price action lacking clear direction. A decisive and sustain move above or below the 30-week EMA would be a first indication on how this get resolved. Patience is important here to avoid being trapped in a fake move.'),
  ('neutral', 'Stable', 'Daily', 'Momentum signals are mixed, with price action lacking clear direction. A decisive and sustain move above or below the 21-day EMA would be a first indication on how this get resolved. Patience is important here to avoid being trapped in a fake move.'),
  ('neutral', 'Softening', 'Weekly', 'Momentum is mixed, but signals are somewhat weakening. Price has slipped below the 30-week EMA, giving a slight downside bias. Further weakness below recent lows would confirm the downtrend direction.'),
  ('neutral', 'Softening', 'Daily', 'Momentum is mixed, but signals are somewhat weakening. Price has slipped below the 21-day EMA, giving a slight downside bias. Further weakness below recent lows would confirm the downtrend direction.'),
  ('bear', 'Extended', 'Weekly', 'Momentum is bearish, though price has fallen too far, too fast. Conditions are stretched, increasing the odds of a short-term bounce or consolidation. Any recovery should be viewed as temporary unless price reclaims both EMAs.'),
  ('bear', 'Extended', 'Daily', 'Momentum is bearish, though price has fallen too far, too fast. Conditions are stretched, increasing the odds of a short-term bounce or consolidation. Any recovery should be viewed as temporary unless price reclaims both EMAs.'),
  ('bear', 'Stable', 'Weekly', 'The trend is bearish, with price below both EMAs. Momentum is steady on the downside, showing balanced weakness. Continuation lower remains likely unless price reclaims the 9-week EMA.'),
  ('bear', 'Stable', 'Daily', 'The trend is bearish, with price below both EMAs. Momentum is steady on the downside, showing balanced weakness. Continuation lower remains likely unless price reclaims the 9-day EMA.'),
  ('bear', 'Warming', 'Weekly', 'The broader downtrend remains, but momentum is improving modestly. Price is testing or slightly above the 9-week EMA. Holding above that level could open the door for a run towards the 30-week EMA, usually the real test for bulls.'),
  ('bear', 'Warming', 'Daily', 'The broader downtrend remains, but momentum is improving modestly. Price is testing or slightly above the 9-day EMA. Holding above that level could open the door for a run towards the 21-day EMA, usually the real test for bulls.'),
  ('bear', 'Reversing', 'Weekly', 'The downtrend is losing steam, with price reclaiming the 30-week EMA. Momentum is attempting to turn positive, hinting at an early trend shift. A confirmed reversal would occur if the 9-week EMA crosses back above the 21-week EMA.'),
  ('bear', 'Reversing', 'Daily', 'The downtrend is losing steam, with price reclaiming the 21-day EMA. Momentum is attempting to turn positive, hinting at an early trend shift. A confirmed reversal would occur if the 9-day EMA crosses back above the 21-day EMA.'),
  ('strong_bear', 'Extended', 'Weekly', 'Momentum is largely negative, but the move has become stretched. Price is trading well below both EMAs, suggesting downside exhaustion may be near. A short-term rebound or consolidation would be typical before a potential other leg down.'),
  ('strong_bear', 'Extended', 'Daily', 'Momentum is largely negative, but the move has become stretched. Price is trading well below both EMAs, suggesting downside exhaustion may be near. A short-term rebound or consolidation would be typical before a potential other leg down.'),
  ('strong_bear', 'Stable', 'Weekly', 'Momentum signals are aligned to the downside, with price trading well below both EMAs. The trend is stable, showing no signs of exhaustion yet. Continuation lower is likely as long as price stays below the 9-week EMA.'),
  ('strong_bear', 'Stable', 'Daily', 'Momentum signals are aligned to the downside, with price trading well below both EMAs. The trend is stable, showing no signs of exhaustion yet. Continuation lower is likely as long as price stays below the 9-day EMA.'),
  ('strong_bear', 'Warming', 'Weekly', 'The dominant downtrend is intact, but momentum is improving. Price has reclaimed the 9-week EMA, and a sustained recovery above that level could trigger a broader rebound phase.'),
  ('strong_bear', 'Warming', 'Daily', 'The dominant downtrend is intact, but momentum is improving. Price has reclaimed the 9-day EMA, and a sustained recovery above that level could trigger a broader rebound phase.'),
  ('strong_bear', 'Reversing', 'Weekly', 'The downtrend is losing steam, with price reclaiming the 30-week EMA. Momentum is attempting to turn positive, hinting at an early trend shift. A confirmed reversal would occur if the 9-week EMA crosses back above the 21-week EMA.'),
  ('strong_bear', 'Reversing', 'Daily', 'The downtrend is losing steam, with price reclaiming the 21-day EMA. Momentum is attempting to turn positive, hinting at an early trend shift. A confirmed reversal would occur if the 9-day EMA crosses back above the 21-day EMA.')
on conflict (tier, outlook, timeframe) do update
set description = excluded.description;

insert into public.formula_performance_templates (strength, distance_to_highs, benchmark_relation, label, description)
select
  strength,
  distance_to_highs,
  benchmark_relation,
  case strength
    when 'Strong' then 'Strong performer'
    when 'Mixed' then 'Mixed performer'
    else 'Weak performer'
  end as label,
  description
from (
  values
    ('Strong','Close to Highs','Leading','has performed strongly recently, leading vs. main benchmarks. It is trading close to its 1-year high, indicating low overhead resistance and limited selling pressure above current levels.'),
    ('Strong','Close to Highs','In line','has posted solid recent results, performing broadly in line with main benchmarks. It remains close to its 1-year high, indicating steady absolute performance and continued price stability within an elevated range.'),
    ('Strong','Close to Highs','Lagging','has performed well recently but slightly trails main benchmarks. It remains close to its 1-year high, reflecting stable absolute performance despite softer relative returns.'),
    ('Strong','Medium distance to Highs','Leading','has performed well recently, leading main benchmarks. It trades a moderate distance below its 1-year high, suggesting the stock still has some ground to recover before retesting prior highs.'),
    ('Strong','Medium distance to Highs','In line','has posted steady recent returns, performing broadly in line with benchmarks. It trades a moderate distance below its 1-year high, suggesting the stock still has some ground to recover before retesting prior highs.'),
    ('Strong','Medium distance to Highs','Lagging','has performed well but continues to lag main benchmarks. It trades a moderate distance below its 1-year high, suggesting the stock still has some ground to recover before retesting prior highs.'),
    ('Strong','Far from Highs','Leading','has performed well and leads main benchmarks. However, it trades well below its 1-year high, showing that there is still considerable ground to cover before retesting prior peaks.'),
    ('Strong','Far from Highs','In line','has strengthened recently, performing in line with benchmarks. It trades well below its 1-year high, suggesting plenty of resistance still ahead despite the recovery.'),
    ('Strong','Far from Highs','Lagging','has posted gains recently but still lags main benchmarks. It trades well below its 1-year high, suggesting a long recovery path ahead with multiple resistance levels to clear.'),
    ('Mixed','Close to Highs','Leading','has shown uneven results but continues to lead benchmarks. Its position close to the 1-year high highlights steady underlying strength.'),
    ('Mixed','Close to Highs','In line','has posted mixed results, roughly matching benchmark performance. Trading close to its 1-year high points to limited directional change in recent weeks.'),
    ('Mixed','Close to Highs','Lagging','has delivered mixed performance and lags benchmarks. Remaining close to its 1-year high indicates that the stock is consolidating after prior strength.'),
    ('Mixed','Medium distance to Highs','Leading','has shown uneven performance but continues to lead main benchmarks. It trades a moderate distance below its 1-year high, suggesting the stock still has some ground to recover before retesting prior highs.'),
    ('Mixed','Medium distance to Highs','In line','has posted mixed results, performing broadly in line with benchmarks. It trades a moderate distance below its 1-year high, suggesting the stock still has some ground to recover before retesting prior highs.'),
    ('Mixed','Medium distance to Highs','Lagging','has delivered mixed results and slightly lags main benchmarks. It trades a moderate distance below its 1-year high, suggesting the stock still has some ground to recover before retesting prior highs.'),
    ('Mixed','Far from Highs','Leading','has shown uneven performance but remains ahead of main benchmarks. It trades well below its 1-year high, suggesting the stock is still in recovery mode with notable resistance levels above.'),
    ('Mixed','Far from Highs','In line','has delivered uneven performance, performing broadly in line with benchmarks. It trades well below its 1-year high, indicating extended drawdowns with resistance that could limit near-term progress.'),
    ('Mixed','Far from Highs','Lagging','has posted mixed results and lags benchmarks. It trades well below its 1-year high, reflecting a sizeable drawdown with heavy resistance overhead.'),
    ('Weak','Close to Highs','Leading','has underperformed recently but remains ahead of main benchmarks. Despite short-term weakness, it trades close to its 1-year high, showing resilience relative to peers.'),
    ('Weak','Close to Highs','In line','has softened recently, though broadly in line with benchmarks. Staying close to its 1-year high suggests only a modest pullback so far.'),
    ('Weak','Close to Highs','Lagging','has softened recently and trails benchmarks, though it remains close to its 1-year high. This suggests the recent underperformance was still within a somewhat elevated price range.'),
    ('Weak','Medium distance to Highs','Leading','has underperformed recently but continues to lead main benchmarks. It trades a moderate distance below its 1-year high, suggesting the stock still has some ground to recover before retesting prior highs.'),
    ('Weak','Medium distance to Highs','In line','has softened recently, performing broadly in line with benchmarks. It trades a moderate distance below its 1-year high, suggesting the stock still has some ground to recover before retesting prior highs.'),
    ('Weak','Medium distance to Highs','Lagging','has weakened recently and trails main benchmarks. It trades a moderate distance below its 1-year high, suggesting the stock still has some ground to recover before retesting prior highs.'),
    ('Weak','Far from Highs','Leading','has weakened recently but continues to lead main benchmarks. It trades well below its 1-year high, reflecting a large drawdown and significant resistance to overcome on any recovery journey.'),
    ('Weak','Far from Highs','In line','has softened recently, performing broadly in line with benchmarks. It trades well below its 1-year high, pointing to ongoing weakness and considerable resistance above current levels.'),
    ('Weak','Far from Highs','Lagging','has underperformed recently and trails main benchmarks. It trades well below its 1-year high, highlighting a deep drawdown and persistent resistance that may cap rebounds.')
) as seed(strength, distance_to_highs, benchmark_relation, description)
on conflict (strength, distance_to_highs, benchmark_relation) do update
set label = excluded.label,
    description = excluded.description;
