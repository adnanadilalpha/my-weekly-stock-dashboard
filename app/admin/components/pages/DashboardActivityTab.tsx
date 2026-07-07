'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  Eye,
  MousePointerClick,
  Radio,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useAdmin } from '../../_lib/admin-context';
import { useLiveAdminRefresh } from '../../_lib/use-live-admin-refresh';
import {
  loadActivityStatsAction,
  type ActivityStats,
  type ActiveUserRow,
  type PopularItemRow,
  type RecentActivityRow,
  type UserActivitySummaryRow,
} from '../../_actions/activity';

const ACTIVITY_REFRESH_MS = 30_000;
const BACKGROUND_FETCH_THROTTLE_MS = 3_000;

type DashboardActivityTabProps = {
  dataActive?: boolean;
};

export default function DashboardActivityTab({ dataActive = true }: DashboardActivityTabProps) {
  const { getAccessToken } = useAdmin();
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const hasStatsRef = useRef(false);
  const lastBackgroundFetchAtRef = useRef(0);

  useEffect(() => {
    hasStatsRef.current = stats != null;
  }, [stats]);

  const fetchStats = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (inFlightRef.current) return inFlightRef.current;
      const treatAsSilent = Boolean(opts?.silent && hasStatsRef.current);
      const task = (async () => {
        if (!treatAsSilent) setLoading(true);
        if (treatAsSilent) setRefreshing(true);
        setError(null);
        try {
          const token = await getAccessToken();
          const res = await loadActivityStatsAction(token);
          if (!mountedRef.current) return;
          if (res.ok) {
            setStats(res.data);
            setLastUpdatedAt(Date.now());
          } else {
            setError(res.error);
          }
        } catch (e) {
          if (mountedRef.current) setError(e instanceof Error ? e.message : 'Failed to load.');
        } finally {
          inFlightRef.current = null;
          if (!mountedRef.current) return;
          setLoading(false);
          setRefreshing(false);
        }
      })();
      inFlightRef.current = task;
      return task;
    },
    [getAccessToken],
  );

  const throttledBackgroundFetch = useCallback(() => {
    const now = Date.now();
    if (now - lastBackgroundFetchAtRef.current < BACKGROUND_FETCH_THROTTLE_MS) return;
    lastBackgroundFetchAtRef.current = now;
    void fetchStats({ silent: true });
  }, [fetchStats]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useLiveAdminRefresh({
    enabled: dataActive,
    pollingMs: ACTIVITY_REFRESH_MS,
    throttleMs: BACKGROUND_FETCH_THROTTLE_MS,
    channelName: 'admin-activity-live',
    getAccessToken,
    refresh: throttledBackgroundFetch,
    realtime: [
      { schema: 'public', table: 'user_activity_sessions' },
      { schema: 'public', table: 'user_activity_events' },
    ],
  });

  useEffect(() => {
    if (!dataActive) return;
    void fetchStats();
  }, [dataActive, fetchStats]);

  const lastUpdatedText = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    : '—';

  const v = (n: number | undefined) => (loading && !stats ? '—' : numberFmt(n ?? 0));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Real engagement from heartbeats (who is active now) plus meaningful navigation — major page visits
            and ticker lookups. Filters, clicks, and session noise are not tracked.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Updated <span className="font-semibold text-foreground">{lastUpdatedText}</span>
          </span>
          <button
            type="button"
            onClick={() => void fetchStats({ silent: true })}
            disabled={refreshing || loading}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ActivityKpi icon={Radio} label="Active now" value={v(stats?.activeNow)} hint="heartbeat ≤ 3 min" tone="live" />
        <ActivityKpi icon={Users} label="Active today" value={v(stats?.activeToday)} hint="unique users · 24h" />
        <ActivityKpi icon={Activity} label="Sessions" value={v(stats?.sessions24h)} hint="open tabs · 24h" />
        <ActivityKpi icon={MousePointerClick} label="Events" value={v(stats?.events24h)} hint="interactions · 24h" />
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-5">
        <Panel className="xl:col-span-3" title="Live sessions" subtitle="Per-tab presence · last 24 hours">
          <LiveSessionsTable rows={stats?.activeUsers ?? []} loading={loading && !stats} />
        </Panel>
        <Panel className="xl:col-span-2" title="Recent activity" subtitle="Latest interactions">
          <RecentActivityFeed rows={stats?.recentActivity ?? []} loading={loading && !stats} />
        </Panel>
      </section>

      <section className="grid min-w-0 gap-5 lg:grid-cols-2">
        <Panel title="Popular pages" subtitle="Page views · last 7 days">
          <PopularBars items={stats?.popularPages7d ?? []} loading={loading && !stats} emptyLabel="No page views yet" />
        </Panel>
        <Panel title="Top tickers" subtitle="Ticker views · last 7 days">
          <PopularBars items={stats?.topTickers7d ?? []} loading={loading && !stats} emptyLabel="No ticker views yet" accent="violet" />
        </Panel>
      </section>

      <Panel title="User engagement" subtitle="Per-user summary · last 24 hours">
        <UserSummaryTable rows={stats?.userSummaries ?? []} loading={loading && !stats} />
      </Panel>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

function ActivityKpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone?: 'default' | 'live';
}) {
  const iconWrap =
    tone === 'live'
      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
      : 'bg-sky-500/15 text-sky-600 dark:text-sky-400';

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconWrap}`}>
          <Icon size={20} strokeWidth={1.75} />
        </div>
        {tone === 'live' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
        )}
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{label}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${className}`}>
      <div className="border-b border-border bg-muted/40 px-4 py-4 sm:px-5">
        <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="min-h-0 flex-1 p-4 sm:p-5">{children}</div>
    </div>
  );
}

