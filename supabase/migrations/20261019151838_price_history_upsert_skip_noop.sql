-- Skip no-op price_history conflict updates to cut WAL / index write I/O.
-- Collect runs re-upsert ~330 bars per ticker; most closes are unchanged.

create or replace function public.upsert_price_history(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;

  insert into public.price_history as ph (ticker, bar_date, interval, close)
  select
    (r->>'ticker')::text,
    (r->>'bar_date')::date,
    (r->>'interval')::text,
    (r->>'close')::numeric
  from jsonb_array_elements(p_rows) as r
  on conflict (ticker, bar_date, interval)
  do update set
    close = excluded.close,
    updated_at = now()
  where ph.close is distinct from excluded.close;

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.upsert_price_history(jsonb) is
  'Bulk upsert price_history; ON CONFLICT updates only when close IS DISTINCT FROM the existing value.';

revoke all on function public.upsert_price_history(jsonb) from public;
revoke all on function public.upsert_price_history(jsonb) from anon, authenticated;
grant execute on function public.upsert_price_history(jsonb) to service_role;
