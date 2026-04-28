-- In-app admin notification stream + triggers for allowlist joins and pipeline runs.

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_notifications_created_at_idx
  ON public.admin_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_notifications_unread_idx
  ON public.admin_notifications (created_at DESC)
  WHERE read_at IS NULL;

COMMENT ON TABLE public.admin_notifications IS 'Admin-only activity feed; accessed via service role server actions only.';

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_notifications FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_notifications TO service_role;

-- ---------------------------------------------------------------------------
-- Triggers: new authorized user
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_admin_notify_new_authorized_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_notifications (type, title, body, metadata)
  VALUES (
    'user_joined',
    'New authorized user',
    format('%s was added to the allowlist (%s).', NEW.email, coalesce(NEW.role::text, 'User')),
    jsonb_build_object(
      'authorized_user_id', NEW.id,
      'email', NEW.email,
      'role', NEW.role
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_notify_authorized_users_ai ON public.authorized_users;
CREATE TRIGGER trg_admin_notify_authorized_users_ai
  AFTER INSERT ON public.authorized_users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_admin_notify_new_authorized_user();

-- Ticker / pipeline completion notifications are inserted from Edge (collect-stock-data)
-- when a full session finishes, not from triggers on api_health_log (avoids spam on chained batches).
-- See migration 20260425190000_ticker_notifications_from_edge_only.sql on existing projects.
