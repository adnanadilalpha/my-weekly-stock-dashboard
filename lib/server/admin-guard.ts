import 'server-only';
import { getAdminSupabase, getSupabaseAsUser } from './supabase-admin';

if (typeof window !== 'undefined') {
  throw new Error('lib/server/admin-guard.ts imported from a browser context.');
}

export class AdminAuthError extends Error {
  readonly code: 'no_token' | 'invalid_token' | 'not_admin';
  constructor(code: 'no_token' | 'invalid_token' | 'not_admin', message: string) {
    super(message);
    this.code = code;
  }
}

export type AdminContext = {
  email: string;
  userId: string;
};

type CacheEntry = { ctx: AdminContext; exp: number };
/** Short-lived cache so list/search/poll don't pay 2 network round-trips every time. */
const ADMIN_CTX_CACHE = new Map<string, CacheEntry>();
const ADMIN_CTX_TTL_MS = 45_000;
const ADMIN_CTX_CACHE_MAX = 200;

function cacheGet(token: string): AdminContext | null {
  const hit = ADMIN_CTX_CACHE.get(token);
  if (!hit) return null;
  if (hit.exp <= Date.now()) {
    ADMIN_CTX_CACHE.delete(token);
    return null;
  }
  return hit.ctx;
}

function cacheSet(token: string, ctx: AdminContext) {
  if (ADMIN_CTX_CACHE.size >= ADMIN_CTX_CACHE_MAX) {
    const first = ADMIN_CTX_CACHE.keys().next().value;
    if (first) ADMIN_CTX_CACHE.delete(first);
  }
  ADMIN_CTX_CACHE.set(token, { ctx, exp: Date.now() + ADMIN_CTX_TTL_MS });
}

/**
 * Verifies the access token belongs to a user whose email is in authorized_users
 * with role = 'Admin'. Returns the admin's email + auth user id.
 * Throws AdminAuthError on any failure — caller should surface a generic 403.
 */
export async function requireAdmin(accessToken: string | null | undefined): Promise<AdminContext> {
  if (!accessToken) {
    throw new AdminAuthError('no_token', 'Access token missing.');
  }

  const cached = cacheGet(accessToken);
  if (cached) return cached;

  const asUser = getSupabaseAsUser(accessToken);
  const { data: userRes, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userRes?.user?.email) {
    throw new AdminAuthError('invalid_token', 'Could not verify session.');
  }

  const email = userRes.user.email.toLowerCase();

  const admin = getAdminSupabase();
  const { data: row, error: roleErr } = await admin
    .from('authorized_users')
    .select('role')
    .ilike('email', email)
    .maybeSingle();

  if (roleErr) {
    throw new AdminAuthError('invalid_token', 'Role lookup failed.');
  }
  if (!row || row.role !== 'Admin') {
    throw new AdminAuthError('not_admin', 'Caller is not an admin.');
  }

  const ctx: AdminContext = { email, userId: userRes.user.id };
  cacheSet(accessToken, ctx);
  return ctx;
}
