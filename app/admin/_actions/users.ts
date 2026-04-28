'use server';

import { getAdminSupabase } from '@/lib/server/supabase-admin';
import { err, ok, withAdmin, type ActionResult } from './_shared';

export type AdminUserRow = {
  id: string;
  email: string;
  role: 'Admin' | 'User' | null;
  created_at: string | null;
  updated_at: string | null;
};

export type UserStats = {
  total: number;
  admins: number;
  regular: number;
  addedThisWeek: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed) || trimmed.length > 254) return null;
  return trimmed;
}

function normalizeRole(v: unknown): 'Admin' | 'User' | null {
  if (v === 'Admin' || v === 'User') return v;
  return null;
}

export type ListUsersInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  roleFilter?: 'all' | 'admin' | 'user';
};

export type ListUsersResult = {
  users: AdminUserRow[];
  stats: UserStats;
  totalCount: number;
  page: number;
  pageSize: number;
};

const MAX_USER_PAGE = 100;
const DEFAULT_USER_PAGE = 50;

function sanitizeUserSearch(raw: string): string {
  return raw.replace(/[%_,]/g, '').trim().slice(0, 120);
}

export async function listUsersAction(
  accessToken: string,
  input?: ListUsersInput
): Promise<ActionResult<ListUsersResult>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const page = Math.max(0, Math.floor(input?.page ?? 0));
    const pageSize = Math.min(MAX_USER_PAGE, Math.max(1, Math.floor(input?.pageSize ?? DEFAULT_USER_PAGE)));
    const searchRaw = typeof input?.search === 'string' ? input.search : '';
    const search = sanitizeUserSearch(searchRaw);
    const roleFilter = input?.roleFilter ?? 'all';

    const sinceWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let listQ = admin
      .from('authorized_users')
      .select('id, email, role, created_at, updated_at', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (search) listQ = listQ.ilike('email', `%${search}%`);
    if (roleFilter === 'admin') listQ = listQ.eq('role', 'Admin');
    if (roleFilter === 'user') listQ = listQ.or('role.eq.User,role.is.null');

    const from = page * pageSize;
    const to = from + pageSize - 1;

    const [listRes, totalRes, adminsRes, weekRes] = await Promise.all([
      listQ.range(from, to),
      admin.from('authorized_users').select('id', { count: 'exact', head: true }),
      admin.from('authorized_users').select('id', { count: 'exact', head: true }).eq('role', 'Admin'),
      admin.from('authorized_users').select('id', { count: 'exact', head: true }).gte('created_at', sinceWeek),
    ]);

    if (listRes.error) return err('Failed to load users.', 'db_error');
    if (totalRes.error || adminsRes.error || weekRes.error) return err('Failed to load user stats.', 'db_error');

    const users = (listRes.data ?? []) as AdminUserRow[];
    const total = totalRes.count ?? 0;
    const admins = adminsRes.count ?? 0;
    const stats: UserStats = {
      total,
      admins,
      regular: Math.max(0, total - admins),
      addedThisWeek: weekRes.count ?? 0,
    };

    return ok({
      users,
      stats,
      totalCount: listRes.count ?? 0,
      page,
      pageSize,
    });
  });
}

type AdminClient = ReturnType<typeof getAdminSupabase>;

const AUTH_LIST_PAGE_SIZE = 1000;
const AUTH_LIST_MAX_PAGES = 50;

async function findAuthUserIdByEmail(admin: AdminClient, email: string): Promise<string | null> {
  const needle = email.trim().toLowerCase();
  for (let page = 1; page <= AUTH_LIST_MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_LIST_PAGE_SIZE });
    if (error) return null;
    const users = data?.users ?? [];
    const hit = users.find((u) => u.email?.toLowerCase() === needle);
    if (hit?.id) return hit.id;
    if (users.length < AUTH_LIST_PAGE_SIZE) return null;
  }
  return null;
}

type InsertInviteResult =
  | { ok: true; row: AdminUserRow }
  | { ok: false; code: 'duplicate' | 'db_error'; message?: string };

async function insertAuthorizedUserAndInvite(
  admin: AdminClient,
  email: string,
  role: 'Admin' | 'User'
): Promise<InsertInviteResult> {
  const { data, error } = await admin
    .from('authorized_users')
    .insert({ email, role })
    .select('id, email, role, created_at, updated_at')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, code: 'duplicate' };
    return { ok: false, code: 'db_error', message: error.message };
  }

  return { ok: true, row: data as AdminUserRow };
}

