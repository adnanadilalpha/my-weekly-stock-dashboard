'use server';

import { getAdminSupabase } from '@/lib/server/supabase-admin';
import {
  activityLocationLabel,
  activityPageLabel,
  eventTypeLabel,
} from '@/lib/activity/labels';
import { err, ok, withAdmin, type ActionResult } from './_shared';

export type ActiveUserRow = {
  userId: string;
  email: string;
  role: string | null;
  lastSeenAt: string;
  startedAt: string;
  appMode: string | null;
  currentPage: string | null;
  locationLabel: string;
  isActiveNow: boolean;
};

export type RecentActivityRow = {
  id: string;
  email: string;
  eventType: string;
  eventTypeLabel: string;
  eventName: string;
  displayLabel: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type PopularItemRow = {
  key: string;
  label: string;
  count: number;
};

export type UserActivitySummaryRow = {
  userId: string;
  email: string;
  role: string | null;
  lastSeenAt: string;
  sessionCount24h: number;
  eventCount24h: number;
  topPage: string | null;
  topPageLabel: string;
};

export type ActivityStats = {
  activeNow: number;
  activeToday: number;
  sessions24h: number;
  events24h: number;
  uniqueUsers24h: number;
  activeUsers: ActiveUserRow[];
  recentActivity: RecentActivityRow[];
  popularPages7d: PopularItemRow[];
  topTickers7d: PopularItemRow[];
  userSummaries: UserActivitySummaryRow[];
};

const ACTIVE_NOW_MS = 3 * 60 * 1000;
const ACTIVE_TODAY_MS = 24 * 60 * 60 * 1000;
const RECENT_EVENTS_LIMIT = 40;
const POPULAR_LIMIT = 8;

function sinceIso(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}

async function loadEmailMap(
  admin: ReturnType<typeof getAdminSupabase>,
): Promise<Map<string, { email: string; role: string | null }>> {
  const map = new Map<string, { email: string; role: string | null }>();
  const { data, error } = await admin.from('authorized_users').select('email, role');
  if (error || !data) return map;
  for (const row of data) {
    const email = String(row.email ?? '').toLowerCase();
    if (!email) continue;
    map.set(email, { email, role: row.role ?? null });
  }
  return map;
}

async function resolveUserEmails(
  admin: ReturnType<typeof getAdminSupabase>,
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return out;

  try {
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users?.length) break;
      for (const u of data.users) {
        if (unique.includes(u.id) && u.email) {
          out.set(u.id, u.email.toLowerCase());
        }
      }
      if (out.size >= unique.length) break;
      if (data.users.length < 1000) break;
    }
  } catch {
    // Fall through with partial map.
  }
  return out;
}

function eventDisplayLabel(eventType: string, eventName: string, metadata: Record<string, unknown>): string {
  if (eventType === 'page_view') return activityPageLabel(eventName);
  if (eventType === 'mode_switch') return `Switched to ${activityPageLabel(eventName)}`;
  if (eventType === 'ticker_view') {
    const ticker = metadata.ticker ?? eventName;
    return `Viewed ${String(ticker).toUpperCase()}`;
  }
  if (eventType === 'search') {
    const q = metadata.query ?? eventName;
    return `Searched “${String(q)}”`;
  }
  if (eventType === 'filter') {
    const f = metadata.filter ?? eventName;
    return `Filter: ${String(f)}`;
  }
  return eventTypeLabel(eventType);
}

