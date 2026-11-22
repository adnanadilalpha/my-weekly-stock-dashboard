-- Momentum Picks V2 — additive only (Admin SoT). Safe alongside sheet mirrors.
-- Staging reads/writes these tables behind NEXT_PUBLIC_MOMENTUM_V2; production
-- keeps sheet tables until cutover.

create table if not exists public.momentum_week_current (
  id int primary key default 1 check (id = 1),
  year int not null,
  week int not null check (week >= 1 and week <= 53),
  week_start date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.momentum_week_current is
  'Singleton open/closed Current Week header for MWS Momentum Picks (Admin SoT).';

create table if not exists public.momentum_week_current_picks (
  id uuid primary key default gen_random_uuid(),
  week_id int not null references public.momentum_week_current (id) on delete cascade default 1,
  strategy text not null check (strategy in ('dow', 'large_cap', 'nasdaq')),
  ticker text,
  direction text check (direction is null or direction in ('long', 'short')),
  week_open numeric,
  stop_loss_pct numeric,
  take_profit_pct numeric,
  current_price numeric,
  return_5d numeric,
  return_stop_loss numeric,
  comments text,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  unique (week_id, strategy)
);

create index if not exists momentum_week_current_picks_week_id_idx
  on public.momentum_week_current_picks (week_id);

comment on table public.momentum_week_current_picks is
  'Exactly three strategies (Dow, Large Cap, Nasdaq) for the open Current Week.';

create table if not exists public.momentum_track_weeks (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  week int not null check (week >= 1 and week <= 53),
  week_start date not null,
  pick1_ticker text,
  pick1_direction text check (pick1_direction is null or pick1_direction in ('long', 'short')),
  pick1_return_5d numeric,
  pick1_return_stop_loss numeric,
  pick2_ticker text,
  pick2_direction text check (pick2_direction is null or pick2_direction in ('long', 'short')),
  pick2_return_5d numeric,
  pick2_return_stop_loss numeric,
  pick3_ticker text,
  pick3_direction text check (pick3_direction is null or pick3_direction in ('long', 'short')),
  pick3_return_5d numeric,
  pick3_return_stop_loss numeric,
  weekly_avg_5d numeric,
  weekly_avg_stop_loss numeric,
  cumulative_5d numeric,
  cumulative_stop_loss numeric,
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (year, week)
);

create index if not exists momentum_track_weeks_year_week_idx
  on public.momentum_track_weeks (year desc, week desc);

create index if not exists momentum_track_weeks_week_start_idx
  on public.momentum_track_weeks (week_start desc);

comment on table public.momentum_track_weeks is
  'Closed weekly Momentum Picks history (seeded from Excel, then Admin Close Week).';

alter table public.momentum_week_current enable row level security;
alter table public.momentum_week_current_picks enable row level security;
alter table public.momentum_track_weeks enable row level security;

drop policy if exists momentum_week_current_select_public on public.momentum_week_current;
create policy momentum_week_current_select_public on public.momentum_week_current
  for select to anon, authenticated using (true);

drop policy if exists momentum_week_current_picks_select_public on public.momentum_week_current_picks;
create policy momentum_week_current_picks_select_public on public.momentum_week_current_picks
  for select to anon, authenticated using (true);

drop policy if exists momentum_track_weeks_select_public on public.momentum_track_weeks;
create policy momentum_track_weeks_select_public on public.momentum_track_weeks
  for select to anon, authenticated using (true);

-- Writes only via service role (admin server actions). No insert/update/delete for anon/authenticated.
