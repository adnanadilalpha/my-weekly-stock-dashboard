'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Eye, Radio, type LucideIcon } from 'lucide-react';
import { useAdmin } from '../../_lib/admin-context';
import { useLiveAdminRefresh } from '../../_lib/use-live-admin-refresh';
import {
  loadActivityStatsAction,
  type ActivityStats,
  type ActiveUserRow,
  type PopularItemRow,
  type SeriesPoint,
} from '../../_actions/activity';
import type { ActivityPlatform } from '@/lib/activity/labels';

const ACTIVITY_REFRESH_MS = 30_000;
const BACKGROUND_FETCH_THROTTLE_MS = 3_000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Period = 'day' | 'week' | 'month';

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
  const [trendPeriod, setTrendPeriod] = useState<Period>('day');
  const [peoplePeriod, setPeoplePeriod] = useState<Period>('day');
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
    ? new Date(lastUpdatedAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

  const showLoading = loading && !stats;
  const v = (n: number | undefined) => (showLoading ? '—' : numberFmt(n ?? 0));
  const platform = stats?.wauByPlatform ?? { web: 0, ios: 0, android: 0 };
  const platformTotal = platform.web + platform.ios + platform.android;

  const trendSeries = useMemo(() => {
    if (!stats) return [];
    if (trendPeriod === 'week') return stats.wauSeries ?? [];
    if (trendPeriod === 'month') return stats.mauSeries ?? [];
    return stats.dauSeries ?? [];
  }, [stats, trendPeriod]);

  const peopleRows = useMemo(() => {
    const rows = stats?.activeUsers ?? [];
    const maxAge =
      peoplePeriod === 'day' ? DAY_MS : peoplePeriod === 'week' ? 7 * DAY_MS : 30 * DAY_MS;
    const cutoff = Date.now() - maxAge;
    return rows.filter((r) => {
      const t = new Date(r.lastSeenAt).getTime();
      return !Number.isNaN(t) && t >= cutoff;
    });
  }, [stats, peoplePeriod]);

  const trendMeta = PERIOD_META[trendPeriod];
  const peopleMeta = PERIOD_META[peoplePeriod];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Real use from heartbeats — not logins.</p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Updated {lastUpdatedText}</span>
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Radio} label="Active now" value={v(stats?.activeNow)} hint="Last 3 minutes" live />
        <Kpi label="Today" value={v(stats?.dau)} hint="Last 24 hours" />
        <Kpi label="This week" value={v(stats?.wau)} hint="Last 7 days" />
        <Kpi label="This month" value={v(stats?.mau)} hint="Last 30 days" />
      </section>

      {platformTotal > 0 && (
        <p className="text-xs text-muted-foreground">
          This week:{' '}
          <span className="font-medium text-foreground">{platform.web} web</span>
          {platform.ios > 0 && (
            <>
              {' · '}
              <span className="font-medium text-foreground">{platform.ios} iOS</span>
            </>
          )}
          {platform.android > 0 && (
            <>
              {' · '}
              <span className="font-medium text-foreground">{platform.android} Android</span>
            </>
          )}
        </p>
      )}

      <Panel
        title="Is it growing?"
        subtitle={`${trendMeta.unitLabel} · each bar = number of people`}
        actions={<PeriodToggle value={trendPeriod} onChange={setTrendPeriod} />}
      >
        <GrowthChart
          series={trendSeries}
          loading={showLoading}
          unit={trendMeta.barUnit}
          emptyHint={trendMeta.empty}
        />
      </Panel>

      <section className="grid min-w-0 gap-5 lg:grid-cols-2">
        <Panel title="What they open" subtitle="Screens · last 7 days">
          <RankList
            items={stats?.popularPages7d ?? []}
            loading={showLoading}
            empty="No screen views yet"
          />
        </Panel>
        <Panel title="What they look up" subtitle="Tickers · last 7 days">
          <RankList
            items={stats?.topTickers7d ?? []}
            loading={showLoading}
            empty="No ticker views yet"
            accent="violet"
          />
        </Panel>
      </section>

      <Panel
        title="Who’s using it"
        subtitle={`${peopleRows.length} ${peopleRows.length === 1 ? 'person' : 'people'} · ${peopleMeta.peopleHint}`}
        actions={<PeriodToggle value={peoplePeriod} onChange={setPeoplePeriod} />}
      >
        <PeopleTable rows={peopleRows} loading={showLoading} emptyTitle={peopleMeta.peopleEmpty} />
      </Panel>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

const PERIOD_META: Record<
  Period,
  { unitLabel: string; barUnit: string; empty: string; peopleHint: string; peopleEmpty: string }
> = {
  day: {
    unitLabel: 'People per day · last 30 days',
    barUnit: 'people that day',
    empty: 'No daily activity yet.',
    peopleHint: 'active in the last 24 hours',
    peopleEmpty: 'Nobody active in the last day',
  },
  week: {
    unitLabel: 'People per week · last 12 weeks',
    barUnit: 'people that week',
    empty: 'No weekly activity yet.',
    peopleHint: 'active in the last 7 days',
    peopleEmpty: 'Nobody active in the last week',
  },
  month: {
    unitLabel: 'People per month · last 6 months',
    barUnit: 'people that month',
    empty: 'No monthly activity yet.',
    peopleHint: 'active in the last 30 days',
    peopleEmpty: 'Nobody active in the last month',
  },
};

