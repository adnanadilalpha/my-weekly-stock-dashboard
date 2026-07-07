'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase-client';
import { resolveActivityPage } from '@/lib/activity/labels';
import { shouldTrackEvent } from '@/lib/activity/track-policy';
import type { ActivityContext, ActivityEventPayload } from '@/lib/activity/types';

const HEARTBEAT_MS = 60_000;
const IDLE_MS = 5 * 60_000;
const SESSION_STORAGE_KEY = 'mws.activity.session_key.v1';

type ActivityTrackerApi = {
  trackEvent: (event: ActivityEventPayload) => void;
};

const ActivityContext = createContext<ActivityTrackerApi | null>(null);

export function useActivity() {
  return useContext(ActivityContext);
}

function getOrCreateSessionKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const key =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_STORAGE_KEY, key);
    return key;
  } catch {
    return `sess_${Date.now()}`;
  }
}

type ActivityProviderProps = {
  enabled: boolean;
  context: ActivityContext;
  children: ReactNode;
};

export function ActivityProvider({ enabled, context, children }: ActivityProviderProps) {
  const sessionKeyRef = useRef('');
  const queueRef = useRef<ActivityEventPayload[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInteractionRef = useRef(Date.now());
  const lastPageRef = useRef<string | null>(null);
  const contextRef = useRef(context);
  contextRef.current = context;

  const sendPayload = useCallback(
    async (opts: { heartbeat?: boolean; events?: ActivityEventPayload[]; keepalive?: boolean }) => {
      if (!enabled || !sessionKeyRef.current) return;

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      const ctx = contextRef.current;
      const currentPage = resolveActivityPage(ctx);
      const body = {
        sessionKey: sessionKeyRef.current,
        heartbeat: opts.heartbeat
          ? {
              sessionKey: sessionKeyRef.current,
              appMode: ctx.appMode,
              currentPage,
              metadata: ctx.portfolioPage ? { portfolioPage: ctx.portfolioPage } : {},
            }
          : undefined,
        events: opts.events,
      };

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      try {
        await fetch('/api/activity', {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          keepalive: Boolean(opts.keepalive),
        });
      } catch {
        // Best-effort telemetry — never block UX.
      }
    },
    [enabled],
  );

  const flushQueue = useCallback(() => {
    if (queueRef.current.length === 0) return;
    const batch = queueRef.current.splice(0, 25);
    void sendPayload({ events: batch });
  }, [sendPayload]);

  const trackEvent = useCallback(
    (event: ActivityEventPayload) => {
      if (!enabled || !shouldTrackEvent(event)) return;
      lastInteractionRef.current = Date.now();
      queueRef.current.push(event);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        flushQueue();
      }, 400);
    },
    [enabled, flushQueue],
  );

  const api = useMemo(() => ({ trackEvent }), [trackEvent]);

  useEffect(() => {
    if (!enabled) return;

    sessionKeyRef.current = getOrCreateSessionKey();

    const onActivity = () => {
      lastInteractionRef.current = Date.now();
    };
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity, { passive: true });
    window.addEventListener('scroll', onActivity, { passive: true });

    const heartbeatId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastInteractionRef.current > IDLE_MS) return;
      void sendPayload({ heartbeat: true });
    }, HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        lastInteractionRef.current = Date.now();
        void sendPayload({ heartbeat: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    const onUnload = () => {
      flushQueue();
      void sendPayload({ heartbeat: true, keepalive: true });
    };
    window.addEventListener('pagehide', onUnload);

    void sendPayload({ heartbeat: true });

    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('scroll', onActivity);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onUnload);
      window.clearInterval(heartbeatId);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [enabled, flushQueue, sendPayload, trackEvent]);

  useEffect(() => {
    if (!enabled) return;
    const page = resolveActivityPage(context);
    if (lastPageRef.current === page) return;
    lastPageRef.current = page;
    trackEvent({
      eventType: 'page_view',
      eventName: page,
      metadata: {
        appMode: context.appMode,
        portfolioPage: context.portfolioPage,
      },
    });
    void sendPayload({ heartbeat: true });
  }, [context, enabled, sendPayload, trackEvent]);

  return <ActivityContext.Provider value={api}>{children}</ActivityContext.Provider>;
}
