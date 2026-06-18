'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, TrendingUp, UserCheck, Users, type LucideIcon } from 'lucide-react';
import { useAdmin } from '../../_lib/admin-context';
import { useLiveAdminRefresh } from '../../_lib/use-live-admin-refresh';
import {
  loadDashboardStatsAction,
  type DashboardStats,
  type PortfolioRecapRowDisplay,
} from '../../_actions/dashboard';
import {
  adminEtfRecapHeaders,
  adminWeeklyMomentumRecapHeaders,
  GROUP_WEEKLY_MOMENTUM_TITLE,
} from '@/lib/portfolio/recap-table-columns';

const DASHBOARD_REFRESH_MS = 45_000;
const BACKGROUND_FETCH_THROTTLE_MS = 4_000;

const PORTFOLIO_SECTION_ETF = 'ETF portfolios';

type DashboardProps = {
  /** When false (e.g. another admin tab is visible), polling and background refresh pause. */
  dataActive?: boolean;
};

export default function Dashboard({ dataActive = true }: DashboardProps) {
  const { getAccessToken } = useAdmin();
  const [dashTab, setDashTab] = useState<'overview' | 'activity'>('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
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
          const res = await loadDashboardStatsAction(token);
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
    [getAccessToken]
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
    pollingMs: DASHBOARD_REFRESH_MS,
    throttleMs: BACKGROUND_FETCH_THROTTLE_MS,
    channelName: 'admin-dashboard-live',
    getAccessToken,
    refresh: throttledBackgroundFetch,
    realtime: [
      { schema: 'public', table: 'api_health_log' },
      { schema: 'public', table: 'authorized_users' },
      { schema: 'public', table: 'performance_recap' },
    ],
  });

  useEffect(() => {
    if (!dataActive) return;
    void fetchStats();
  }, [dataActive, fetchStats]);

  const onManualRefresh = useCallback(() => {
    void fetchStats({ silent: true });
  }, [fetchStats]);

  const totalUsers = stats?.totalUsers ?? 0;
  const joinedThisWeek = stats?.addedThisWeek ?? 0;
  const avgRecapReturn = stats?.recapAvgReturnDisplay ?? '—';
  const weeklyRecap = stats?.portfolioRecapWeekly ?? [];
  const etfRecap = stats?.portfolioRecapEtf ?? [];

  const lastUpdatedText = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 sm:gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Last updated: <span className="font-semibold text-foreground">{lastUpdatedText}</span>
        </div>
        <button
          type="button"
          onClick={onManualRefresh}
          disabled={refreshing || loading}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setDashTab('overview')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            dashTab === 'overview' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setDashTab('activity')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            dashTab === 'activity' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Activity
        </button>
      </div>

      {dashTab === 'overview' && (
        <>
          <section className="flex flex-col gap-4 sm:flex-row sm:gap-5">
            <KpiCard
              className="min-w-0 flex-1 sm:basis-0"
              icon={Users}
              label="Total Users"
              value={loading ? '—' : numberFmt(totalUsers)}
              delta={loading ? '—' : `${stats?.admins ?? 0} admins`}
              positive
            />
            <KpiCard
              className="min-w-0 flex-1 sm:basis-0"
              icon={Activity}
              label="New users (7d)"
              value={loading ? '—' : numberFmt(joinedThisWeek)}
              delta={loading ? '—' : `${stats?.runsLast24h ?? 0} jobs / 24h`}
              positive
            />
            <KpiCard
              className="min-w-0 flex-1 sm:basis-0"
              icon={TrendingUp}
              label="Avg recap return"
              value={loading ? '—' : avgRecapReturn}
              delta={loading ? '—' : `${stats?.successLast24h ?? 0} successful runs`}
              valueTone={
                loading || avgRecapReturn === '—'
                  ? 'neutral'
                  : avgRecapReturn.trim().startsWith('-')
                    ? 'negative'
                    : 'positive'
              }
              positive
            />
          </section>

          <section className="mb-8 flex min-h-0 flex-col gap-5 sm:gap-6">
            <PortfolioRecapSection title={GROUP_WEEKLY_MOMENTUM_TITLE} rows={weeklyRecap} headers={adminWeeklyMomentumRecapHeaders()} />
            <PortfolioRecapSection title={PORTFOLIO_SECTION_ETF} rows={etfRecap} headers={adminEtfRecapHeaders()} />
          </section>
        </>
      )}

      {dashTab === 'activity' && <DashboardActivityTab stats={stats} loading={loading} />}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive dark:border-destructive/40 dark:bg-destructive/15">
          {error}
        </div>
      )}
      {loading && !stats && <div className="text-sm text-muted-foreground">Loading…</div>}
    </div>
  );
}

