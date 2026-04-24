'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { getAppEnv } from '@/lib/supabase-env';
import { whoAmIAction, type AdminWhoAmI } from '../_actions/session';

type Status = 'loading' | 'anon' | 'not-admin' | 'admin' | 'error';

export type AdminSession = {
  status: Status;
  admin: AdminWhoAmI | null;
  error: string | null;
  /** Returns the current access token or throws if no session. */
  getAccessToken: () => Promise<string>;
  signOut: () => Promise<void>;
};

type CachedVerdict = {
  userId: string;
  email: string;
  isAdmin: boolean;
  verifiedAt: number;
};

const CACHE_KEY = 'mws.admin.verdict.v1';
// Cached verdict is trusted for this long before a silent background re-check.
// Short enough that demotions take effect quickly, long enough to avoid churn on tab switches.
const CACHE_TTL_MS = 5 * 60 * 1000;
// Temporarily disabled — use real login even in dev.
const isDevBypassEnabled = false;
const devAdmin: AdminWhoAmI = { email: 'dev-admin@local', userId: 'dev-admin' };

function readCache(userId: string): CachedVerdict | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedVerdict;
    if (parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(v: CachedVerdict) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(v));
  } catch {
    // Ignore (private mode, quota, etc.)
  }
}

function clearCache() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* noop */
  }
}

export function useAdminSession(): AdminSession {
  const [status, setStatus] = useState<Status>('loading');
  const [admin, setAdmin] = useState<AdminWhoAmI | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verifiedUserIdRef = useRef<string | null>(null);

  const getAccessToken = useCallback(async () => {
    if (isDevBypassEnabled) return 'dev-bypass';
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token;
    if (!t) throw new Error('No active session.');
    return t;
  }, []);

  const signOut = useCallback(async () => {
    if (isDevBypassEnabled) {
      setAdmin(devAdmin);
      setStatus('admin');
      setError(null);
      return;
    }
    clearCache();
    verifiedUserIdRef.current = null;
    await supabase.auth.signOut();
    setAdmin(null);
    setStatus('anon');
  }, []);

  useEffect(() => {
    if (isDevBypassEnabled) {
      setAdmin(devAdmin);
      setStatus('admin');
      setError(null);
      return;
    }

    let cancelled = false;

    // Verify against the server. If `silent` is true, do NOT flip UI to 'loading'
    // — we already have a trusted cached verdict and are refreshing in the background.
    async function verify(token: string, userId: string, userEmail: string, silent: boolean) {
      if (!silent) setStatus('loading');
      const res = await whoAmIAction(token);
      if (cancelled) return;

      if (res.ok) {
        writeCache({
          userId,
          email: res.data.email,
          isAdmin: true,
          verifiedAt: Date.now(),
        });
        verifiedUserIdRef.current = userId;
        setAdmin(res.data);
        setStatus('admin');
        setError(null);
      } else if (res.code === 'not_admin') {
        writeCache({ userId, email: userEmail, isAdmin: false, verifiedAt: Date.now() });
        verifiedUserIdRef.current = userId;
        setAdmin(null);
        setStatus('not-admin');
      } else if (res.code === 'no_token' || res.code === 'invalid_token') {
        clearCache();
        verifiedUserIdRef.current = null;
        setAdmin(null);
        setStatus('anon');
      } else if (!silent) {
        setError(res.error);
        setStatus('error');
      }
      // Silent failure: keep showing cached verdict; next event will retry.
    }

    async function resolve(silentIfCached: boolean) {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        clearCache();
        verifiedUserIdRef.current = null;
        if (cancelled) return;
        setAdmin(null);
        setStatus('anon');
        return;
      }

      const userId = session.user.id;
      const userEmail = session.user.email ?? '';
      const cached = readCache(userId);
      const fresh = cached && Date.now() - cached.verifiedAt < CACHE_TTL_MS;

      // If cached verdict is fresh, render it immediately — no flash.
      if (cached) {
        verifiedUserIdRef.current = userId;
        if (cached.isAdmin) {
          setAdmin({ email: cached.email, userId: cached.userId });
          setStatus('admin');
        } else {
          setAdmin(null);
          setStatus('not-admin');
        }
        setError(null);
        if (fresh) return; // trusted — done
        // Stale: verify in background without flashing.
        void verify(session.access_token, userId, userEmail, /* silent */ true);
        return;
      }

      // No cache for this user — visible verification.
      await verify(session.access_token, userId, userEmail, silentIfCached);
    }

    void resolve(false);

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Ignore token refreshes — they don't change identity or role.
      if (event === 'TOKEN_REFRESHED') return;

      if (event === 'SIGNED_OUT' || !session) {
        clearCache();
        verifiedUserIdRef.current = null;
        setAdmin(null);
        setStatus('anon');
        return;
      }

      // SIGNED_IN / USER_UPDATED / INITIAL_SESSION with a session.
      // If the signed-in user matches what we've already verified, skip — resolve() already ran.
      if (verifiedUserIdRef.current === session.user.id) return;

      void resolve(false);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { status, admin, error, getAccessToken, signOut };
}
