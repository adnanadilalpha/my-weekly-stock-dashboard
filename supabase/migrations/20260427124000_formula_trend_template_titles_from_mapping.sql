alter table public.formula_trend_templates
  add column if not exists title text not null default '';

with mapped(tier, outlook, title, description) as (
  values
    ('strong_bull', 'Extended',  'Strong Uptrend',      'Momentum is undoubtedly aligned to the upside, with price well above both EMAs. The trend is powerful but stretched, showing signs of short-term overextension. A brief pause or pullback would be typical before trend continuation.'),
    ('strong_bull', 'Stable',    'Strong Uptrend',      'Momentum signals are fully aligned to the upside, with price trading above both EMAs. Price action is healthy, confirming trend strength with limited signs of exhaustion. Continuation is the base case as long as price holds above the 9-day EMA, which serves as the short-term anchor.'),
    ('strong_bull', 'Cooling',   'Strong Uptrend',      'The broader trend remains bullish, with price still above the medium-term EMAs. Momentum has cooled as price slipped below or close to the 9-day EMA. A test of the 21-day EMA could be in play and will be a key level for bulls to defend to maintain trend structure.'),
    ('strong_bull', 'Reversing', 'Strong Uptrend',      'The broader uptrend has weakened materially, with price breaking below the 21-day EMA. Momentum is shifting to the downside, and buyers are losing control. A confirmed reversal would occur if the 9-day EMA crosses below the 21-day EMA.'),
    ('bull',        'Extended',  'Uptrend',             'Momentum is firmly positive, with price well above both EMAs. The trend has run hot in recently, showing signs of short-term overextension. A period of consolidation or sideways movement would be healthy to let averages catch up and sustain the uptrend.'),
    ('bull',        'Stable',    'Uptrend',             'The uptrend is intact, with price holding above key EMAs. Momentum is steady, showing balanced strength without signs of excess. As long as price stays above the 9-day EMA, the trend should continue gradually higher.'),
    ('bull',        'Cooling',   'Uptrend',             'The uptrend remains mostly positive, but momentum has slowed down recently. Price has slipped below the 9-day EMA and needs to reclaim it to avoid deeper consolidation. Failure to do so would likely trigger a test of the 21-day EMA, a key trend line for bulls to defend.'),
    ('bull',        'Reversing', 'Uptrend',             'The broader uptrend has weakened materially, with price breaking below the 21-day EMA. Momentum is shifting to the downside, and buyers are losing control. A confirmed reversal would occur if the 9-day EMA crosses below the 21-day EMA.'),
    ('neutral',     'Firming',   'Sideways',            'The broader trend is mixed, but momentum is slighlty tilting to the upside. Price is holding above the 21-day EMA, suggesting buyers are in modest control. A sustained move above recent highs could confirm a new upward phase.'),
    ('neutral',     'Stable',    'Sideways',            'Momentum signals are mixed, with price action lacking clear direction. A decisive and sustain move above or below the 21-day EMA would be a first indication on how this get resolved. Patience is important here to avoid being trapped in a fake move.'),
    ('neutral',     'Softening', 'Sideways',            'Momentum is mixed, but signals are somewhat weakening. Price has slipped below the 21-day EMA, giving a slight downside bias. Further weakness below recent lows would confirm the downtrend direction.'),
    ('bear',        'Extended',  'Downtrend',           'Momentum is bearish, though price has fallen too far, too fast. Conditions are stretched, increasing the odds of a short-term bounce or consolidation. Any recovery should be viewed as temporary unless price reclaims both EMAs.'),
    ('bear',        'Stable',    'Downtrend',           'The trend is bearish, with price below both EMAs. Momentum is steady on the downside, showing balanced weakness. Continuation lower remains likely unless price reclaims the 9-day EMA.'),
    ('bear',        'Warming',   'Downtrend',           'The broader downtrend remains, but momentum is improving modestly. Price is testing or slightly above the 9-day EMA. Holding above that level could open the door for a run towards the 21-day EMA, usually the real test for bulls.'),
    ('bear',        'Reversing', 'Downtrend',           'The downtrend is losing steam, with price reclaiming the 21-day EMA. Momentum is attempting to turn positive, hinting at an early trend shift. A confirmed reversal would occur if the 9-day EMA crosses back above the 21-day EMA.'),
    ('strong_bear', 'Extended',  'Strong Downtrend',    'Momentum is largely negative, but the move has become stretched. Price is trading well below both EMAs, suggesting downside exhaustion may be near. A short-term rebound or consolidation would be typical before a potential other leg down.'),
    ('strong_bear', 'Stable',    'Strong Downtrend',    'Momentum signals arealigned to the downside, with price trading well below both EMAs. The trend is stable, showing no signs of exhaustion yet. Continuation lower is likely as long as price stays below the 9-day EMA.'),
    ('strong_bear', 'Warming',   'Strong Downtrend',    'The dominant downtrend is intact, but momentum is improving. Price has reclaimed the 9-day EMA, and a sustained recovery above that level could trigger a broader rebound phase.'),
    ('strong_bear', 'Reversing', 'Strong Downtrend',    'The downtrend is losing steam, with price reclaiming the 21-day EMA. Momentum is attempting to turn positive, hinting at an early trend shift. A confirmed reversal would occur if the 9-day EMA crosses back above the 21-day EMA.')
)
update public.formula_trend_templates t
set
  title = m.title,
  description = m.description,
  updated_at = now(),
  updated_by = coalesce(t.updated_by, 'mapping_sync')
from mapped m
where t.tier = m.tier
  and t.outlook = m.outlook;
