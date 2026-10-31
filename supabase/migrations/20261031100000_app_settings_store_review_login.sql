-- App-wide settings (singleton). Store review login can be disabled from admin
-- after App Store / Play review without shipping a new mobile build.
-- Access is via service-role server actions only (no client PostgREST).

create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  store_review_login_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.app_settings (id, store_review_login_enabled)
values (1, true)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- No authenticated policies: only service_role (bypasses RLS) via admin server actions.
revoke all on public.app_settings from anon, authenticated;
grant all on public.app_settings to service_role;
