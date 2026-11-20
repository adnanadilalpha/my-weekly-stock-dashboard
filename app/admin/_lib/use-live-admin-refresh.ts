'use client';

import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';

type RealtimeSpec = {
  schema: string;
  table: string;
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
};

type UseLiveAdminRefreshInput = {
  enabled?: boolean;
  pollingMs?: number;
  throttleMs?: number;
  channelName: string;
  getAccessToken: () => Promise<string>;
  refresh: () => Promise<void> | void;
  realtime?: RealtimeSpec[];
};

function realtimeKey(specs: RealtimeSpec[]): string {
  return specs
    .map((s) => `${s.schema}.${s.table}.${s.event ?? '*'}`)
    .sort()
    .join('|');
}

/**
 * Keeps admin pages fresh for long-lived tabs.
 * Pass `enabled: false` when the page is hidden so background tabs don't
 * starve the active page's server-action queue.
 */
export function useLiveAdminRefresh({
  enabled = true,
  pollingMs = 45_000,
  throttleMs = 4_000,
  channelName,
  getAccessToken,
  refresh,
  realtime = [],
}: UseLiveAdminRefreshInput) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const lastRunRef = useRef(0);
  const realtimeRef = useRef(realtime);
  realtimeRef.current = realtime;
  const specsKey = realtimeKey(realtime);

  const runThrottledRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRunRef.current < throttleMs) return;
    lastRunRef.current = now;
    void refreshRef.current();
  }, [throttleMs]);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const specs = realtimeRef.current;

    const onVisible = () => {
      if (document.visibilityState === 'visible') runThrottledRefresh();
    };
    const onFocus = () => runThrottledRefresh();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    const intervalId = window.setInterval(() => {
      if (disposed) return;
      if (document.visibilityState !== 'visible') return;
      runThrottledRefresh();
    }, pollingMs);

    const setupRealtime = async () => {
      if (specs.length === 0) return;
      try {
        const token = await getAccessToken();
        if (disposed) return;
        supabase.realtime.setAuth(token);

        let ch: any = supabase.channel(channelName);
        for (const spec of specs) {
          ch = ch.on(
            'postgres_changes',
            {
              event: spec.event ?? '*',
              schema: spec.schema,
              table: spec.table,
            },
            () => runThrottledRefresh()
          );
        }
        // Don't refresh on SUBSCRIBED — that re-fired loads on every channel recreate.
        channel = ch.subscribe();
      } catch {
        // Polling + focus/visibility continue as fallback.
      }
    };

    void setupRealtime();

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [channelName, enabled, getAccessToken, pollingMs, specsKey, runThrottledRefresh]);
}
