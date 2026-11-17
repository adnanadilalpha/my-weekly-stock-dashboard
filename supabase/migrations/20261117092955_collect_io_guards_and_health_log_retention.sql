-- Disk IO budget guards:
-- 1) Exclusive lock so hourly collect sessions cannot overlap (was 2–3× concurrent).
-- 2) Retention prune for api_health_log (grew to ~350k rows / 118MB from per-batch inserts).
-- 3) Daily prune cron so write churn does not accumulate again.

create table if not exists public.edge_job_locks (
  job text primary key,
  session_id text not null,
  heartbeat_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

comment on table public.edge_job_locks is
  'Mutex for long-running edge jobs (collect-stock-data). Heartbeat must stay fresh or another session may steal the lock.';

alter table public.edge_job_locks enable row level security;
revoke all on table public.edge_job_locks from public;
revoke all on table public.edge_job_locks from anon, authenticated;
grant all on table public.edge_job_locks to service_role;

create or replace function public.try_acquire_edge_job_lock(
  p_job text,
  p_session_id text,
  p_stale_after_seconds integer default 180,
  p_meta jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.edge_job_locks%rowtype;
  stale_before timestamptz := now() - make_interval(secs => greatest(30, p_stale_after_seconds));
begin
  if p_job is null or length(trim(p_job)) = 0 then
    raise exception 'job required';
  end if;
  if p_session_id is null or length(trim(p_session_id)) = 0 then
    raise exception 'session_id required';
  end if;

  select * into existing from public.edge_job_locks where job = p_job for update;

  if not found then
    insert into public.edge_job_locks (job, session_id, heartbeat_at, started_at, meta)
    values (p_job, p_session_id, now(), now(), coalesce(p_meta, '{}'::jsonb));
    return true;
  end if;

  -- Same session renews.
  if existing.session_id = p_session_id then
    update public.edge_job_locks
    set heartbeat_at = now(),
        meta = coalesce(p_meta, existing.meta)
    where job = p_job;
    return true;
  end if;

  -- Steal only if heartbeat is stale (crashed worker).
  if existing.heartbeat_at < stale_before then
    update public.edge_job_locks
    set session_id = p_session_id,
        heartbeat_at = now(),
        started_at = now(),
        meta = coalesce(p_meta, '{}'::jsonb)
    where job = p_job;
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.heartbeat_edge_job_lock(
  p_job text,
  p_session_id text,
  p_meta jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.edge_job_locks
  set heartbeat_at = now(),
      meta = coalesce(p_meta, meta)
  where job = p_job
    and session_id = p_session_id;
  return found;
end;
$$;

create or replace function public.release_edge_job_lock(
  p_job text,
  p_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.edge_job_locks
  where job = p_job
    and session_id = p_session_id;
  return found;
end;
$$;

revoke all on function public.try_acquire_edge_job_lock(text, text, integer, jsonb) from public;
revoke all on function public.heartbeat_edge_job_lock(text, text, jsonb) from public;
revoke all on function public.release_edge_job_lock(text, text) from public;
grant execute on function public.try_acquire_edge_job_lock(text, text, integer, jsonb) to service_role;
grant execute on function public.heartbeat_edge_job_lock(text, text, jsonb) to service_role;
grant execute on function public.release_edge_job_lock(text, text) to service_role;

create or replace function public.prune_api_health_log(
  p_keep_days integer default 14
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
  cutoff timestamptz := now() - make_interval(days => greatest(1, p_keep_days));
begin
  with doomed as (
    select id
    from public.api_health_log
    where run_at < cutoff
    order by run_at asc
    limit 50000
  )
  delete from public.api_health_log h
  using doomed d
  where h.id = d.id;
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.prune_api_health_log(integer) from public;
grant execute on function public.prune_api_health_log(integer) to service_role;

-- Immediate prune (chunked; safe to re-run).
select public.prune_api_health_log(14);

-- Daily prune at 04:15 UTC.
select cron.unschedule('prune-api-health-log-daily')
where exists (select 1 from cron.job where jobname = 'prune-api-health-log-daily');

select cron.schedule(
  'prune-api-health-log-daily',
  '15 4 * * *',
  $$select public.prune_api_health_log(14);$$
);
