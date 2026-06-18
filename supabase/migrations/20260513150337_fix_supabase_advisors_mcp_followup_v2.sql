-- Splinter / Dashboard advisor fixes (RLS, portfolio policies, function search_path, EXECUTE grants).
-- pg_net cannot be moved off public (Postgres: extension does not support SET SCHEMA).

create schema if not exists extensions;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'alter extension pg_trgm set schema extensions';
  end if;
end $$;

alter function public.get_ticker_import_stats() set search_path = public;
alter function public.tg_set_updated_at() set search_path = public;

revoke all on function public.fn_admin_notify_new_authorized_user() from public;
grant execute on function public.fn_admin_notify_new_authorized_user() to postgres, service_role;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

create policy admin_notifications_deny_anon on public.admin_notifications
  for all to anon using (false) with check (false);
create policy admin_notifications_deny_authenticated on public.admin_notifications
  for all to authenticated using (false) with check (false);

drop policy if exists "Anon can manage authorized_users" on public.authorized_users;
drop policy if exists "Public can read authorized_users" on public.authorized_users;
drop policy if exists "Service role can manage authorized_users" on public.authorized_users;

alter table if exists public.authorized_users enable row level security;

drop policy if exists "Anon can manage market_segments" on public.market_segments;
drop policy if exists "Public can read market_segments" on public.market_segments;
drop policy if exists "Service role can manage market_segments" on public.market_segments;
drop policy if exists market_segments_select_public on public.market_segments;
alter table if exists public.market_segments enable row level security;
create policy market_segments_select_public on public.market_segments
  for select to anon, authenticated using (true);

drop policy if exists "Anon can manage sectors" on public.sectors;
drop policy if exists "Public can read sectors" on public.sectors;
drop policy if exists "Service role can manage sectors" on public.sectors;
drop policy if exists sectors_select_public on public.sectors;
alter table if exists public.sectors enable row level security;
create policy sectors_select_public on public.sectors
  for select to anon, authenticated using (true);

drop policy if exists "Anon can manage mega_caps" on public.mega_caps;
drop policy if exists "Public can read mega_caps" on public.mega_caps;
drop policy if exists "Service role can manage mega_caps" on public.mega_caps;
drop policy if exists mega_caps_select_public on public.mega_caps;
alter table if exists public.mega_caps enable row level security;
create policy mega_caps_select_public on public.mega_caps
  for select to anon, authenticated using (true);

drop policy if exists "Anon can manage other_stocks" on public.other_stocks;
drop policy if exists "Public can read other_stocks" on public.other_stocks;
drop policy if exists "Service role can manage other_stocks" on public.other_stocks;
drop policy if exists other_stocks_select_public on public.other_stocks;
alter table if exists public.other_stocks enable row level security;
create policy other_stocks_select_public on public.other_stocks
  for select to anon, authenticated using (true);

drop policy if exists formula_settings_modify_admin on public.formula_settings;
create policy formula_settings_insert_admin on public.formula_settings
  for insert to authenticated with check ((select is_admin()));
create policy formula_settings_update_admin on public.formula_settings
  for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy formula_settings_delete_admin on public.formula_settings
  for delete to authenticated using ((select is_admin()));

drop policy if exists formula_settings_select_auth on public.formula_settings;
create policy formula_settings_select_auth on public.formula_settings
  for select to authenticated using (true);

drop policy if exists formula_settings_select_public on public.formula_settings;

drop policy if exists api_keys_modify_admin on public.api_keys;
create policy api_keys_insert_admin on public.api_keys
  for insert to authenticated with check ((select is_admin()));
create policy api_keys_update_admin on public.api_keys
  for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy api_keys_delete_admin on public.api_keys
  for delete to authenticated using ((select is_admin()));

drop policy if exists api_keys_select_admin_metadata on public.api_keys;
create policy api_keys_select_admin_metadata on public.api_keys
  for select to authenticated using ((select is_admin()));

drop policy if exists user_ticker_preferences_admin_select on public.user_ticker_preferences;
drop policy if exists user_ticker_preferences_self_select on public.user_ticker_preferences;
drop policy if exists user_ticker_preferences_self_insert on public.user_ticker_preferences;
drop policy if exists user_ticker_preferences_self_update on public.user_ticker_preferences;
drop policy if exists user_ticker_preferences_self_delete on public.user_ticker_preferences;

create policy user_ticker_preferences_select on public.user_ticker_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id or (select is_admin()));

create policy user_ticker_preferences_insert on public.user_ticker_preferences
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_ticker_preferences_update on public.user_ticker_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_ticker_preferences_delete on public.user_ticker_preferences
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_mws_hub_preferences_select_own on public.user_mws_hub_preferences;
drop policy if exists user_mws_hub_preferences_insert_own on public.user_mws_hub_preferences;
drop policy if exists user_mws_hub_preferences_update_own on public.user_mws_hub_preferences;

create policy user_mws_hub_preferences_select_own on public.user_mws_hub_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_mws_hub_preferences_insert_own on public.user_mws_hub_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_mws_hub_preferences_update_own on public.user_mws_hub_preferences
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table if exists public.ticker_import_candidates enable row level security;
alter table if exists public.admin_api_config enable row level security;
alter table if exists public.formula_rating_labels enable row level security;
alter table if exists public.formula_performance_labels enable row level security;
alter table if exists public.formula_trend_templates enable row level security;
alter table if exists public.formula_performance_templates enable row level security;
alter table if exists public.momentum_picks_summary enable row level security;

drop policy if exists formula_rating_labels_select_public on public.formula_rating_labels;
create policy formula_rating_labels_select_public on public.formula_rating_labels
  for select to anon, authenticated using (true);

drop policy if exists formula_performance_labels_select_public on public.formula_performance_labels;
create policy formula_performance_labels_select_public on public.formula_performance_labels
  for select to anon, authenticated using (true);

drop policy if exists formula_trend_templates_select_public on public.formula_trend_templates;
create policy formula_trend_templates_select_public on public.formula_trend_templates
  for select to anon, authenticated using (true);

drop policy if exists formula_performance_templates_select_public on public.formula_performance_templates;
create policy formula_performance_templates_select_public on public.formula_performance_templates
  for select to anon, authenticated using (true);

drop policy if exists momentum_picks_summary_select_public on public.momentum_picks_summary;
create policy momentum_picks_summary_select_public on public.momentum_picks_summary
  for select to anon, authenticated using (true);
