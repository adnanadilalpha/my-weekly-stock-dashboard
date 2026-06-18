-- Move is_admin() out of public so PostgREST no longer exposes SECURITY DEFINER RPC (lint 0029).
-- Policies use (select internal.is_admin()).

create schema if not exists internal;

create or replace function internal.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  jwt_email text;
  user_role text;
begin
  jwt_email := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  if jwt_email = '' then
    return false;
  end if;

  select role into user_role
  from public.authorized_users
  where lower(email) = jwt_email
  limit 1;

  return coalesce(user_role, '') = 'Admin';
end;
$function$;

grant usage on schema internal to postgres, service_role, authenticated;
grant execute on function internal.is_admin() to postgres, service_role, authenticated;

drop policy if exists api_health_log_select_admin on public.api_health_log;
create policy api_health_log_select_admin on public.api_health_log
  for select to authenticated using ((select internal.is_admin()));

drop policy if exists formula_history_select_admin on public.formula_history;
create policy formula_history_select_admin on public.formula_history
  for select to authenticated using ((select internal.is_admin()));

drop policy if exists formula_settings_delete_admin on public.formula_settings;
drop policy if exists formula_settings_insert_admin on public.formula_settings;
drop policy if exists formula_settings_update_admin on public.formula_settings;
drop policy if exists formula_settings_select_auth on public.formula_settings;

create policy formula_settings_select_auth on public.formula_settings
  for select to authenticated using (true);
create policy formula_settings_insert_admin on public.formula_settings
  for insert to authenticated with check ((select internal.is_admin()));
create policy formula_settings_update_admin on public.formula_settings
  for update to authenticated using ((select internal.is_admin())) with check ((select internal.is_admin()));
create policy formula_settings_delete_admin on public.formula_settings
  for delete to authenticated using ((select internal.is_admin()));

drop policy if exists api_keys_insert_admin on public.api_keys;
drop policy if exists api_keys_update_admin on public.api_keys;
drop policy if exists api_keys_delete_admin on public.api_keys;
drop policy if exists api_keys_select_admin_metadata on public.api_keys;

create policy api_keys_select_admin_metadata on public.api_keys
  for select to authenticated using ((select internal.is_admin()));
create policy api_keys_insert_admin on public.api_keys
  for insert to authenticated with check ((select internal.is_admin()));
create policy api_keys_update_admin on public.api_keys
  for update to authenticated using ((select internal.is_admin())) with check ((select internal.is_admin()));
create policy api_keys_delete_admin on public.api_keys
  for delete to authenticated using ((select internal.is_admin()));

drop policy if exists user_ticker_preferences_select on public.user_ticker_preferences;
create policy user_ticker_preferences_select on public.user_ticker_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id or (select internal.is_admin()));

drop function if exists public.is_admin();