function LiveSessionsTable({ rows, loading }: { rows: ActiveUserRow[]; loading: boolean }) {
  if (loading) return <LoadingPlaceholder />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Eye}
        title="No sessions yet"
        description="Sessions appear when users open the app and interact. Heartbeats update every minute while active."
      />
    );
  }

  const sorted = [...rows].sort((a, b) => {
    if (a.isActiveNow !== b.isActiveNow) return a.isActiveNow ? -1 : 1;
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
  });

  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 pr-3">User</th>
            <th className="pb-2 pr-3">Location</th>
            <th className="pb-2 pr-3">Last seen</th>
            <th className="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={`${row.userId}-${row.lastSeenAt}`} className="border-t border-border/70">
              <td className="py-2.5 pr-3">
                <div className="font-medium text-foreground">{row.email}</div>
                {row.role && <div className="text-xs text-muted-foreground">{row.role}</div>}
              </td>
              <td className="py-2.5 pr-3 text-muted-foreground">{row.locationLabel}</td>
              <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">{relativeTime(row.lastSeenAt)}</td>
              <td className="py-2.5">
                {row.isActiveNow ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Idle</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentActivityFeed({ rows, loading }: { rows: RecentActivityRow[]; loading: boolean }) {
  if (loading) return <LoadingPlaceholder />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No events yet"
        description="Page views, ticker lookups, and mode switches will show up here."
      />
    );
  }

  return (
    <ul className="max-h-[360px] space-y-3 overflow-auto">
      {rows.map((row) => (
        <li key={row.id} className="flex gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
            <Activity size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{row.displayLabel}</p>
            <p className="truncate text-xs text-muted-foreground">{row.email}</p>
          </div>
          <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{relativeTime(row.createdAt)}</time>
        </li>
      ))}
    </ul>
  );
}

function PopularBars({
  items,
  loading,
  emptyLabel,
  accent = 'sky',
}: {
  items: PopularItemRow[];
  loading: boolean;
  emptyLabel: string;
  accent?: 'sky' | 'violet';
}) {
  if (loading) return <LoadingPlaceholder />;
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const max = Math.max(...items.map((i) => i.count), 1);
  const barClass = accent === 'violet' ? 'bg-violet-500' : 'bg-sky-500';

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium text-foreground">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{numberFmt(item.count)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${barClass} transition-all`}
              style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function UserSummaryTable({ rows, loading }: { rows: UserActivitySummaryRow[]; loading: boolean }) {
  if (loading) return <LoadingPlaceholder />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No engagement data"
        description="User summaries appear after people use the platform."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 pr-4">User</th>
            <th className="pb-2 pr-4">Last seen</th>
            <th className="pb-2 pr-4">Sessions</th>
            <th className="pb-2 pr-4">Events</th>
            <th className="pb-2">Top page</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId} className="border-t border-border/70">
              <td className="py-2.5 pr-4">
                <div className="font-medium text-foreground">{row.email}</div>
                {row.role && <div className="text-xs text-muted-foreground">{row.role}</div>}
              </td>
              <td className="py-2.5 pr-4 tabular-nums text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} />
                  {relativeTime(row.lastSeenAt)}
                </span>
              </td>
              <td className="py-2.5 pr-4 tabular-nums">{row.sessionCount24h}</td>
              <td className="py-2.5 pr-4 tabular-nums">{row.eventCount24h}</td>
              <td className="py-2.5 text-muted-foreground">{row.topPageLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingPlaceholder() {
  return <div className="py-10 text-center text-sm text-muted-foreground">Loading activity…</div>;
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon size={22} />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function numberFmt(n: number) {
  return n.toLocaleString('en-US');
}
