import { supabase } from '../supabase-client';
import type { HubPrefs } from '../mws-hub-prefs';
import { DEFAULT_HUB_PREFS, normalizeHubPrefs } from '../mws-hub-prefs';

export async function fetchMwsHubPreferences(userId: string): Promise<HubPrefs> {
  const { data, error } = await supabase
    .from('user_mws_hub_preferences')
    .select('prefs')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('fetchMwsHubPreferences', error);
    throw error;
  }
  if (!data?.prefs) return { ...DEFAULT_HUB_PREFS, order: [...DEFAULT_HUB_PREFS.order] };
  return normalizeHubPrefs(data.prefs);
}

export async function upsertMwsHubPreferences(userId: string, prefs: HubPrefs): Promise<void> {
  const { error } = await supabase.from('user_mws_hub_preferences').upsert(
    {
      user_id: userId,
      prefs: prefs as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    console.error('upsertMwsHubPreferences', error);
    throw error;
  }
}
