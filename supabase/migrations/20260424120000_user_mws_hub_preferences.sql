-- Per-user MWS hub layout: section order, visibility, personalized tickers (synced across devices).

create table if not exists public.user_mws_hub_preferences (
  user_id uuid not null primary key references auth.users (id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.user_mws_hub_preferences is 'MWS hub UI prefs: order, hidden sections, personalTickers (max 20); JSON matches app HubPrefs type.';

create index if not exists user_mws_hub_preferences_updated_at_idx
  on public.user_mws_hub_preferences (updated_at desc);

alter table public.user_mws_hub_preferences enable row level security;

-- SELECT: own row only
create policy "user_mws_hub_preferences_select_own"
  on public.user_mws_hub_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

-- INSERT: own user_id only
create policy "user_mws_hub_preferences_insert_own"
  on public.user_mws_hub_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- UPDATE: own row (upsert conflict update needs select + update per Postgres RLS)
create policy "user_mws_hub_preferences_update_own"
  on public.user_mws_hub_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