export async function createUserAction(
  accessToken: string,
  input: { email: string; role: 'Admin' | 'User' }
): Promise<ActionResult<AdminUserRow>> {
  return withAdmin(accessToken, async () => {
    const email = normalizeEmail(input.email);
    const role = normalizeRole(input.role);
    if (!email) return err('Invalid email address.', 'validation');
    if (!role) return err('Invalid role.', 'validation');

    const admin = getAdminSupabase();
    const result = await insertAuthorizedUserAndInvite(admin, email, role);
    if (!result.ok) {
      if (result.code === 'duplicate') return err('A user with that email already exists.', 'duplicate');
      return err('Failed to create user.', 'db_error');
    }
    return ok(result.row);
  });
}

export type BulkCreateRowInput = { email: string; role: 'Admin' | 'User' };

export type BulkCreateUserResultItem = {
  email: string;
  role?: 'Admin' | 'User';
  status: 'created' | 'duplicate' | 'duplicate_in_file' | 'invalid' | 'db_error' | 'created_invite_failed';
  message?: string;
};

export type BulkCreateUsersResult = {
  results: BulkCreateUserResultItem[];
  summary: {
    created: number;
    duplicate: number;
    duplicateInFile: number;
    invalid: number;
    dbErrors: number;
    inviteFailed: number;
  };
};

const MAX_BULK_USERS = 200;

export async function bulkCreateUsersAction(
  accessToken: string,
  input: { rows: BulkCreateRowInput[] }
): Promise<ActionResult<BulkCreateUsersResult>> {
  return withAdmin(accessToken, async () => {
    const rowsIn = Array.isArray(input.rows) ? input.rows : [];
    if (rowsIn.length === 0) return err('No users to add.', 'validation');
    if (rowsIn.length > MAX_BULK_USERS) {
      return err(`You can add at most ${MAX_BULK_USERS} users per import. Split into multiple files or batches.`, 'validation');
    }

    const admin = getAdminSupabase();
    const seen = new Set<string>();
    const results: BulkCreateUserResultItem[] = [];

    for (const raw of rowsIn) {
      const email = normalizeEmail(raw.email);
      const role = normalizeRole(raw.role);
      const rawEmailPreview =
        typeof raw.email === 'string' ? raw.email.trim().slice(0, 254) : String(raw.email ?? '').slice(0, 254);

      if (!email) {
        results.push({
          email: rawEmailPreview || '(empty)',
          status: 'invalid',
          message: 'Invalid email address.',
        });
        continue;
      }
      if (!role) {
        results.push({
          email,
          status: 'invalid',
          message: 'Role must be Admin or User.',
        });
        continue;
      }
      if (seen.has(email)) {
        results.push({
          email,
          role,
          status: 'duplicate_in_file',
          message: 'This email appears more than once in the import.',
        });
        continue;
      }
      seen.add(email);

      const outcome = await insertAuthorizedUserAndInvite(admin, email, role);
      if (!outcome.ok) {
        if (outcome.code === 'duplicate') {
          results.push({ email, role, status: 'duplicate' });
        } else {
          results.push({
            email,
            role,
            status: 'db_error',
            message: outcome.message ?? 'Database error.',
          });
        }
        continue;
      }
      results.push({ email, role, status: 'created' });
    }

    const summary = {
      created: results.filter((r) => r.status === 'created').length,
      duplicate: results.filter((r) => r.status === 'duplicate').length,
      duplicateInFile: results.filter((r) => r.status === 'duplicate_in_file').length,
      invalid: results.filter((r) => r.status === 'invalid').length,
      dbErrors: results.filter((r) => r.status === 'db_error').length,
      inviteFailed: results.filter((r) => r.status === 'created_invite_failed').length,
    };

    return ok({ results, summary });
  });
}

