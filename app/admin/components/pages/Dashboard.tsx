'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Eye } from 'lucide-react';
import {
  AdminAlert,
  AdminGhostButton,
  adminPageStack,
  adminSurface,
  adminTd,
  adminTh,
} from '../ui/admin-ui';
import { useAdmin } from '../../_lib/admin-context';
import { useLiveAdminRefresh } from '../../_lib/use-live-admin-refresh';
import { loadDashboardStatsAction, type DashboardStats } from '../../_actions/dashboard';
import {
  loadActivityStatsAction,
  type ActivityStats,
  type ActiveUserRow,
  type PopularItemRow,
  type SeriesPoint,
} from '../../_actions/activity';
import type { ActivityPlatform } from '@/lib/activity/labels';

const REFRESH_MS = 35_000;
const THROTTLE_MS = 3_500;
const DAY_MS = 24 * 60 * 60 * 1000;

type Period = 'day' | 'week' | 'month';
type Props = { dataActive?: boolean };

export default function Dashboard({ dataActive = true }: Props) {
  const { getAccessToken } = useAdmin();
  const [dash, setDash] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trendPeriod, setTrendPeriod] = useState<Period>('day');
  const [peoplePeriod, setPeoplePeriod] = useState<Period>('day');
  const mountedRef = useRef(true);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const hasDataRef = useRef(false);
  const lastBackgroundFetchAtRef = useRef(0);

  const fetchAll = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (inFlightRef.current) return inFlightRef.current;
      const treatAsSilent = Boolean(opts?.silent && hasDataRef.current);
      const task = (async () => {
        if (!treatAsSilent) setLoading(true);
        if (treatAsSilent) setRefreshing(true);
        setError(null);
        try {
          const token = await getAccessToken();
          const [dashRes, actRes] = await Promise.all([
            loadDashboardStatsAction(token),
            loadActivityStatsAction(token),
          ]);
          if (!mountedRef.current) return;
          const errors: string[] = [];
          if (dashRes.ok) setDash(dashRes.data);
          else errors.push(dashRes.error);
          if (actRes.ok) setActivity(actRes.data);
          else errors.push(actRes.error);
          if (dashRes.ok || actRes.ok) {
            hasDataRef.current = true;
            setLastUpdatedAt(Date.now());
          }
          if (errors.length) setError(errors[0]!);
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
    [getAccessToken]
  );

  const throttledBackgroundFetch = useCallback(() => {
    const now = Date.now();
    if (now - lastBackgroundFetchAtRef.current < THROTTLE_MS) return;
    lastBackgroundFetchAtRef.current = now;
    void fetchAll({ silent: true });
  }, [fetchAll]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useLiveAdminRefresh({
    enabled: dataActive,
    pollingMs: REFRESH_MS,
    throttleMs: THROTTLE_MS,
    channelName: 'admin-dashboard-live',
    getAccessToken,
    refresh: throttledBackgroundFetch,
    realtime: [
      { schema: 'public', table: 'api_health_log' },
      { schema: 'public', table: 'authorized_users' },
      { schema: 'public', table: 'user_activity_sessions' },
      { schema: 'public', table: 'user_activity_events' },
    ],
  });

  useEffect(() => {
    if (!dataActive) return;
    void fetchAll();
  }, [dataActive, fetchAll]);

  const showLoading = loading && !dash && !activity;
  const v = (n: number | undefined) => (showLoading ? '—' : numberFmt(n ?? 0));

  const platform = activity?.wauByPlatform ?? { web: 0, ios: 0, android: 0 };
  const platformBits = [
    platform.web ? `${platform.web} web` : null,
    platform.ios ? `${platform.ios} iOS` : null,
    platform.android ? `${platform.android} Android` : null,
  ].filter(Boolean);

  const trendSeries = useMemo(() => {
    if (!activity) return [];
    if (trendPeriod === 'week') return activity.wauSeries ?? [];
    if (trendPeriod === 'month') return activity.mauSeries ?? [];
    return activity.dauSeries ?? [];
  }, [activity, trendPeriod]);

  const peopleRows = useMemo(() => {
    const rows = activity?.activeUsers ?? [];
    const maxAge =
      peoplePeriod === 'day' ? DAY_MS : peoplePeriod === 'week' ? 7 * DAY_MS : 30 * DAY_MS;
    const cutoff = Date.now() - maxAge;
    return rows.filter((r) => {
      const t = new Date(r.lastSeenAt).getTime();
      return !Number.isNaN(t) && t >= cutoff;
    });
  }, [activity, peoplePeriod]);

  const trendMeta = PERIOD_META[trendPeriod];
  const peopleMeta = PERIOD_META[peoplePeriod];
  const lastUpdatedText = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '—';

  const usersHint = showLoading
    ? '—'
    : `${dash?.admins ?? 0} admins · +${dash?.addedThisWeek ?? 0} this week`;
  const weekHint =
    platformBits.length > 0 ? platformBits.join(' · ') : 'Last 7 days';

  return (
    <div className={adminPageStack}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Updated <span className="font-medium text-foreground">{lastUpdatedText}</span>
        </p>
        <AdminGhostButton
          onClick={() => void fetchAll({ silent: true })}
          disabled={refreshing || loading}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </AdminGhostButton>
      </div>

      {error && <AdminAlert>{error}</AdminAlert>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Users" value={v(dash?.totalUsers)} hint={usersHint} />
        <Metric
          label="Active now"
          value={v(activity?.activeNow ?? dash?.activeNow)}
          hint="Last 3 minutes"
          live
        />
        <Metric label="Today" value={v(activity?.dau ?? dash?.usageDau)} hint="Last 24 hours" />
        <Metric label="This week" value={v(activity?.wau)} hint={weekHint} />
      </section>

      <Panel
        title="Growth"
        subtitle={trendMeta.unitLabel}
        actions={<PeriodToggle value={trendPeriod} onChange={setTrendPeriod} />}
      >
        <GrowthChart
          series={trendSeries}
          loading={showLoading}
          unit={trendMeta.barUnit}
          emptyHint={trendMeta.empty}
        />
      </Panel>

      <section className="grid min-w-0 gap-5 sm:gap-6 lg:grid-cols-2">
        <Panel title="Screens" subtitle="Opened · last 7 days">
          <RankList
            items={activity?.popularPages7d ?? []}
            loading={showLoading}
            empty="No screen views yet"
          />
        </Panel>
        <Panel title="Tickers" subtitle="Looked up · last 7 days">
          <RankList
            items={activity?.topTickers7d ?? []}
            loading={showLoading}
            empty="No ticker views yet"
            accent="green"
          />
        </Panel>
      </section>

      <Panel
        title="People"
        subtitle={`${peopleRows.length} ${peopleRows.length === 1 ? 'person' : 'people'} · ${peopleMeta.peopleHint}`}
        actions={<PeriodToggle value={peoplePeriod} onChange={setPeoplePeriod} />}
      >
        <PeopleTable rows={peopleRows} loading={showLoading} emptyTitle={peopleMeta.peopleEmpty} />
      </Panel>
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
    <div className="inline-flex rounded-full border border-black/8 bg-muted/50 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
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

function Metric({
  label,
  value,
  hint,
  live = false,
}: {
  label: string;
  value: string;
  hint: string;
  live?: boolean;
}) {
  return (
    <div className={`${adminSurface} px-5 py-5 sm:px-6`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          {label}
        </div>
        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            Live
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-[1.75rem] font-semibold tracking-tight tabular-nums text-foreground sm:text-[2rem]">
        {value}
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>
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
    <div className={adminSurface}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/6 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {actions}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
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
  const labelEvery = series.length > 14 ? 5 : series.length > 8 ? 2 : 1;

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Peak <span className="font-semibold text-foreground">{peak}</span>
        {' · '}
        typical <span className="font-semibold text-foreground">{avg}</span>
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
                className={`w-full rounded-t-md ${p.count > 0 ? 'bg-primary' : 'bg-muted'}`}
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
  if (/^\d{4}-\d{2}$/.test(p.date)) return p.label.split(' ')[0] ?? p.label;
  if (p.label.startsWith('Week of ')) return p.label.replace('Week of ', '');
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
  accent?: 'sky' | 'green';
}) {
  if (loading) return <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>;
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }

  const max = Math.max(...items.map((i) => i.count), 1);
  const bar = accent === 'green' ? 'bg-primary' : 'bg-sky-500';

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
    web: 'bg-sky-500/10 text-sky-700',
    ios: 'bg-slate-500/10 text-slate-700',
    android: 'bg-primary/10 text-primary',
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
      <div className="flex flex-col items-center px-4 py-10 text-center">
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Eye size={18} />
        </div>
        <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          People show up here when they open the product.
        </p>
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) => {
    if (a.isActiveNow !== b.isActiveNow) return a.isActiveNow ? -1 : 1;
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-130 border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className={adminTh}>Person</th>
            <th className={adminTh}>Where</th>
            <th className={adminTh}>Last seen</th>
            <th className={adminTh}>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.userId} className="transition-colors hover:bg-muted/30">
              <td className={adminTd}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{row.email}</span>
                  <PlatformBadge platform={row.platform} />
                </div>
              </td>
              <td className={`${adminTd} text-muted-foreground`}>{row.locationLabel}</td>
              <td className={`${adminTd} tabular-nums text-muted-foreground`}>
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} />
                  {relativeTime(row.lastSeenAt)}
                </span>
              </td>
              <td className={adminTd}>
                {row.isActiveNow ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    <span className="size-1.5 rounded-full bg-primary" />
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
