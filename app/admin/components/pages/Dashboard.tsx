'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import { useAdmin } from '../../_lib/admin-context';
import {
  loadDashboardStatsAction,
  type DashboardStats,
  type PortfolioRecapRowDisplay,
} from '../../_actions/dashboard';

const DASHBOARD_REFRESH_MS = 45_000;
const BACKGROUND_FETCH_THROTTLE_MS = 4_000;

const PORTFOLIO_SECTION_WEEKLY = 'Weekly momentum picks';
const PORTFOLIO_SECTION_ETF = 'ETF portfolios';

type DashboardProps = {
  /** When false (e.g. another admin tab is visible), polling and background refresh pause. */
  dataActive?: boolean;
};

export default function Dashboard({ dataActive = true }: DashboardProps) {
  const { getAccessToken } = useAdmin();
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
    if (!dataActive) return;

    mountedRef.current = true;
    void fetchStats();

    const intervalId = window.setInterval(() => {
      void fetchStats({ silent: true });
    }, DASHBOARD_REFRESH_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') throttledBackgroundFetch();
    };
    const onFocus = () => {
      throttledBackgroundFetch();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [dataActive, fetchStats, throttledBackgroundFetch]);

  const onManualRefresh = useCallback(() => {
    void fetchStats({ silent: true });
  }, [fetchStats]);

  const totalUsers = stats?.totalUsers ?? 0;
  const activeThisWeek = stats?.addedThisWeek ?? 0;
  const avgRecapReturn = stats?.recapAvgReturnDisplay ?? '—';
  const weeklyRecap = stats?.portfolioRecapWeekly ?? [];
  const etfRecap = stats?.portfolioRecapEtf ?? [];

  const lastUpdatedText = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <div className="flex w-full min-w-0 flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs admin-text-muted">
          Last updated: <span className="admin-text-main font-semibold">{lastUpdatedText}</span>
        </div>
        <button
          type="button"
          onClick={onManualRefresh}
          disabled={refreshing || loading}
          className="admin-border admin-text-muted rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <section className="flex flex-col gap-4 sm:flex-row sm:gap-6">
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
          label="Active This Week"
          value={loading ? '—' : numberFmt(activeThisWeek)}
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

      <section className="flex min-h-0 flex-col gap-6 mb-8">
        <PortfolioRecapSection title={PORTFOLIO_SECTION_WEEKLY} rows={weeklyRecap} />
        <PortfolioRecapSection title={PORTFOLIO_SECTION_ETF} rows={etfRecap} />
      </section>

      {error && (
        <div className="admin-border rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {loading && !stats && <div className="text-sm admin-text-muted">Loading…</div>}
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
  const valueClass =
    valueTone === 'positive'
      ? 'admin-green'
      : valueTone === 'negative'
        ? 'text-red-600'
        : 'admin-text-main';
  return (
    <div className={`admin-card flex min-w-0 flex-col rounded-2xl p-6 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-green-700/10">
          <Icon size={22} className="text-green-700" strokeWidth={1.75} />
        </div>
        <div
          className={`flex shrink-0 items-center gap-1 text-sm font-semibold ${
            positive ? 'admin-green' : 'text-red-600'
          }`}
        >
          <ArrowUpRight size={16} strokeWidth={2} className="opacity-90" />
          <span>{delta}</span>
        </div>
      </div>
      <div className={`mt-4 text-3xl font-bold leading-none tracking-tight md:text-4xl ${valueClass}`}>{value}</div>
      <div className="admin-text-muted mt-2 text-sm font-medium">{label}</div>
    </div>
  );
}

const RECAP_HEADERS: { key: keyof PortfolioRecapRowDisplay; label: string }[] = [
  { key: 'portfolioName', label: 'Portfolio' },
  { key: 'start', label: 'Start' },
  { key: 'initialValue', label: 'Initial Value' },
  { key: 'cashInvested', label: 'Cash Invested' },
  { key: 'portfolioValue', label: 'Portfolio Value' },
  { key: 'returnUsd', label: 'Return $' },
  { key: 'returnsPct', label: 'Returns %' },
  { key: 'hitRate', label: 'Hit Rate' },
  { key: 'avgGain', label: 'Avg Gain' },
  { key: 'avgLoss', label: 'Avg Loss' },
  { key: 'netAvgReturn', label: 'Net Avg Return' },
  { key: 'cagr', label: 'CAGR' },
  { key: 'holdingDays', label: 'Holding (days)' },
];

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
    return 'admin-text-main px-6 py-4 font-medium';
  }
  const sign = recapReturnSign(key, display);
  const base = 'px-6 py-4 tabular-nums text-sm';
  if (sign === 'positive') return `${base} admin-green font-semibold`;
  if (sign === 'negative') return `${base} font-semibold text-red-600`;
  return `${base} admin-text-muted`;
}

function PortfolioRecapSection({ title, rows }: { title: string; rows: PortfolioRecapRowDisplay[] }) {
  return (
    <div className="admin-card flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl shadow-sm">
      <div className="admin-border border-b px-4 py-4 md:px-6 md:py-5">
        <h3 className="admin-text-main text-lg font-semibold">{title}</h3>
        <p className="admin-text-muted mt-1 text-sm">performance_recap · read-only summary</p>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              {RECAP_HEADERS.map((h) => (
                <th key={h.key} className="whitespace-nowrap px-6 py-3">
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="admin-border-soft border-t">
                <td className="px-6 py-8 text-sm admin-text-muted" colSpan={RECAP_HEADERS.length}>
                  No recap rows for this group.
                </td>
              </tr>
            )}
            {rows.map((r, idx) => (
              <tr key={`${r.portfolioName}-${idx}`} className="admin-border-soft border-t text-sm">
                {RECAP_HEADERS.map((h) => {
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
