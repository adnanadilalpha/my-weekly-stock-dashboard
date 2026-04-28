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

/**
 * Verifies the access token belongs to a user whose email is in authorized_users
 * with role = 'Admin'. Returns the admin's email + auth user id.
 * Throws AdminAuthError on any failure — caller should surface a generic 403.
 */
export async function requireAdmin(accessToken: string | null | undefined): Promise<AdminContext> {
  // Dev bypass disabled — real auth required.
  if (!accessToken) {
    throw new AdminAuthError('no_token', 'Access token missing.');
  }

  const asUser = getSupabaseAsUser(accessToken);
  const { data: userRes, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userRes?.user?.email) {
    throw new AdminAuthError('invalid_token', 'Could not verify session.');
  }

  const email = userRes.user.email.toLowerCase();

  // Check admin role via service role so RLS can't be spoofed.
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

  return { email, userId: userRes.user.id };
}
