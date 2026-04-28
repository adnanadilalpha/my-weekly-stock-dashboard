-- Ticker pipeline notifications are inserted from the Edge function when a session
-- fully completes (not on every chained batch). Remove DB triggers on api_health_log.

DROP TRIGGER IF EXISTS trg_admin_notify_api_health_ai ON public.api_health_log;
DROP TRIGGER IF EXISTS trg_admin_notify_api_health_au ON public.api_health_log;

DROP FUNCTION IF EXISTS public.fn_admin_notify_api_health_ins();
DROP FUNCTION IF EXISTS public.fn_admin_notify_api_health_upd();
