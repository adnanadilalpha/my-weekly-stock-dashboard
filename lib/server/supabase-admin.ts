import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../supabase-env';

if (typeof window !== 'undefined') {
  throw new Error('lib/server/supabase-admin.ts imported from a browser context.');
}

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client. Bypasses RLS.
 * Only use from Server Actions or route handlers, never from client components.
 */
export function getAdminSupabase(): SupabaseClient {
  if (cached) return cached;
  const { url, serviceRoleKey } = getSupabaseConfig({ requireServiceRole: true });
  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/**
 * Build a supabase client that acts as the caller (RLS-enforced) using their
 * access token. Used to verify identity in admin-guarded actions.
 */
export function getSupabaseAsUser(accessToken: string): SupabaseClient {
  const { url, anonKey } = getSupabaseConfig();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
