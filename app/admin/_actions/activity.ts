'use server';

import { getAdminSupabase } from '@/lib/server/supabase-admin';
import {
  activityLocationLabel,
  activityPageLabel,
  eventTypeLabel,
  featureUsageLabel,
  normalizeActivityPlatform,
  type ActivityPlatform,
} from '@/lib/activity/labels';
import { err, ok, withAdmin, type ActionResult } from './_shared';

export type PlatformCounts = {
  web: number;
  ios: number;
  android: number;
};

export type ActiveUserRow = {
  userId: string;
  email: string;
  role: string | null;
  lastSeenAt: string;
  startedAt: string;
  appMode: string | null;
  currentPage: string | null;
  locationLabel: string;
  platform: ActivityPlatform;
  appVersion: string | null;
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
  platform: ActivityPlatform;
  createdAt: string;
};

export type PopularItemRow = {
  key: string;
  label: string;
  count: number;
};

export type EngagedUserRow = {
  userId: string;
  email: string;
  role: string | null;
  lastSeenAt: string;
  platform: ActivityPlatform;
  sessionCount7d: number;
  eventCount7d: number;
  featureCount7d: number;
  topScreen: string | null;
  topScreenLabel: string;
};

export type SeriesPoint = {
  /** Period key: YYYY-MM-DD (day), Monday YYYY-MM-DD (week), or YYYY-MM (month) */
  date: string;
  /** Distinct people active in this period */
  count: number;
  label: string;
};

/** @deprecated use SeriesPoint */
export type DauSeriesPoint = SeriesPoint;

export type ActivityStats = {
  activeNow: number;
  dau: number;
  wau: number;
  mau: number;
  /** @deprecated use dau */
  activeToday: number;
  sessions24h: number;
  events24h: number;
  uniqueUsers24h: number;
  dauByPlatform: PlatformCounts;
  wauByPlatform: PlatformCounts;
  mauByPlatform: PlatformCounts;
  stickinessDauWau: number | null;
  stickinessWauMau: number | null;
  /** Distinct people per day · last 30 days */
  dauSeries: SeriesPoint[];
  /** Distinct people per week · last 12 weeks */
  wauSeries: SeriesPoint[];
  /** Distinct people per month · last 6 months */
  mauSeries: SeriesPoint[];
  featureUsage7d: PopularItemRow[];
  popularPages7d: PopularItemRow[];
  topTickers7d: PopularItemRow[];
  /** Latest presence per user · last 30 days (filter day/week/month in UI) */
  activeUsers: ActiveUserRow[];
  recentActivity: RecentActivityRow[];
  engagedUsers: EngagedUserRow[];
  /** @deprecated use engagedUsers */
  userSummaries: EngagedUserRow[];
};

const ACTIVE_NOW_MS = 3 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_EVENTS_LIMIT = 40;
const POPULAR_LIMIT = 8;
const SERIES_DAYS = 30;
const SERIES_WEEKS = 12;
const SERIES_MONTHS = 6;
/** Look back far enough for monthly series */
const SESSIONS_LOOKBACK_DAYS = 190;

function sinceIso(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** Monday (UTC) of the week containing `iso`, as YYYY-MM-DD */
function weekKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + mondayOffset));
  return monday.toISOString().slice(0, 10);
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 7);
}