function DashboardActivityTab({ stats, loading }: { stats: DashboardStats | null; loading: boolean }) {
  const v = (n: number | undefined) => (loading ? '—' : numberFmt(n ?? 0));
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        These numbers use Supabase Auth <span className="font-medium text-foreground">last_sign_in_at</span> only: we
        count accounts that authenticated within the window. That updates on sign-in (not every click), so it is a
        privacy-light proxy for &ldquo;who is active&rdquo; without tracking browsing behavior.
      </p>
      <section className="flex flex-col gap-4 sm:flex-row sm:gap-5">
        <KpiCard
          className="min-w-0 flex-1 sm:basis-0"
          icon={UserCheck}
          label="Signed in (15 min)"
          value={v(stats?.activeSignIn15m)}
          delta={loading ? '—' : `${numberFmt(stats?.totalAuthAccounts ?? 0)} auth accounts`}
          positive
        />
        <KpiCard
          className="min-w-0 flex-1 sm:basis-0"
          icon={Activity}
          label="Signed in (24 h)"
          value={v(stats?.activeSignIn24h)}
          delta={loading ? '—' : 'Same last_sign_in basis'}
          positive
        />
        <KpiCard
          className="min-w-0 flex-1 sm:basis-0"
          icon={Users}
          label="Auth accounts"
          value={v(stats?.totalAuthAccounts)}
          delta={loading ? '—' : `${numberFmt(stats?.totalUsers ?? 0)} on allowlist`}
          positive
        />
      </section>
      <p className="text-xs text-muted-foreground">
        Allowlist total is from <span className="font-mono text-foreground">authorized_users</span>. Auth accounts can
        include users not yet on the allowlist.
      </p>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  positive,
  valueTone = 'neutral',
  className = '',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  /** Color for the main KPI number (default gray). */
  valueTone?: 'neutral' | 'positive' | 'negative';
  className?: string;
}) {
  const iconWrap =
    label === 'Total Users'
      ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
      : label === 'New users (7d)'
        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
        : label === 'Signed in (15 min)' || label === 'Signed in (24 h)'
          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
          : label === 'Auth accounts'
            ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
            : 'bg-sky-500/15 text-sky-600 dark:text-sky-400';
  const valueClass =
    valueTone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : valueTone === 'negative'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-foreground';
  return (
    <div
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6 ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg sm:h-12 sm:w-12 ${iconWrap}`}>
          <Icon size={22} strokeWidth={1.75} />
        </div>
        <div
          className={`flex shrink-0 items-center gap-1 text-xs font-semibold sm:text-sm ${
            positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          <ArrowUpRight size={16} strokeWidth={2} className="opacity-90" />
          <span>{delta}</span>
        </div>
      </div>
      <div className={`mt-4 text-2xl font-semibold leading-none tracking-tight sm:text-3xl md:text-[1.75rem] ${valueClass}`}>
        {value}
      </div>
      <div className="mt-2 text-sm font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

const RECAP_HEADERS = adminEtfRecapHeaders();

/** Signed parse for return $ / returns % / net avg return cells (formatted strings). */
function recapReturnSign(key: keyof PortfolioRecapRowDisplay, display: string): 'positive' | 'negative' | 'neutral' {
  if (key !== 'returnUsd' && key !== 'returnsPct' && key !== 'netAvgReturn') return 'neutral';
  if (display === '—' || !display) return 'neutral';
  const cleaned = display.replace(/\$/g, '').replace(/,/g, '').replace(/%/g, '').trim();
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 'neutral';
  if (n > 0) return 'positive';
  if (n < 0) return 'negative';
  return 'neutral';
}

function portfolioCellClass(key: keyof PortfolioRecapRowDisplay, display: string): string {
  if (key === 'portfolioName') {
    return 'px-4 py-3.5 text-sm font-medium text-foreground sm:px-6 sm:py-4';
  }
  const sign = recapReturnSign(key, display);
  const base = 'px-4 py-3.5 tabular-nums text-sm sm:px-6 sm:py-4';
  if (sign === 'positive') return `${base} font-semibold text-emerald-600 dark:text-emerald-400`;
  if (sign === 'negative') return `${base} font-semibold text-rose-600 dark:text-rose-400`;
  return `${base} text-muted-foreground`;
}

function PortfolioRecapSection({
  title,
  rows,
  headers = RECAP_HEADERS,
}: {
  title: string;
  rows: PortfolioRecapRowDisplay[];
  headers?: { key: keyof PortfolioRecapRowDisplay; label: string }[];
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/40 px-4 py-4 sm:px-5 sm:py-4">
        <h3 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">performance_recap · read-only summary</p>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-auto">
        <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left">
              {headers.map((h) => (
                <th
                  key={h.key}
                  className="whitespace-nowrap border-b border-border bg-muted/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-6 sm:text-[11px]"
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="border-b border-border">
                <td className="px-4 py-8 text-sm text-muted-foreground sm:px-6" colSpan={headers.length}>
                  No recap rows for this group.
                </td>
              </tr>
            )}
            {rows.map((r, idx) => (
              <tr
                key={`${r.portfolioName}-${idx}`}
                className="border-b border-border transition-colors last:border-b-0 hover:bg-muted/30"
              >
                {headers.map((h) => {
                  const display = r[h.key];
                  return (
                    <td key={h.key} className={portfolioCellClass(h.key, display)}>
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function numberFmt(n: number) {
  return n.toLocaleString('en-US');
}
