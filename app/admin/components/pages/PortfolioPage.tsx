'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  loadDashboardStatsAction,
  type PortfolioRecapRowDisplay,
} from '../../_actions/dashboard';
import {
  adminEtfRecapHeaders,
  adminWeeklyMomentumRecapHeaders,
  GROUP_WEEKLY_MOMENTUM_TITLE,
} from '@/lib/portfolio/recap-table-columns';

const REFRESH_MS = 45_000;
const THROTTLE_MS = 4_000;
const PORTFOLIO_SECTION_ETF = 'ETF portfolios';

type Props = { dataActive?: boolean };

export default function PortfolioPage({ dataActive = true }: Props) {
  const { getAccessToken } = useAdmin();
  const [weeklyRecap, setWeeklyRecap] = useState<PortfolioRecapRowDisplay[]>([]);
  const [etfRecap, setEtfRecap] = useState<PortfolioRecapRowDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const hasDataRef = useRef(false);
  const lastBackgroundFetchAtRef = useRef(0);

  const fetchData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (inFlightRef.current) return inFlightRef.current;
      const treatAsSilent = Boolean(opts?.silent && hasDataRef.current);
      const task = (async () => {
        if (!treatAsSilent) setLoading(true);
        if (treatAsSilent) setRefreshing(true);
        setError(null);
        try {
          const token = await getAccessToken();
          const res = await loadDashboardStatsAction(token);
          if (!mountedRef.current) return;
          if (res.ok) {
            setWeeklyRecap(res.data.portfolioRecapWeekly ?? []);
            setEtfRecap(res.data.portfolioRecapEtf ?? []);
            hasDataRef.current = true;
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
    if (now - lastBackgroundFetchAtRef.current < THROTTLE_MS) return;
    lastBackgroundFetchAtRef.current = now;
    void fetchData({ silent: true });
  }, [fetchData]);

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
    channelName: 'admin-portfolio-live',
    getAccessToken,
    refresh: throttledBackgroundFetch,
    realtime: [{ schema: 'public', table: 'performance_recap' }],
  });

  useEffect(() => {
    if (!dataActive) return;
    void fetchData();
  }, [dataActive, fetchData]);

  const lastUpdatedText = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

  return (
    <div className={adminPageStack}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Last updated: <span className="font-semibold text-foreground">{lastUpdatedText}</span>
        </div>
        <AdminGhostButton onClick={() => void fetchData({ silent: true })} disabled={refreshing || loading}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </AdminGhostButton>
      </div>

      {error && <AdminAlert>{error}</AdminAlert>}
      {loading && weeklyRecap.length === 0 && etfRecap.length === 0 && (
        <div className="text-sm text-muted-foreground">Loading…</div>
      )}

      <section className="flex min-h-0 flex-col gap-5 sm:gap-6">
        <PortfolioRecapSection
          title={GROUP_WEEKLY_MOMENTUM_TITLE}
          rows={weeklyRecap}
          headers={adminWeeklyMomentumRecapHeaders()}
        />
        <PortfolioRecapSection
          title={PORTFOLIO_SECTION_ETF}
          rows={etfRecap}
          headers={adminEtfRecapHeaders()}
        />
      </section>
    </div>
  );
}

const adminTdBase = adminTd.replace(' text-foreground', '');
const RECAP_HEADERS = adminEtfRecapHeaders();

function recapReturnSign(
  key: keyof PortfolioRecapRowDisplay,
  display: string
): 'positive' | 'negative' | 'neutral' {
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
  if (key === 'portfolioName') return `${adminTd} font-medium`;
  const sign = recapReturnSign(key, display);
  const base = `${adminTdBase} tabular-nums`;
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
    <div className={`${adminSurface} flex min-h-0 min-w-0 flex-col`}>
      <div className="border-b border-border/80 px-5 py-4 sm:px-6">
        <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          performance_recap · read-only summary
        </p>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-auto">
        <table className="w-full min-w-275 border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left">
              {headers.map((h) => (
                <th key={h.key} className={adminTh}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className={`${adminTd} py-8 text-muted-foreground`} colSpan={headers.length}>
                  No recap rows for this group.
                </td>
              </tr>
            )}
            {rows.map((r, idx) => (
              <tr key={`${r.portfolioName}-${idx}`} className="transition-colors hover:bg-muted/30">
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