export async function updateUserRoleAction(
  accessToken: string,
  input: { id: string; role: 'Admin' | 'User' }
): Promise<ActionResult<AdminUserRow>> {
  return withAdmin(accessToken, async (ctx) => {
    const role = normalizeRole(input.role);
    if (!role) return err('Invalid role.', 'validation');
    if (typeof input.id !== 'string' || input.id.length < 10) return err('Invalid id.', 'validation');

    const admin = getAdminSupabase();

    // Prevent an admin from demoting themselves while last remaining admin.
    if (role !== 'Admin') {
      const { data: target } = await admin
        .from('authorized_users')
        .select('email')
        .eq('id', input.id)
        .maybeSingle();
      if (target?.email?.toLowerCase() === ctx.email) {
        const { count } = await admin
          .from('authorized_users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'Admin');
        if ((count ?? 0) <= 1) return err('Cannot demote the last remaining admin.', 'guard');
      }
    }

    const { data, error } = await admin
      .from('authorized_users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', input.id)
      .select('id, email, role, created_at, updated_at')
      .single();

    if (error) return err('Failed to update user.', 'db_error');
    return ok(data as AdminUserRow);
  });
}

export async function deleteUserAction(
  accessToken: string,
  input: { id: string }
): Promise<ActionResult<{ id: string }>> {
  return withAdmin(accessToken, async (ctx) => {
    if (typeof input.id !== 'string' || input.id.length < 10) return err('Invalid id.', 'validation');

    const admin = getAdminSupabase();
    const { data: target } = await admin
      .from('authorized_users')
      .select('email, role')
      .eq('id', input.id)
      .maybeSingle();

    if (!target) return err('User not found.', 'not_found');

    // Guard: cannot delete yourself; cannot delete the last admin.
    if (target.email?.toLowerCase() === ctx.email) {
      return err('You cannot delete your own account.', 'guard');
    }
    if (target.role === 'Admin') {
      const { count } = await admin
        .from('authorized_users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'Admin');
      if ((count ?? 0) <= 1) return err('Cannot delete the last remaining admin.', 'guard');
    }

    // Delete from authorized_users table first.
    const { error } = await admin.from('authorized_users').delete().eq('id', input.id);
    if (error) return err('Failed to delete user.', 'db_error');

    // Also delete from Supabase Auth so the account is fully removed.
    try {
      const authUserId = await findAuthUserIdByEmail(admin, (target as { email: string }).email);
      if (authUserId) await admin.auth.admin.deleteUser(authUserId);
    } catch {
      // Auth deletion is best-effort — the table row is already gone, so login is blocked.
    }

    return ok({ id: input.id });
  });
}

/**
 * Creates a fully-verified admin user directly in Supabase Auth (email_confirm: true,
 * no invite email sent) and adds them to the authorized_users table with role Admin.
 */
export async function createAdminWithPasswordAction(
  accessToken: string,
  input: { email: string; password: string }
): Promise<ActionResult<AdminUserRow>> {
  return withAdmin(accessToken, async () => {
    const email = normalizeEmail(input.email);
    if (!email) return err('Invalid email address.', 'validation');
    const password = typeof input.password === 'string' ? input.password.trim() : '';
    if (password.length < 8) return err('Password must be at least 8 characters.', 'validation');

    const admin = getAdminSupabase();

    // Create auth user — email_confirm: true skips the verification email entirely.
    const { error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'Admin' },
    });
    if (authError) {
      const msg = authError.message ?? '';
      if (/already registered|already exists|unique/i.test(msg)) {
        return err('A user with that email already exists in auth.', 'duplicate');
      }
      return err(`Failed to create auth user: ${msg}`, 'db_error');
    }

    // Upsert into authorized_users (handles case where email was already listed).
    const { data: row, error: dbError } = await admin
      .from('authorized_users')
      .upsert({ email, role: 'Admin' }, { onConflict: 'email' })
      .select('id, email, role, created_at, updated_at')
      .single();
    if (dbError) return err('Auth user created but failed to add to authorized list.', 'db_error');

    return ok(row as AdminUserRow);
  });
}

/**
 * Sets the Supabase Auth password for an authorized user (Admin or User),
 * matched by email in `authorized_users`. Caller must be an admin.
 */
export async function updateAuthorizedUserPasswordAction(
  accessToken: string,
  input: { id: string; newPassword: string }
): Promise<ActionResult<{ ok: true }>> {
  return withAdmin(accessToken, async () => {
    if (typeof input.id !== 'string' || input.id.length < 10) return err('Invalid user.', 'validation');
    const newPassword = typeof input.newPassword === 'string' ? input.newPassword.trim() : '';
    if (newPassword.length < 8) return err('Password must be at least 8 characters.', 'validation');

    const admin = getAdminSupabase();
    const { data: target, error: targetErr } = await admin
      .from('authorized_users')
      .select('id, email')
      .eq('id', input.id)
      .maybeSingle();

    if (targetErr || !target?.email) return err('User not found.', 'not_found');

    const authUserId = await findAuthUserIdByEmail(admin, target.email);
    if (!authUserId) {
      return err(
        'No login account found for this email yet. The user must accept their invite or complete signup before a password can be set.',
        'not_found'
      );
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(authUserId, { password: newPassword });
    if (updateErr) return err(`Failed to update password: ${updateErr.message}`, 'auth_error');

    await admin
      .from('authorized_users')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', input.id);

    return ok({ ok: true });
  });
}