function formatDayLabel(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatWeekLabel(mondayKey: string): string {
  return `Week of ${formatDayLabel(mondayKey)}`;
}

function formatMonthLabel(ym: string): string {
  const d = new Date(`${ym}-15T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ym;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function emptyPlatformCounts(): PlatformCounts {
  return { web: 0, ios: 0, android: 0 };
}

function platformFromMeta(meta: unknown): ActivityPlatform {
  const m = (meta ?? {}) as Record<string, unknown>;
  return normalizeActivityPlatform(m.platform);
}

function appVersionFromMeta(meta: unknown): string | null {
  const m = (meta ?? {}) as Record<string, unknown>;
  const v = m.app_version ?? m.appVersion;
  if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 32);
  return null;
}

function stickiness(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
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
  if (eventType === 'feature_use') return featureUsageLabel(eventName);
  return eventTypeLabel(eventType);
}

type SessionRow = {
  user_id: string;
  session_key: string;
  started_at: string;
  last_seen_at: string;
  app_mode: string | null;
  current_page: string | null;
  metadata: unknown;
};

function countDistinctInWindow(
  sessions: SessionRow[],
  sinceMs: number,
  now: number,
): { total: number; byPlatform: PlatformCounts; userPlatform: Map<string, ActivityPlatform> } {
  const byPlatform = emptyPlatformCounts();
  const userPlatform = new Map<string, ActivityPlatform>();
  for (const s of sessions) {
    const t = new Date(s.last_seen_at).getTime();
    if (Number.isNaN(t) || now - t > sinceMs) continue;
    const platform = platformFromMeta(s.metadata);
    // Prefer most recent session's platform for the user
    if (!userPlatform.has(s.user_id)) userPlatform.set(s.user_id, platform);
  }
  for (const platform of userPlatform.values()) {
    byPlatform[platform] += 1;
  }
  return { total: userPlatform.size, byPlatform, userPlatform };
}

export async function loadActivityStatsAction(accessToken: string): Promise<ActionResult<ActivityStats>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const now = Date.now();
    const since24h = sinceIso(DAY_MS);
    const since7d = sinceIso(7 * DAY_MS);
    const since30d = sinceIso(30 * DAY_MS);
    const sinceLookback = sinceIso(SESSIONS_LOOKBACK_DAYS * DAY_MS);

    const [
      sessionsRes,
      events24hRes,
      recentEventsRes,
      events7dRes,
      eventsSeriesRes,
      emailMap,
    ] = await Promise.all([
      admin
        .from('user_activity_sessions')
        .select('user_id, session_key, started_at, last_seen_at, app_mode, current_page, metadata')
        .gte('last_seen_at', sinceLookback)
        .order('last_seen_at', { ascending: false })
        .limit(8000),
      admin.from('user_activity_events').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
      admin
        .from('user_activity_events')
        .select('id, user_id, event_type, event_name, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(RECENT_EVENTS_LIMIT),
      admin
        .from('user_activity_events')
        .select('user_id, event_type, event_name, metadata, created_at')
        .gte('created_at', since7d)
        .limit(10000),
      admin
        .from('user_activity_events')
        .select('user_id, created_at')
        .gte('created_at', sinceLookback)
        .limit(30000),
      loadEmailMap(admin),
    ]);

    if (sessionsRes.error) return err('Failed to load activity sessions.', 'db_error');
    if (recentEventsRes.error) return err('Failed to load recent activity.', 'db_error');

    const sessions = (sessionsRes.data ?? []) as SessionRow[];
    const sessions24h = sessions.filter((s) => {
      const t = new Date(s.last_seen_at).getTime();
      return !Number.isNaN(t) && now - t <= DAY_MS;
    });

    const dauPack = countDistinctInWindow(sessions, DAY_MS, now);
    const wauPack = countDistinctInWindow(sessions, 7 * DAY_MS, now);
    const mauPack = countDistinctInWindow(sessions, 30 * DAY_MS, now);

    const activeNowUsers = new Set(
      sessions
        .filter((s) => {
          const t = new Date(s.last_seen_at).getTime();
          return !Number.isNaN(t) && now - t <= ACTIVE_NOW_MS;
        })
        .map((s) => s.user_id),
    );

    // Daily / weekly / monthly series from sessions + events (distinct people per bucket)
    const dayMap = new Map<string, Set<string>>();
    const weekMap = new Map<string, Set<string>>();
    const monthMap = new Map<string, Set<string>>();

    for (let i = 0; i < SERIES_DAYS; i += 1) {
      dayMap.set(new Date(now - i * DAY_MS).toISOString().slice(0, 10), new Set());
    }
    for (let i = 0; i < SERIES_WEEKS; i += 1) {
      const monday = weekKey(new Date(now - i * 7 * DAY_MS).toISOString());
      if (monday) weekMap.set(monday, new Set());
    }
    for (let i = 0; i < SERIES_MONTHS; i += 1) {
      const d = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - i, 15));
      monthMap.set(d.toISOString().slice(0, 7), new Set());
    }

    const bump = (userId: string, at: string) => {
      const d = dayKey(at);
      const w = weekKey(at);
      const m = monthKey(at);
      dayMap.get(d)?.add(userId);
      weekMap.get(w)?.add(userId);
      monthMap.get(m)?.add(userId);
    };

    for (const s of sessions) bump(s.user_id, s.last_seen_at);
    for (const e of eventsSeriesRes.data ?? []) bump(e.user_id, e.created_at);

    const dauSeries: SeriesPoint[] = [...dayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, set]) => ({ date, count: set.size, label: formatDayLabel(date) }));

    const wauSeries: SeriesPoint[] = [...weekMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, set]) => ({ date, count: set.size, label: formatWeekLabel(date) }));

    const mauSeries: SeriesPoint[] = [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, set]) => ({ date, count: set.size, label: formatMonthLabel(date) }));

    const events7d = events7dRes.data ?? [];
    const pageCounts = new Map<string, number>();
    const tickerCounts = new Map<string, number>();
    const featureCounts = new Map<string, number>();
    const perUser7d = new Map<
      string,
      {
        featureCount: number;
        pageCount: number;
        eventCount: number;
        pageCounts: Map<string, number>;
        featureCounts: Map<string, number>;
      }
    >();

    for (const e of events7d) {
      const cur = perUser7d.get(e.user_id) ?? {
        featureCount: 0,
        pageCount: 0,
        eventCount: 0,
        pageCounts: new Map(),
        featureCounts: new Map(),
      };
      cur.eventCount += 1;
      if (e.event_type === 'page_view') {
        cur.pageCount += 1;
        pageCounts.set(e.event_name, (pageCounts.get(e.event_name) ?? 0) + 1);
        cur.pageCounts.set(e.event_name, (cur.pageCounts.get(e.event_name) ?? 0) + 1);
      } else if (e.event_type === 'ticker_view') {
        const meta = (e.metadata ?? {}) as Record<string, unknown>;
        const key = String(meta.ticker ?? e.event_name ?? '').toUpperCase();
        if (key) tickerCounts.set(key, (tickerCounts.get(key) ?? 0) + 1);
      } else if (e.event_type === 'feature_use') {
        cur.featureCount += 1;
        featureCounts.set(e.event_name, (featureCounts.get(e.event_name) ?? 0) + 1);
        cur.featureCounts.set(e.event_name, (cur.featureCounts.get(e.event_name) ?? 0) + 1);
      }
      perUser7d.set(e.user_id, cur);
    }

    const popularPages7d: PopularItemRow[] = [...pageCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, POPULAR_LIMIT)
      .map(([key, count]) => ({ key, label: activityPageLabel(key), count }));

    const topTickers7d: PopularItemRow[] = [...tickerCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, POPULAR_LIMIT)
      .map(([key, count]) => ({ key, label: key, count }));

    const featureUsage7d: PopularItemRow[] = [...featureCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, POPULAR_LIMIT)
      .map(([key, count]) => ({ key, label: featureUsageLabel(key), count }));

    // Latest session per user in last 30d — UI filters day / week / month
    const latestByUser = new Map<string, SessionRow>();
    for (const s of sessions) {
      const t = new Date(s.last_seen_at).getTime();
      if (Number.isNaN(t) || now - t > 30 * DAY_MS) continue;
      const prev = latestByUser.get(s.user_id);
      if (!prev || new Date(s.last_seen_at) > new Date(prev.last_seen_at)) {
        latestByUser.set(s.user_id, s);
      }
    }

    const userIds = [
      ...latestByUser.keys(),
      ...sessions24h.map((s) => s.user_id),
      ...(recentEventsRes.data ?? []).map((e) => e.user_id),
      ...perUser7d.keys(),
    ];
    const userEmailById = await resolveUserEmails(admin, userIds);

    const roleByEmail = new Map<string, string | null>();
    for (const [, v] of emailMap) {
      roleByEmail.set(v.email, v.role);
    }

    const activeUsers: ActiveUserRow[] = [...latestByUser.values()].map((s) => {
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
        platform: platformFromMeta(s.metadata),
        appVersion: appVersionFromMeta(s.metadata),
        isActiveNow: !Number.isNaN(lastSeenMs) && now - lastSeenMs <= ACTIVE_NOW_MS,
      };
    });

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
        platform: platformFromMeta(metadata),
        createdAt: e.created_at,
      };
    });

    // Session counts per user in 7d
    const sessionCount7d = new Map<string, number>();
    const lastSeen7d = new Map<string, string>();
    const platform7d = new Map<string, ActivityPlatform>();
    for (const s of sessions) {
      const t = new Date(s.last_seen_at).getTime();
      if (Number.isNaN(t) || now - t > 7 * DAY_MS) continue;
      sessionCount7d.set(s.user_id, (sessionCount7d.get(s.user_id) ?? 0) + 1);
      const prev = lastSeen7d.get(s.user_id);
      if (!prev || new Date(s.last_seen_at) > new Date(prev)) {
        lastSeen7d.set(s.user_id, s.last_seen_at);
        platform7d.set(s.user_id, platformFromMeta(s.metadata));
      }
    }

    const engagedUsers: EngagedUserRow[] = [...perUser7d.entries()]
      .filter(([, stats]) => stats.featureCount >= 1 || stats.pageCount >= 3)
      .map(([userId, stats]) => {
        const email = userEmailById.get(userId) ?? 'unknown';
        let topScreen: string | null = null;
        let topCount = 0;
        for (const [name, count] of stats.featureCounts) {
          if (count > topCount) {
            topScreen = name;
            topCount = count;
          }
        }
        for (const [name, count] of stats.pageCounts) {
          if (count > topCount) {
            topScreen = name;
            topCount = count;
          }
        }
        const isFeatureTop = topScreen != null && stats.featureCounts.has(topScreen);
        return {
          userId,
          email,
          role: roleByEmail.get(email) ?? null,
          lastSeenAt: lastSeen7d.get(userId) ?? since7d,
          platform: platform7d.get(userId) ?? 'web',
          sessionCount7d: sessionCount7d.get(userId) ?? 0,
          eventCount7d: stats.eventCount,
          featureCount7d: stats.featureCount,
          topScreen,
          topScreenLabel: topScreen
            ? isFeatureTop
              ? featureUsageLabel(topScreen)
              : activityPageLabel(topScreen)
            : '—',
        };
      })
      .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());

    return ok({
      activeNow: activeNowUsers.size,
      dau: dauPack.total,
      wau: wauPack.total,
      mau: mauPack.total,
      activeToday: dauPack.total,
      sessions24h: sessions24h.length,
      events24h: events24hRes.count ?? 0,
      uniqueUsers24h: dauPack.total,
      dauByPlatform: dauPack.byPlatform,
      wauByPlatform: wauPack.byPlatform,
      mauByPlatform: mauPack.byPlatform,
      stickinessDauWau: stickiness(dauPack.total, wauPack.total),
      stickinessWauMau: stickiness(wauPack.total, mauPack.total),
      dauSeries,
      wauSeries,
      mauSeries,
      featureUsage7d,
      popularPages7d,
      topTickers7d,
      activeUsers,
      recentActivity,
      engagedUsers,
      userSummaries: engagedUsers,
    });
  });
}

/** Lightweight DAU for Overview KPI (heartbeat-based). */
export async function loadUsageDauAction(accessToken: string): Promise<ActionResult<{ dau: number; activeNow: number }>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const since24h = sinceIso(DAY_MS);
    const { data, error } = await admin
      .from('user_activity_sessions')
      .select('user_id, last_seen_at')
      .gte('last_seen_at', since24h)
      .limit(5000);
    if (error) return err('Failed to load usage DAU.', 'db_error');
    const now = Date.now();
    const dau = new Set((data ?? []).map((s) => s.user_id)).size;
    const activeNow = new Set(
      (data ?? [])
        .filter((s) => {
          const t = new Date(s.last_seen_at).getTime();
          return !Number.isNaN(t) && now - t <= ACTIVE_NOW_MS;
        })
        .map((s) => s.user_id),
    ).size;
    return ok({ dau, activeNow });
  });
}
