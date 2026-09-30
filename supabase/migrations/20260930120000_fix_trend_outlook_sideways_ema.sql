-- Fix Sideways Softening/Firming: require EMA-cross ±1.5% AND price on the matching
-- side of the long EMA. Cross-alone mismatched cases like IWM (cross +2% while below
-- 30w EMA showed Firming; client expects Stable).

create or replace function public.compute_trend_outlook(
  score double precision,
  price_vs_short double precision,
  price_vs_long double precision,
  ema_cross double precision,
  mixed_high double precision,
  mixed_low double precision,
  ext double precision
) returns text
language plpgsql
immutable
as $$
declare
  cross_band double precision := 0.015;
begin
  if score is null or price_vs_short is null or price_vs_long is null then
    return null;
  end if;
  if ext is null or ext <= 0 or ext > 1 then
    ext := 0.05;
  end if;

  if score > mixed_high then
    if price_vs_short > ext then return 'Extended'; end if;
    if price_vs_long < 0 then return 'Reversing'; end if;
    if price_vs_short < 0 then return 'Cooling'; end if;
    return 'Stable';
  end if;

  if score > mixed_low then
    if ema_cross is not null and ema_cross <= -cross_band and price_vs_long < 0 then
      return 'Softening';
    end if;
    if ema_cross is not null and ema_cross >= cross_band and price_vs_long > 0 then
      return 'Firming';
    end if;
    return 'Stable';
  end if;

  if price_vs_short < -ext then return 'Extended'; end if;
  if price_vs_long > 0 then return 'Reversing'; end if;
  if price_vs_short > 0 then return 'Warming'; end if;
  return 'Stable';
end;
$$;

create or replace function public.apply_trend_outlook_before_write()
returns trigger
language plpgsql
as $$
declare
  mixed_high double precision := 2.7;
  mixed_low double precision := 1.6;
  ext double precision := 0.05;
  daily_out text;
  weekly_out text;
  daily_tier text;
  weekly_tier text;
  tmpl text;
begin
  select value::double precision into mixed_high from public.formula_settings where key = 'score_mixed_high';
  select value::double precision into mixed_low from public.formula_settings where key = 'score_mixed_low';
  select value::double precision into ext from public.formula_settings where key = 'extended_threshold';
  if ext is null or ext <= 0 or ext > 1 then ext := 0.05; end if;
  if mixed_high is null then mixed_high := 2.7; end if;
  if mixed_low is null then mixed_low := 1.6; end if;

  daily_out := public.compute_trend_outlook(
    NEW.daily_trend_score, NEW.daily_price_vs_9ema, NEW.daily_price_vs_21ema, NEW.daily_ema9_vs_21ema,
    mixed_high, mixed_low, ext
  );
  if daily_out is not null then NEW.daily_outlook := daily_out; end if;

  weekly_out := public.compute_trend_outlook(
    NEW.weekly_trend_score, NEW.weekly_price_vs_9ema, NEW.weekly_price_vs_30ema, NEW.weekly_ema9_vs_30ema,
    mixed_high, mixed_low, ext
  );
  if weekly_out is not null then NEW.weekly_outlook := weekly_out; end if;

  daily_tier := case
    when lower(coalesce(NEW.daily_rating,'')) like '%strong%up%' then 'strong_bull'
    when lower(coalesce(NEW.daily_rating,'')) like '%uptrend%' or lower(coalesce(NEW.daily_rating,'')) like '%bull%' then 'bull'
    when lower(coalesce(NEW.daily_rating,'')) like '%sideways%' or lower(coalesce(NEW.daily_rating,'')) like '%neutral%' then 'neutral'
    when lower(coalesce(NEW.daily_rating,'')) like '%strong%down%' or (lower(coalesce(NEW.daily_rating,'')) like '%strong%' and lower(coalesce(NEW.daily_rating,'')) like '%bear%') then 'strong_bear'
    when lower(coalesce(NEW.daily_rating,'')) like '%downtrend%' or lower(coalesce(NEW.daily_rating,'')) like '%bear%' then 'bear'
    else null
  end;
  if daily_tier is not null and NEW.daily_outlook is not null then
    select description into tmpl from public.formula_trend_templates
    where tier = daily_tier and outlook = NEW.daily_outlook and timeframe = 'Daily' limit 1;
    if tmpl is not null and length(trim(tmpl)) > 0 then NEW.daily_trend_description := tmpl; end if;
  end if;

  weekly_tier := case
    when lower(coalesce(NEW.weekly_rating,'')) like '%strong%up%' then 'strong_bull'
    when lower(coalesce(NEW.weekly_rating,'')) like '%uptrend%' or lower(coalesce(NEW.weekly_rating,'')) like '%bull%' then 'bull'
    when lower(coalesce(NEW.weekly_rating,'')) like '%sideways%' or lower(coalesce(NEW.weekly_rating,'')) like '%neutral%' then 'neutral'
    when lower(coalesce(NEW.weekly_rating,'')) like '%strong%down%' or (lower(coalesce(NEW.weekly_rating,'')) like '%strong%' and lower(coalesce(NEW.weekly_rating,'')) like '%bear%') then 'strong_bear'
    when lower(coalesce(NEW.weekly_rating,'')) like '%downtrend%' or lower(coalesce(NEW.weekly_rating,'')) like '%bear%' then 'bear'
    else null
  end;
  if weekly_tier is not null and NEW.weekly_outlook is not null then
    select description into tmpl from public.formula_trend_templates
    where tier = weekly_tier and outlook = NEW.weekly_outlook and timeframe = 'Weekly' limit 1;
    if tmpl is not null and length(trim(tmpl)) > 0 then NEW.weekly_trend_description := tmpl; end if;
  end if;

  return NEW;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['mega_caps','other_stocks','market_segments','sectors']
  loop
    execute format('drop trigger if exists apply_trend_outlook_biu on %I', t);
    execute format(
      'create trigger apply_trend_outlook_biu before insert or update on %I for each row execute function public.apply_trend_outlook_before_write()',
      t
    );
  end loop;
end $$;
