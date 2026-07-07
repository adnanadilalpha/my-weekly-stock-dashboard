import { NextResponse } from 'next/server';
import { getSupabaseAsUser } from '@/lib/server/supabase-admin';
import type { ActivityIngestBody } from '@/lib/activity/types';

const MAX_EVENTS_PER_REQUEST = 25;
const MAX_EVENT_NAME_LEN = 120;
const MAX_SESSION_KEY_LEN = 64;
const ALLOWED_EVENT_TYPES = new Set([
  'session_start',
  'session_end',
  'page_view',
  'mode_switch',
  'ticker_view',
  'search',
  'filter',
  'sign_out',
]);

function trimMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta || typeof meta !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (out[k] !== undefined) continue;
    if (typeof k !== 'string' || k.length > 64) continue;
    if (v == null) continue;
    if (typeof v === 'string') {
      out[k] = v.slice(0, 200);
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const asUser = getSupabaseAsUser(token);
    const { data: userRes, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userRes?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as ActivityIngestBody;
    const sessionKey = typeof body.sessionKey === 'string' ? body.sessionKey.trim().slice(0, MAX_SESSION_KEY_LEN) : '';
    if (!sessionKey) {
      return NextResponse.json({ error: 'sessionKey required' }, { status: 400 });
    }

    const userId = userRes.user.id;
    const now = new Date().toISOString();

    if (body.heartbeat) {
      const hb = body.heartbeat;
      const appMode = typeof hb.appMode === 'string' ? hb.appMode.slice(0, 32) : null;
      const currentPage = typeof hb.currentPage === 'string' ? hb.currentPage.slice(0, 64) : null;
      const metadata = trimMeta(hb.metadata);

      const { error: sessionErr } = await asUser.from('user_activity_sessions').upsert(
        {
          user_id: userId,
          session_key: sessionKey,
          last_seen_at: now,
          app_mode: appMode,
          current_page: currentPage,
          metadata,
        },
        { onConflict: 'user_id,session_key' },
      );

      if (sessionErr) {
        console.error('activity heartbeat upsert', sessionErr);
        return NextResponse.json({ error: 'Failed to record heartbeat' }, { status: 500 });
      }
    }

    const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS_PER_REQUEST) : [];
    if (events.length > 0) {
      const rows = events
        .filter((e) => e && typeof e.eventType === 'string' && ALLOWED_EVENT_TYPES.has(e.eventType))
        .map((e) => ({
          user_id: userId,
          session_key: sessionKey,
          event_type: e.eventType,
          event_name: String(e.eventName ?? e.eventType).slice(0, MAX_EVENT_NAME_LEN),
          metadata: trimMeta(e.metadata),
        }));

      if (rows.length > 0) {
        const { error: eventsErr } = await asUser.from('user_activity_events').insert(rows);
        if (eventsErr) {
          console.error('activity events insert', eventsErr);
          return NextResponse.json({ error: 'Failed to record events' }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('POST /api/activity', e);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
