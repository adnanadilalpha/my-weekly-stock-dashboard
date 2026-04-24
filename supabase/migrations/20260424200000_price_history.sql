-- Price history: stores daily and weekly close prices for each tracked ticker.
-- Populated by the update-stock-data / collect-stock-data Edge Functions.
-- Used by the app to render real price charts with EMA overlays.

create table if not exists public.price_history (
  id          bigint generated always as identity primary key,
  ticker      text        not null,
  bar_date    date        not null,
  interval    text        not null check (interval in ('daily', 'weekly')),
  close       numeric(18, 6) not null,
  updated_at  timestamptz not null default now(),
  constraint price_history_ticker_date_interval_key unique (ticker, bar_date, interval)
);

comment on table public.price_history is
  'Daily and weekly close prices per ticker, written by Edge Functions for chart rendering.';

create index if not exists price_history_ticker_interval_date_idx
  on public.price_history (ticker, interval, bar_date desc);

-- RLS: authenticated users can read their own charts; service role writes.
alter table public.price_history enable row level security;

create policy "price_history_select_authenticated"
  on public.price_history
  for select
  to authenticated
  using (true);

-- Service role (Edge Function) writes are not subject to RLS when using service_role key.
