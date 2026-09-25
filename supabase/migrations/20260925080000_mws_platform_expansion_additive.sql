-- MWS Platform Expansion — ADDITIVE ONLY
-- Safe for live prod: new nullable columns + new tables. No drops/renames.

-- ---------------------------------------------------------------------------
-- Relative strength: % from SMA 50 / SMA 200 on all ticker universe tables
-- ---------------------------------------------------------------------------
alter table public.market_segments
  add column if not exists pct_from_sma50 numeric,
  add column if not exists pct_from_sma200 numeric;

alter table public.sectors
  add column if not exists pct_from_sma50 numeric,
  add column if not exists pct_from_sma200 numeric;

alter table public.mega_caps
  add column if not exists pct_from_sma50 numeric,
  add column if not exists pct_from_sma200 numeric;

alter table public.other_stocks
  add column if not exists pct_from_sma50 numeric,
  add column if not exists pct_from_sma200 numeric;

comment on column public.market_segments.pct_from_sma50 is
  'Decimal distance of last price from SMA50: (price - sma50) / sma50. Null until edge backfill.';
comment on column public.market_segments.pct_from_sma200 is
  'Decimal distance of last price from SMA200: (price - sma200) / sma200. Null until edge backfill.';

-- ---------------------------------------------------------------------------
-- My Portfolios (user-owned; same tables for web + mobile)
-- ---------------------------------------------------------------------------
create table if not exists public.user_portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  base_currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_portfolios_user_id_idx
  on public.user_portfolios (user_id);

create table if not exists public.user_portfolio_holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.user_portfolios (id) on delete cascade,
  ticker text not null,
  display_name text,
  shares numeric,
  cost_basis numeric,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio_id, ticker)
);

create index if not exists user_portfolio_holdings_portfolio_id_idx
  on public.user_portfolio_holdings (portfolio_id);

alter table public.user_portfolios enable row level security;
alter table public.user_portfolio_holdings enable row level security;

drop policy if exists user_portfolios_select_own on public.user_portfolios;
create policy user_portfolios_select_own on public.user_portfolios
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_portfolios_insert_own on public.user_portfolios;
create policy user_portfolios_insert_own on public.user_portfolios
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_portfolios_update_own on public.user_portfolios;
create policy user_portfolios_update_own on public.user_portfolios
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_portfolios_delete_own on public.user_portfolios;
create policy user_portfolios_delete_own on public.user_portfolios
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_portfolio_holdings_select_own on public.user_portfolio_holdings;
create policy user_portfolio_holdings_select_own on public.user_portfolio_holdings
  for select to authenticated
  using (
    exists (
      select 1 from public.user_portfolios p
      where p.id = portfolio_id and p.user_id = auth.uid()
    )
  );

drop policy if exists user_portfolio_holdings_insert_own on public.user_portfolio_holdings;
create policy user_portfolio_holdings_insert_own on public.user_portfolio_holdings
  for insert to authenticated
  with check (
    exists (
      select 1 from public.user_portfolios p
      where p.id = portfolio_id and p.user_id = auth.uid()
    )
  );

drop policy if exists user_portfolio_holdings_update_own on public.user_portfolio_holdings;
create policy user_portfolio_holdings_update_own on public.user_portfolio_holdings
  for update to authenticated
  using (
    exists (
      select 1 from public.user_portfolios p
      where p.id = portfolio_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.user_portfolios p
      where p.id = portfolio_id and p.user_id = auth.uid()
    )
  );

drop policy if exists user_portfolio_holdings_delete_own on public.user_portfolio_holdings;
create policy user_portfolio_holdings_delete_own on public.user_portfolio_holdings
  for delete to authenticated
  using (
    exists (
      select 1 from public.user_portfolios p
      where p.id = portfolio_id and p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- AI chat sessions (history via Supabase; generation via platform API only)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  context_ref jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_chat_sessions_user_id_idx
  on public.ai_chat_sessions (user_id, updated_at desc);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_chat_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_messages_session_id_idx
  on public.ai_chat_messages (session_id, created_at);

alter table public.ai_chat_sessions enable row level security;
alter table public.ai_chat_messages enable row level security;

drop policy if exists ai_chat_sessions_select_own on public.ai_chat_sessions;
create policy ai_chat_sessions_select_own on public.ai_chat_sessions
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists ai_chat_sessions_insert_own on public.ai_chat_sessions;
create policy ai_chat_sessions_insert_own on public.ai_chat_sessions
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists ai_chat_sessions_update_own on public.ai_chat_sessions;
create policy ai_chat_sessions_update_own on public.ai_chat_sessions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists ai_chat_sessions_delete_own on public.ai_chat_sessions;
create policy ai_chat_sessions_delete_own on public.ai_chat_sessions
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists ai_chat_messages_select_own on public.ai_chat_messages;
create policy ai_chat_messages_select_own on public.ai_chat_messages
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists ai_chat_messages_insert_own on public.ai_chat_messages;
create policy ai_chat_messages_insert_own on public.ai_chat_messages
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists ai_chat_messages_delete_own on public.ai_chat_messages;
create policy ai_chat_messages_delete_own on public.ai_chat_messages
  for delete to authenticated
  using (auth.uid() = user_id);

-- Platform API (service role) also writes messages; clients may insert own rows
-- for optimistic UI but generation must go through /api/ai/chat.
