import { NextResponse } from 'next/server';
import { getAdminSupabase, getSupabaseAsUser } from '@/lib/server/supabase-admin';

/**
 * Self-service account deletion for App Store / Play Store requirements.
 *
 * Deletes only the caller's personal data + auth identity. Does not touch
 * shared market / formula / universe data.
 *
 * Cascade covers most `user_id → auth.users` rows; we also delete explicitly
 * so prefs without a DELETE RLS policy are removed even if auth deletion fails
 * mid-flight.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let confirm = '';
    try {
      const body = (await request.json()) as { confirm?: unknown };
      confirm = typeof body?.confirm === 'string' ? body.confirm.trim() : '';
    } catch {
      // empty body is fine if client only sends the header
    }
    if (confirm !== 'DELETE') {
      return NextResponse.json(
        { error: 'Confirmation required. Send { "confirm": "DELETE" }.' },
        { status: 400 },
      );
    }

    const asUser = getSupabaseAsUser(token);
    const { data: userRes, error: userErr } = await asUser.auth.getUser();
    const user = userRes?.user;
    if (userErr || !user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;
    const email = (user.email ?? '').trim().toLowerCase();
    const admin = getAdminSupabase();

    // 1) Personal app data (order: children → parents where needed).
    // Holdings cascade from portfolios; delete portfolios first for clarity.
    const { error: portfoliosErr } = await admin.from('user_portfolios').delete().eq('user_id', userId);
    if (portfoliosErr) {
      console.error('account/delete portfolios', portfoliosErr);
      return NextResponse.json({ error: 'Failed to delete portfolio data.' }, { status: 500 });
    }

    const { error: prefsErr } = await admin.from('user_mws_hub_preferences').delete().eq('user_id', userId);
    if (prefsErr) {
      console.error('account/delete prefs', prefsErr);
      return NextResponse.json({ error: 'Failed to delete preferences.' }, { status: 500 });
    }

    const { error: chatMsgErr } = await admin.from('ai_chat_messages').delete().eq('user_id', userId);
    if (chatMsgErr) {
      console.error('account/delete chat messages', chatMsgErr);
      return NextResponse.json({ error: 'Failed to delete chat history.' }, { status: 500 });
    }

    const { error: chatSessionErr } = await admin.from('ai_chat_sessions').delete().eq('user_id', userId);
    if (chatSessionErr) {
      console.error('account/delete chat sessions', chatSessionErr);
      return NextResponse.json({ error: 'Failed to delete chat sessions.' }, { status: 500 });
    }

    const { error: activityEventsErr } = await admin
      .from('user_activity_events')
      .delete()
      .eq('user_id', userId);
    if (activityEventsErr) {
      console.error('account/delete activity events', activityEventsErr);
      return NextResponse.json({ error: 'Failed to delete activity data.' }, { status: 500 });
    }

    const { error: activitySessionsErr } = await admin
      .from('user_activity_sessions')
      .delete()
      .eq('user_id', userId);
    if (activitySessionsErr) {
      console.error('account/delete activity sessions', activitySessionsErr);
      return NextResponse.json({ error: 'Failed to delete activity sessions.' }, { status: 500 });
    }

    // 2) Access allowlist — without this, magic-link can recreate an empty account.
    if (email) {
      const { error: authzErr } = await admin.from('authorized_users').delete().ilike('email', email);
      if (authzErr) {
        console.error('account/delete authorized_users', authzErr);
        return NextResponse.json({ error: 'Failed to revoke account access.' }, { status: 500 });
      }
    }

    // 3) Auth identity (cascades any remaining FK rows).
    const { error: authDeleteErr } = await admin.auth.admin.deleteUser(userId);
    if (authDeleteErr) {
      console.error('account/delete auth user', authDeleteErr);
      return NextResponse.json({ error: 'Failed to delete auth account.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('account/delete', e);
    return NextResponse.json({ error: 'Account deletion failed.' }, { status: 500 });
  }
}
