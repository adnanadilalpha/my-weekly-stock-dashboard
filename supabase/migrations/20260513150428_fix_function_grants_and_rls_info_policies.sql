-- Remove explicit EXECUTE for anon/authenticated on trigger helper; deny policies for service-only tables (lint 0008).

revoke all on function public.fn_admin_notify_new_authorized_user() from anon, authenticated;
grant execute on function public.fn_admin_notify_new_authorized_user() to postgres, service_role;

revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated, service_role;

create policy admin_api_config_deny_anon on public.admin_api_config
  for all to anon using (false) with check (false);
create policy admin_api_config_deny_authenticated on public.admin_api_config
  for all to authenticated using (false) with check (false);

create policy authorized_users_deny_anon on public.authorized_users
  for all to anon using (false) with check (false);
create policy authorized_users_deny_authenticated on public.authorized_users
  for all to authenticated using (false) with check (false);

create policy ticker_import_candidates_deny_anon on public.ticker_import_candidates
  for all to anon using (false) with check (false);
create policy ticker_import_candidates_deny_authenticated on public.ticker_import_candidates
  for all to authenticated using (false) with check (false);
