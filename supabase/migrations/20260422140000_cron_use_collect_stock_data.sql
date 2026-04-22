-- Hourly stock collection: call dedicated `collect-stock-data` edge function
-- (import uses `import-candidates-data` separately so jobs do not share one deployment).

select cron.unschedule('collect-stock-data-hourly');

select cron.schedule(
  'collect-stock-data-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url      := 'https://ugkvcliwkdzaeafgkafr.supabase.co/functions/v1/collect-stock-data',
    headers  := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-edge-secret', current_setting('app.edge_fn_secret', true)
    ),
    body     := '{"triggered_by":"cron"}'::jsonb
  ) as request_id;
  $$
);
