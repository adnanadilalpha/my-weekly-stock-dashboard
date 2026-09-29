-- Past positions (analysis archive) + one open lot per ticker.
-- Soft-close holdings instead of hard-delete as the primary exit path.

alter table public.user_portfolio_holdings
  add column if not exists status text not null default 'open',
  add column if not exists closed_at timestamptz,
  add column if not exists exit_date date,
  add column if not exists exit_price numeric,
  add column if not exists exit_notes text;

alter table public.user_portfolio_holdings
  drop constraint if exists user_portfolio_holdings_status_check;

alter table public.user_portfolio_holdings
  add constraint user_portfolio_holdings_status_check
  check (status in ('open', 'closed'));

-- Allow multiple closed archives of the same ticker; only one open row.
alter table public.user_portfolio_holdings
  drop constraint if exists user_portfolio_holdings_portfolio_id_ticker_key;

create unique index if not exists user_portfolio_holdings_one_open_per_ticker
  on public.user_portfolio_holdings (portfolio_id, ticker)
  where status = 'open';

create index if not exists user_portfolio_holdings_portfolio_status_idx
  on public.user_portfolio_holdings (portfolio_id, status);

comment on column public.user_portfolio_holdings.status is
  'open = active book; closed = past position kept for analysis';
comment on column public.user_portfolio_holdings.cost_basis is
  'Average entry cost per share';
comment on column public.user_portfolio_holdings.shares is
  'Number of shares held (open) or last held (closed)';
comment on column public.user_portfolio_holdings.cash_invested is
  'Derived cash = shares × avg entry when both set; else manual cash';
comment on column public.user_portfolio_holdings.exit_price is
  'Price used when closing the position for realized return display';