function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const options: { id: Period; label: string }[] = [
    { id: 'day', label: 'Daily' },
    { id: 'week', label: 'Weekly' },
    { id: 'month', label: 'Monthly' },
  ];
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            value === o.id
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  live = false,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  hint: string;
  live?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        {live && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        {Icon && (
          <Icon
            size={18}
            className={live ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}
          />
        )}
        <span className="text-3xl font-semibold tracking-tight text-foreground">{value}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {actions}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

function GrowthChart({
  series,
  loading,
  unit,
  emptyHint,
}: {
  series: SeriesPoint[];
  loading: boolean;
  unit: string;
  emptyHint: string;
}) {
  const max = useMemo(() => Math.max(...series.map((p) => p.count), 0), [series]);
  const hasSignal = series.some((p) => p.count > 0);

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  if (!hasSignal) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyHint}</p>;
  }

  const peak = Math.max(max, 1);
  const totalPeopleDays = series.reduce((s, p) => s + p.count, 0);
  const avg = Math.round(totalPeopleDays / Math.max(series.filter((p) => p.count > 0).length, 1));

  // Fewer labels when many bars (daily)
  const labelEvery = series.length > 14 ? 5 : series.length > 8 ? 2 : 1;

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Number on each bar = how many unique people were active. Peak{' '}
        <span className="font-semibold text-foreground">{peak}</span> · typical{' '}
        <span className="font-semibold text-foreground">{avg}</span>.
      </p>
      <div className="flex items-end gap-1.5 overflow-x-auto pb-1 sm:gap-2">
        {series.map((p, i) => {
          const barH = p.count <= 0 ? 4 : Math.max(20, Math.round((p.count / peak) * 112));
          const showLabel = i % labelEvery === 0 || i === series.length - 1;
          return (
            <div
              key={p.date}
              className="flex w-10 shrink-0 flex-col items-center gap-1 sm:w-12"
              title={`${p.label}: ${p.count} ${unit}`}
            >
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  p.count > 0 ? 'text-foreground' : 'text-muted-foreground/50'
                }`}
              >
                {p.count}
              </span>
              <div
                className={`w-full rounded-t-md ${
                  p.count > 0 ? 'bg-sky-500' : 'bg-muted'
                }`}
                style={{ height: barH }}
              />
              <span
                className={`max-w-full truncate text-center text-[10px] leading-tight text-muted-foreground ${
                  showLabel ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {shortLabel(p)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function shortLabel(p: SeriesPoint): string {
  // day: "Oct 27", week: "Oct 20", month: "Oct"
  if (/^\d{4}-\d{2}$/.test(p.date)) {
    return p.label.split(' ')[0] ?? p.label;
  }
  if (p.label.startsWith('Week of ')) {
    return p.label.replace('Week of ', '');
  }
  return p.label;
}

function RankList({
  items,
  loading,
  empty,
  accent = 'sky',
}: {
  items: PopularItemRow[];
  loading: boolean;
  empty: string;
  accent?: 'sky' | 'violet';
}) {
  if (loading) return <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>;
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }

  const max = Math.max(...items.map((i) => i.count), 1);
  const bar = accent === 'violet' ? 'bg-violet-500' : 'bg-sky-500';

  return (
    <ol className="space-y-3">
      {items.slice(0, 8).map((item, i) => (
        <li key={item.key}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-4 shrink-0 tabular-nums text-xs text-muted-foreground">{i + 1}</span>
              <span className="truncate font-medium text-foreground">{item.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{numberFmt(item.count)}</span>
          </div>
          <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${bar}`}
              style={{ width: `${Math.max(6, (item.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function PlatformBadge({ platform }: { platform: ActivityPlatform }) {
  const styles: Record<ActivityPlatform, string> = {
    web: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    ios: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
    android: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  };
  const labels: Record<ActivityPlatform, string> = {
    web: 'Web',
    ios: 'iOS',
    android: 'Android',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[platform]}`}
    >
      {labels[platform]}
    </span>
  );
}

function PeopleTable({
  rows,
  loading,
  emptyTitle,
}: {
  rows: ActiveUserRow[];
  loading: boolean;
  emptyTitle: string;
}) {
  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  if (rows.length === 0) {
    return (
      <Empty
        icon={Eye}
        title={emptyTitle}
        description="People show up here when they open the product."
      />
    );
  }

  const sorted = [...rows].sort((a, b) => {
    if (a.isActiveNow !== b.isActiveNow) return a.isActiveNow ? -1 : 1;
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 pr-3">Person</th>
            <th className="pb-2 pr-3">Where</th>
            <th className="pb-2 pr-3">Last seen</th>
            <th className="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.userId} className="border-t border-border/70">
              <td className="py-2.5 pr-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{row.email}</span>
                  <PlatformBadge platform={row.platform} />
                </div>
              </td>
              <td className="py-2.5 pr-3 text-muted-foreground">{row.locationLabel}</td>
              <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} />
                  {relativeTime(row.lastSeenAt)}
                </span>
              </td>
              <td className="py-2.5">
                {row.isActiveNow ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Away</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({
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
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon size={20} />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>
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
