update public.formula_rating_labels
set label = 'Strong Performer',
    description = 'Positive momentum — trending above key EMAs and strong composite score.'
where tier = 'strong_bull';

update public.formula_rating_labels
set label = 'Bull',
    description = 'Constructive bias — composite score in the upper mid range.'
where tier = 'bull';

update public.formula_rating_labels
set label = 'Neutral',
    description = 'Balanced positioning — mixed signals across components staying consistent.'
where tier = 'neutral';

update public.formula_rating_labels
set label = 'Bear',
    description = 'Cautious bias — composite score in the lower mid range.'
where tier = 'bear';

update public.formula_rating_labels
set label = 'Strong Bear',
    description = 'Defensive — weak composite score vs thresholds.'
where tier = 'strong_bear';

update public.formula_settings
set default_value = 1.6,
    value = 1.6
where key = 'score_mixed_low';
