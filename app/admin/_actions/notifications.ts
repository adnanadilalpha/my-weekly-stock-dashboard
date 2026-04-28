'use server';

import { getAdminSupabase } from '@/lib/server/supabase-admin';
import { err, ok, withAdmin, type ActionResult } from './_shared';

export type AdminNotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

function isMissingAdminNotificationsTable(e: { message?: string; code?: string } | null | undefined): boolean {
  const m = e?.message ?? '';
  if (!m) return false;
  return (
    /admin_notifications/i.test(m) &&
    (/does not exist|schema cache|Could not find the table|not find/i.test(m) || e?.code === '42P01')
  );
}

export async function listAdminNotificationsAction(
  accessToken: string,
  input?: { limit?: number }
): Promise<ActionResult<AdminNotificationRow[]>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const limit = Math.min(Math.max(input?.limit ?? 80, 1), 200);
    const { data, error } = await admin
      .from('admin_notifications')
      .select('id, type, title, body, metadata, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      if (isMissingAdminNotificationsTable(error)) return ok([]);
      return err('Failed to load notifications.', 'db_error');
    }
    return ok((data ?? []) as AdminNotificationRow[]);
  });
}

export async function getUnreadAdminNotificationCountAction(accessToken: string): Promise<ActionResult<number>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const { count, error } = await admin
      .from('admin_notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null);
    if (error) {
      if (isMissingAdminNotificationsTable(error)) return ok(0);
      return err('Failed to count unread notifications.', 'db_error');
    }
    return ok(count ?? 0);
  });
}

export async function markAdminNotificationReadAction(
  accessToken: string,
  input: { id: string }
): Promise<ActionResult<void>> {
  return withAdmin(accessToken, async () => {
    if (typeof input.id !== 'string' || input.id.length < 10) return err('Invalid notification.', 'validation');
    const admin = getAdminSupabase();
    const { error } = await admin
      .from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', input.id);
    if (error) {
      if (isMissingAdminNotificationsTable(error)) return ok(undefined);
      return err('Failed to mark notification read.', 'db_error');
    }
    return ok(undefined);
  });
}

export async function markAllAdminNotificationsReadAction(accessToken: string): Promise<ActionResult<void>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const { error } = await admin
      .from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null);
    if (error) {
      if (isMissingAdminNotificationsTable(error)) return ok(undefined);
      return err('Failed to mark all read.', 'db_error');
    }
    return ok(undefined);
  });
}
