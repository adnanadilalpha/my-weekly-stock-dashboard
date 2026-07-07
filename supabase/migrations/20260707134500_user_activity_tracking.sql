-- Real user activity: heartbeats (sessions) + discrete interaction events.
-- Replaces unreliable auth last_sign_in_at for admin "who is active" metrics.

-- ---------------------------------------------------------------------------
-- Sessions (heartbeat / presence)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_activity_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_key text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  app_mode text,
  current_page text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT user_activity_sessions_user_session_key UNIQUE (user_id, session_key)
);

COMMENT ON TABLE public.user_activity_sessions IS
  'Per-tab presence via client heartbeats. last_seen_at updated while user is actively using the app.';

CREATE INDEX IF NOT EXISTS user_activity_sessions_last_seen_idx
  ON public.user_activity_sessions (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS user_activity_sessions_user_last_seen_idx
  ON public.user_activity_sessions (user_id, last_seen_at DESC);

-- ---------------------------------------------------------------------------
-- Events (page views, ticker views, filters, etc.)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_key text,
  event_type text NOT NULL,
  event_name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_activity_events IS
  'Discrete user interaction events for admin behaviour analytics.';

CREATE INDEX IF NOT EXISTS user_activity_events_created_at_idx
  ON public.user_activity_events (created_at DESC);

CREATE INDEX IF NOT EXISTS user_activity_events_user_created_idx
  ON public.user_activity_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_activity_events_type_created_idx
  ON public.user_activity_events (event_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: users write own rows; admin reads via service role only
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_activity_sessions_insert_own
  ON public.user_activity_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_activity_sessions_update_own
  ON public.user_activity_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_activity_sessions_select_own
  ON public.user_activity_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY user_activity_events_insert_own
  ON public.user_activity_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON TABLE public.user_activity_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.user_activity_events FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_activity_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_activity_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_activity_sessions TO authenticated;
GRANT INSERT ON TABLE public.user_activity_events TO authenticated;

-- Realtime for admin activity dashboard live refresh
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activity_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activity_events;
