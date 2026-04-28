-- Rating display strings (edge function + admin UI). Thresholds remain in formula_settings (score_*).
create table if not exists public.formula_rating_labels (
  tier text primary key check (tier in ('strong_bull', 'bull', 'neutral', 'bear', 'strong_bear')),
  label text not null,
  description text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.formula_rating_labels (tier, label, description) values
  ('strong_bull', 'Strong Bull', 'Positive momentum — trending above key EMAs and strong composite score.'),
  ('bull', 'Bull', 'Constructive bias — composite score in the upper mid range.'),
  ('neutral', 'Neutral', 'Balanced positioning — mixed signals across components.'),
  ('bear', 'Bear', 'Cautious bias — composite score in the lower mid range.'),
  ('strong_bear', 'Strong Bear', 'Defensive — weak composite score vs thresholds.')
on conflict (tier) do nothing;

-- Singleton admin preferences for API & Data screen (Figma: provider, refresh, toggles, rate limit).
create table if not exists public.admin_api_config (
  id smallint primary key default 1 check (id = 1),
  preferred_provider text not null default 'finnhub',
  refresh_interval_seconds int not null default 900 check (refresh_interval_seconds between 30 and 86400),
  auto_retry boolean not null default true,
  cache_responses boolean not null default true,
  realtime_updates boolean not null default false,
  rate_limit_rpm int not null default 60 check (rate_limit_rpm between 1 and 100000),
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.admin_api_config (id) values (1)
on conflict (id) do nothing;
