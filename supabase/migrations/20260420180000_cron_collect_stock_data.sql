-- Schedule stock data collection every hour.
-- The edge function self-chains in batches of 60 until all stale tickers are processed.
--
-- Prerequisites: pg_cron and pg_net extensions must be enabled on this project.
-- Enable them in the Supabase dashboard: Database → Extensions → pg_cron / pg_net
--
-- The x-edge-secret value must match the EDGE_FN_SECRET edge function secret.
-- Store it once as a db setting so the cron job can read it:
--
--   ALTER DATABASE postgres SET app.edge_fn_secret = 'your-secret-here';
--
-- Then run this migration.

select cron.schedule(
  'collect-stock-data-hourly',
  '0 * * * *',  -- every hour on the hour
  $$
  select net.http_post(
    url      := 'https://ugkvcliwkdzaeafgkafr.supabase.co/functions/v1/update-stock-data',
    headers  := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-edge-secret', current_setting('app.edge_fn_secret', true)
    ),
    body     := '{"triggered_by":"cron"}'::jsonb
  ) as request_id;
  $$
);
