'use server';

import { getAdminSupabase } from '@/lib/server/supabase-admin';
import { err, ok, withAdmin, type ActionResult } from './_shared';

type AdminPreferences = {
  two_factor_enabled: boolean;
  email_alerts: boolean;
  weekly_summary: boolean;
  system_updates: boolean;
};

export type AdminProfileSettings = {
  fullName: string;
  email: string;
  role: string;
  preferences: AdminPreferences;
};

const DEFAULT_PREFERENCES: AdminPreferences = {
  two_factor_enabled: false,
  email_alerts: true,
  weekly_summary: true,
  system_updates: true,
};

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function normalizeName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > 120) return null;
  return t;
}

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) || t.length > 254) return null;
  return t;
}

export async function getProfileSettingsAction(accessToken: string): Promise<ActionResult<AdminProfileSettings>> {
  return withAdmin(accessToken, async (ctx) => {
    const admin = getAdminSupabase();
    const [authRes, roleRes] = await Promise.all([
      admin.auth.admin.getUserById(ctx.userId),
      admin.from('authorized_users').select('role').ilike('email', ctx.email).maybeSingle(),
    ]);
    if (authRes.error || !authRes.data.user) return err('Failed to load admin profile.', 'auth_error');
    if (roleRes.error) return err('Failed to load admin role.', 'db_error');
    const user = authRes.data.user;
    const md = (user.user_metadata ?? {}) as Record<string, unknown>;
    const prefsRaw = (md.preferences ?? {}) as Record<string, unknown>;
    const preferences: AdminPreferences = {
      two_factor_enabled: asBool(md.two_factor_enabled, DEFAULT_PREFERENCES.two_factor_enabled),
      email_alerts: asBool(prefsRaw.email_alerts, DEFAULT_PREFERENCES.email_alerts),
      weekly_summary: asBool(prefsRaw.weekly_summary, DEFAULT_PREFERENCES.weekly_summary),
      system_updates: asBool(prefsRaw.system_updates, DEFAULT_PREFERENCES.system_updates),
    };
    return ok({
      fullName: (typeof md.full_name === 'string' && md.full_name.trim()) || ctx.email,
      email: user.email ?? ctx.email,
      role: roleRes.data?.role ?? 'Admin',
      preferences,
    });
  });
}

export async function saveProfileSettingsAction(
  accessToken: string,
  input: {
    fullName: string;
    email: string;
    preferences: AdminPreferences;
    newPassword?: string;
  }
): Promise<ActionResult<AdminProfileSettings>> {
  return withAdmin(accessToken, async (ctx) => {
    const fullName = normalizeName(input.fullName);
    const email = normalizeEmail(input.email);
    if (!fullName) return err('Invalid full name.', 'validation');
    if (!email) return err('Invalid email.', 'validation');
    if (typeof input.preferences !== 'object' || input.preferences === null) {
      return err('Invalid preferences.', 'validation');
    }
    const pw = typeof input.newPassword === 'string' ? input.newPassword.trim() : '';
    if (pw && pw.length < 8) return err('New password must be at least 8 characters.', 'validation');

    const admin = getAdminSupabase();
    const userRes = await admin.auth.admin.getUserById(ctx.userId);
    if (userRes.error || !userRes.data.user) return err('Failed to load admin profile.', 'auth_error');
    const existingMd = (userRes.data.user.user_metadata ?? {}) as Record<string, unknown>;
    const nextMd = {
      ...existingMd,
      full_name: fullName,
      two_factor_enabled: Boolean(input.preferences.two_factor_enabled),
      preferences: {
        email_alerts: Boolean(input.preferences.email_alerts),
        weekly_summary: Boolean(input.preferences.weekly_summary),
        system_updates: Boolean(input.preferences.system_updates),
      },
    };
    const updatePayload: {
      email: string;
      user_metadata: Record<string, unknown>;
      password?: string;
    } = {
      email,
      user_metadata: nextMd,
    };
    if (pw) updatePayload.password = pw;

    const updateRes = await admin.auth.admin.updateUserById(ctx.userId, updatePayload);
    if (updateRes.error) return err(`Failed to save profile: ${updateRes.error.message}`, 'auth_error');

    if (email !== ctx.email) {
      const { error: roleErr } = await admin
        .from('authorized_users')
        .update({ email, updated_at: new Date().toISOString() })
        .ilike('email', ctx.email);
      if (roleErr) return err('Profile updated, but failed to sync authorized users email.', 'db_error');
    }

    const roleRes = await admin.from('authorized_users').select('role').ilike('email', email).maybeSingle();
    if (roleRes.error) return err('Failed to load saved role.', 'db_error');

    return ok({
      fullName,
      email,
      role: roleRes.data?.role ?? 'Admin',
      preferences: {
        two_factor_enabled: Boolean(input.preferences.two_factor_enabled),
        email_alerts: Boolean(input.preferences.email_alerts),
        weekly_summary: Boolean(input.preferences.weekly_summary),
        system_updates: Boolean(input.preferences.system_updates),
      },
    });
  });
}
