import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './supabase-env';

const { url: supabaseUrl, anonKey: supabaseAnonKey } = getSupabaseConfig();

/** Custom fetch so Supabase REST always gets Accept: application/json (avoids 406) */
const supabaseFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: supabaseFetch },
});

