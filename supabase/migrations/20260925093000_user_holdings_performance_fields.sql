-- Additive: user-entered performance fields on holdings (MWS Portfolio-style)
alter table public.user_portfolio_holdings
  add column if not exists start_date date,
  add column if not exists cash_invested numeric,
  add column if not exists returns_pct numeric,
  add column if not exists hit_rate numeric,
  add column if not exists avg_gain numeric,
  add column if not exists avg_loss numeric,
  add column if not exists net_avg_return numeric,
  add column if not exists cagr numeric,
  add column if not exists holding_days numeric;

comment on column public.user_portfolio_holdings.cash_invested is
  'User-entered cash invested (same role as performance_recap column_5).';
comment on column public.user_portfolio_holdings.returns_pct is
  'User-entered returns as decimal ratio (0.05 = 5%).';