export async function loadActivityStatsAction(accessToken: string): Promise<ActionResult<ActivityStats>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const since24h = sinceIso(ACTIVE_TODAY_MS);
    const since7d = sinceIso(7 * 24 * 60 * 60 * 1000);

    const [sessionsRes, events24hRes, recentEventsRes, pageViewsRes, tickerViewsRes, emailMap] =
      await Promise.all([
        admin
          .from('user_activity_sessions')
          .select('user_id, session_key, started_at, last_seen_at, app_mode, current_page')
          .gte('last_seen_at', since24h)
          .order('last_seen_at', { ascending: false })
          .limit(500),
        admin.from('user_activity_events').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
        admin
          .from('user_activity_events')
          .select('id, user_id, event_type, event_name, metadata, created_at')
          .order('created_at', { ascending: false })
          .limit(RECENT_EVENTS_LIMIT),
        admin
          .from('user_activity_events')
          .select('event_name')
          .eq('event_type', 'page_view')
          .gte('created_at', since7d),
        admin
          .from('user_activity_events')
          .select('event_name, metadata')
          .eq('event_type', 'ticker_view')
          .gte('created_at', since7d),
        loadEmailMap(admin),
      ]);

    if (sessionsRes.error) return err('Failed to load activity sessions.', 'db_error');
    if (recentEventsRes.error) return err('Failed to load recent activity.', 'db_error');

    const sessions = sessionsRes.data ?? [];
    const now = Date.now();

    const userIds = [
      ...sessions.map((s) => s.user_id),
      ...(recentEventsRes.data ?? []).map((e) => e.user_id),
    ];
    const userEmailById = await resolveUserEmails(admin, userIds);

    const roleByEmail = new Map<string, string | null>();
    for (const [, v] of emailMap) {
      roleByEmail.set(v.email, v.role);
    }

    const activeUsers: ActiveUserRow[] = sessions.map((s) => {
      const email = userEmailById.get(s.user_id) ?? 'unknown';
      const lastSeenMs = new Date(s.last_seen_at).getTime();
      return {
        userId: s.user_id,
        email,
        role: roleByEmail.get(email) ?? null,
        lastSeenAt: s.last_seen_at,
        startedAt: s.started_at,
        appMode: s.app_mode,
        currentPage: s.current_page,
        locationLabel: activityLocationLabel(s.app_mode ?? undefined, s.current_page ?? undefined),
        isActiveNow: !Number.isNaN(lastSeenMs) && now - lastSeenMs <= ACTIVE_NOW_MS,
      };
    });

    const uniqueActiveNow = new Set(
      sessions
        .filter((s) => {
          const t = new Date(s.last_seen_at).getTime();
          return !Number.isNaN(t) && now - t <= ACTIVE_NOW_MS;
        })
        .map((s) => s.user_id),
    ).size;

    const uniqueToday = new Set(sessions.map((s) => s.user_id)).size;

    const pageCounts = new Map<string, number>();
    for (const row of pageViewsRes.data ?? []) {
      const key = row.event_name ?? 'unknown';
      pageCounts.set(key, (pageCounts.get(key) ?? 0) + 1);
    }
    const popularPages7d: PopularItemRow[] = [...pageCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, POPULAR_LIMIT)
      .map(([key, count]) => ({ key, label: activityPageLabel(key), count }));

    const tickerCounts = new Map<string, number>();
    for (const row of tickerViewsRes.data ?? []) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const key = String(meta.ticker ?? row.event_name ?? '').toUpperCase();
      if (!key) continue;
      tickerCounts.set(key, (tickerCounts.get(key) ?? 0) + 1);
    }
    const topTickers7d: PopularItemRow[] = [...tickerCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, POPULAR_LIMIT)
      .map(([key, count]) => ({ key, label: key, count }));

    const recentActivity: RecentActivityRow[] = (recentEventsRes.data ?? []).map((e) => {
      const email = userEmailById.get(e.user_id) ?? 'unknown';
      const metadata = (e.metadata ?? {}) as Record<string, unknown>;
      return {
        id: e.id,
        email,
        eventType: e.event_type,
        eventTypeLabel: eventTypeLabel(e.event_type),
        eventName: e.event_name,
        displayLabel: eventDisplayLabel(e.event_type, e.event_name, metadata),
        metadata,
        createdAt: e.created_at,
      };
    });

    const perUser = new Map<
      string,
      { lastSeen: string; sessions: number; events: number; pageCounts: Map<string, number> }
    >();
    for (const s of sessions) {
      const cur = perUser.get(s.user_id) ?? {
        lastSeen: s.last_seen_at,
        sessions: 0,
        events: 0,
        pageCounts: new Map(),
      };
      cur.sessions += 1;
      if (new Date(s.last_seen_at) > new Date(cur.lastSeen)) cur.lastSeen = s.last_seen_at;
      perUser.set(s.user_id, cur);
    }

    const eventsByUserRes = await admin
      .from('user_activity_events')
      .select('user_id, event_type, event_name')
      .gte('created_at', since24h);

    for (const e of eventsByUserRes.data ?? []) {
      const cur = perUser.get(e.user_id) ?? {
        lastSeen: since24h,
        sessions: 0,
        events: 0,
        pageCounts: new Map(),
      };
      cur.events += 1;
      if (e.event_type === 'page_view') {
        cur.pageCounts.set(e.event_name, (cur.pageCounts.get(e.event_name) ?? 0) + 1);
      }
      perUser.set(e.user_id, cur);
    }

    const userSummaries: UserActivitySummaryRow[] = [...perUser.entries()]
      .map(([userId, stats]) => {
        const email = userEmailById.get(userId) ?? 'unknown';
        let topPage: string | null = null;
        let topCount = 0;
        for (const [page, count] of stats.pageCounts) {
          if (count > topCount) {
            topPage = page;
            topCount = count;
          }
        }
        return {
          userId,
          email,
          role: roleByEmail.get(email) ?? null,
          lastSeenAt: stats.lastSeen,
          sessionCount24h: stats.sessions,
          eventCount24h: stats.events,
          topPage,
          topPageLabel: topPage ? activityPageLabel(topPage) : '—',
        };
      })
      .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());

    return ok({
      activeNow: uniqueActiveNow,
      activeToday: uniqueToday,
      sessions24h: sessions.length,
      events24h: events24hRes.count ?? 0,
      uniqueUsers24h: uniqueToday,
      activeUsers,
      recentActivity,
      popularPages7d,
      topTickers7d,
      userSummaries,
    });
  });
}
