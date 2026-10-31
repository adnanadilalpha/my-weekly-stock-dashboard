import 'server-only';
import { getAdminSupabase } from '@/lib/server/supabase-admin';

/** App Store / Play Store review accounts — mobile only. */
export const STORE_REVIEW_EMAILS = new Set([
  'weeklystockapple@icloud.com',
  'weeklystockgoogle@gmail.com',
]);

export function isStoreReviewEmail(email: string): boolean {
  return STORE_REVIEW_EMAILS.has(email.toLowerCase().trim());
}

/**
 * Whether mobile store-review instant sign-in is allowed.
 * Defaults to true if the row is missing (safe for review season).
 * Fail closed (false) only when we can read an explicit disabled flag.
 */
export async function isStoreReviewLoginEnabled(): Promise<boolean> {
  try {
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('app_settings')
      .select('store_review_login_enabled')
      .eq('id', 1)
      .maybeSingle();
    if (error) {
      // Table missing / transient — keep review login available.
      console.warn('[store-review] settings read failed; defaulting enabled', error.message);
      return true;
    }
    if (!data) return true;
    return data.store_review_login_enabled !== false;
  } catch (e) {
    console.warn('[store-review] settings read threw; defaulting enabled', e);
    return true;
  }
}
