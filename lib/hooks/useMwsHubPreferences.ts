import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase-client';
import type { HubPrefs } from '../mws-hub-prefs';
import { DEFAULT_HUB_PREFS } from '../mws-hub-prefs';
import { fetchMwsHubPreferences, upsertMwsHubPreferences } from '../queries/mws-hub-preferences';

const SAVE_DEBOUNCE_MS = 650;

export function useMwsHubPreferences() {
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefsState] = useState<HubPrefs>(() => ({
    ...DEFAULT_HUB_PREFS,
    order: [...DEFAULT_HUB_PREFS.order],
  }));
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSaveUntilLoaded = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user?.id) {
          setUserId(null);
          setPrefsState({ ...DEFAULT_HUB_PREFS, order: [...DEFAULT_HUB_PREFS.order] });
          setLoaded(true);
          skipSaveUntilLoaded.current = false;
          return;
        }
        setUserId(user.id);
        const remote = await fetchMwsHubPreferences(user.id);
        if (cancelled) return;
        setPrefsState(remote);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e : new Error(String(e)));
          setPrefsState({ ...DEFAULT_HUB_PREFS, order: [...DEFAULT_HUB_PREFS.order] });
        }
      } finally {
        if (!cancelled) {
          setLoaded(true);
          queueMicrotask(() => {
            skipSaveUntilLoaded.current = false;
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const flushSave = useCallback(async () => {
    if (!userId || skipSaveUntilLoaded.current) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    try {
      setSaveError(null);
      await upsertMwsHubPreferences(userId, prefsRef.current);
    } catch (e) {
      setSaveError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [userId]);

  useEffect(() => {
    if (!loaded || !userId || skipSaveUntilLoaded.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void upsertMwsHubPreferences(userId, prefsRef.current).catch((e) =>
        setSaveError(e instanceof Error ? e : new Error(String(e))),
      );
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [prefs, loaded, userId]);

  const setPrefs = useCallback((next: HubPrefs | ((prev: HubPrefs) => HubPrefs)) => {
    setPrefsState((prev) => (typeof next === 'function' ? (next as (p: HubPrefs) => HubPrefs)(prev) : next));
  }, []);

  const resetPrefs = useCallback(() => {
    setPrefsState({ ...DEFAULT_HUB_PREFS, order: [...DEFAULT_HUB_PREFS.order] });
  }, []);

  return {
    userId,
    prefs,
    setPrefs,
    resetPrefs,
    loaded,
    loadError,
    saveError,
    flushSave,
  };
}
