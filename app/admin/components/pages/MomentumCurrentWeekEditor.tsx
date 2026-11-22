'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Save, Lock } from 'lucide-react';
import {
  AdminAlert,
  AdminGhostButton,
  AdminPrimaryButton,
  adminField,
  adminMuted,
  adminSelect,
  adminSurface,
  adminSurfacePad,
  adminTd,
  adminTh,
} from '../ui/admin-ui';
import { useAdmin } from '../../_lib/admin-context';
import {
  closeWeekAction,
  getCurrentWeekAction,
  getMomentumKpisAction,
  listTrackRecordAction,
  refreshCurrentWeekPricesAction,
  saveCurrentWeekAction,
} from '../../_actions/momentum';
import type { MomentumCurrentPick, MomentumCurrentWeek, MomentumKpis, MomentumTrackWeek } from '@/lib/momentum/types';
import { MOMENTUM_STRATEGIES } from '@/lib/momentum/types';
import {
  formatRatioAsPct,
  formatTotalReturnPct,
  return5d,
  stopLossDollars,
  takeProfitDollars,
} from '@/lib/momentum/formulas';
import { formatPickCell } from '@/lib/momentum/csv';

function numOrNull(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function pctInputFromRatio(ratio: number | null): string {
  if (ratio == null) return '';
  // Store as decimal in DB; show as percent points in inputs when |x|<1 and looks like ratio
  return String(ratio);
}

export default function MomentumCurrentWeekEditor({ dataActive = true }: { dataActive?: boolean }) {
  const { getAccessToken } = useAdmin();
  const [week, setWeek] = useState<MomentumCurrentWeek | null>(null);
  const [draftYear, setDraftYear] = useState('');
  const [draftWeek, setDraftWeek] = useState('');
  const [draftStart, setDraftStart] = useState('');
  const [picks, setPicks] = useState<MomentumCurrentPick[]>([]);
  const [track, setTrack] = useState<MomentumTrackWeek[]>([]);
  const [kpis, setKpis] = useState<MomentumKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const [cw, tr, kp] = await Promise.all([
        getCurrentWeekAction(token),
        listTrackRecordAction(token, { limit: 12 }),
        getMomentumKpisAction(token),
      ]);
      if (!cw.ok) throw new Error(cw.error);
      if (!tr.ok) throw new Error(tr.error);
      if (!kp.ok) throw new Error(kp.error);
      setWeek(cw.data);
      setDraftYear(String(cw.data.year));
      setDraftWeek(String(cw.data.week));
      setDraftStart(cw.data.weekStart);
      setPicks(cw.data.picks.map((p) => ({ ...p })));
      setTrack(tr.data);
      setKpis(kp.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (!dataActive) return;
    void load();
  }, [dataActive, load]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const updatePick = (strategy: MomentumCurrentPick['strategy'], patch: Partial<MomentumCurrentPick>) => {
    setPicks((prev) =>
      prev.map((p) => {
        if (p.strategy !== strategy) return p;
        const next = { ...p, ...patch };
        const computed = return5d(next.weekOpen, next.currentPrice, next.direction || null);
        // If returnStopLoss was equal to old return5d (no override), keep in sync
        const hadOverride =
          p.returnStopLoss != null &&
          p.return5d != null &&
          Math.abs(p.returnStopLoss - p.return5d) > 1e-9;
        if (!hadOverride && patch.returnStopLoss === undefined) {
          next.return5d = computed;
          next.returnStopLoss = computed;
        } else if (patch.return5d === undefined && computed != null && patch.currentPrice !== undefined) {
          next.return5d = computed;
        }
        return next;
      })
    );
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await saveCurrentWeekAction(token, {
        year: Number(draftYear),
        week: Number(draftWeek),
        weekStart: draftStart,
        picks: picks.map((p) => ({
          strategy: p.strategy,
          ticker: p.ticker,
          direction: p.direction,
          weekOpen: p.weekOpen,
          stopLossPct: p.stopLossPct,
          takeProfitPct: p.takeProfitPct,
          currentPrice: p.currentPrice,
          return5d: p.return5d,
          returnStopLoss: p.returnStopLoss,
          comments: p.comments,
        })),
      });
      if (!res.ok) throw new Error(res.error);
      setWeek(res.data);
      setPicks(res.data.picks.map((p) => ({ ...p })));
      setToast('Current week saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const onRefreshPrices = async () => {
    setRefreshing(true);
    setError(null);
    try {
      // Persist draft first so tickers are on the server
      const token = await getAccessToken();
      const saved = await saveCurrentWeekAction(token, {
        year: Number(draftYear),
        week: Number(draftWeek),
        weekStart: draftStart,
        picks: picks.map((p) => ({
          strategy: p.strategy,
          ticker: p.ticker,
          direction: p.direction,
          weekOpen: p.weekOpen,
          stopLossPct: p.stopLossPct,
          takeProfitPct: p.takeProfitPct,
          currentPrice: p.currentPrice,
          return5d: p.return5d,
          returnStopLoss: p.returnStopLoss,
          comments: p.comments,
        })),
      });
      if (!saved.ok) throw new Error(saved.error);
      const res = await refreshCurrentWeekPricesAction(token);
      if (!res.ok) throw new Error(res.error);
      setWeek(res.data);
      setPicks(res.data.picks.map((p) => ({ ...p })));
      setToast('Prices refreshed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Price refresh failed.');
    } finally {
      setRefreshing(false);
    }
  };

  const onCloseWeek = async () => {
    const okConfirm = window.confirm(
      'Close this week? It will append a Track Record row and open the next week shell. This cannot be undone from the UI.'
    );
    if (!okConfirm) return;
    setClosing(true);
    setError(null);
    try {
      const token = await getAccessToken();
      // Persist first
      const saved = await saveCurrentWeekAction(token, {
        year: Number(draftYear),
        week: Number(draftWeek),
        weekStart: draftStart,
        picks: picks.map((p) => ({
          strategy: p.strategy,
          ticker: p.ticker,
          direction: p.direction,
          weekOpen: p.weekOpen,
          stopLossPct: p.stopLossPct,
          takeProfitPct: p.takeProfitPct,
          currentPrice: p.currentPrice,
          return5d: p.return5d,
          returnStopLoss: p.returnStopLoss,
          comments: p.comments,
        })),
      });
      if (!saved.ok) throw new Error(saved.error);

      const res = await closeWeekAction(token);
      if (!res.ok) throw new Error(res.error);
      setWeek(res.data.next);
      setDraftYear(String(res.data.next.year));
      setDraftWeek(String(res.data.next.week));
      setDraftStart(res.data.next.weekStart);
      setPicks(res.data.next.picks.map((p) => ({ ...p })));
      const [tr, kp] = await Promise.all([
        listTrackRecordAction(token, { limit: 12 }),
        getMomentumKpisAction(token),
      ]);
      if (tr.ok) setTrack(tr.data);
      if (kp.ok) setKpis(kp.data);
      setToast(
        `Closed ${res.data.track.year} W${res.data.track.week}. Next week ${res.data.next.year} W${res.data.next.week} is open.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Close week failed.');
    } finally {
      setClosing(false);
    }
  };

  const strategyLabel = useMemo(() => {
    const m = new Map(MOMENTUM_STRATEGIES.map((s) => [s.id, s.label]));
    return (id: MomentumCurrentPick['strategy']) => m.get(id) ?? id;
  }, []);

  if (loading) {
    return (
      <div className={`${adminSurface} ${adminSurfacePad} flex items-center gap-2 text-sm text-muted-foreground`}>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Current Week…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? <AdminAlert tone="error">{error}</AdminAlert> : null}
      {toast ? <AdminAlert tone="success">{toast}</AdminAlert> : null}

      {kpis ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: 'Total Return', value: formatTotalReturnPct(kpis.totalReturn, 0) },
            { label: 'CAGR', value: formatRatioAsPct(kpis.cagr, 1) },
            { label: 'Hit Rate', value: formatRatioAsPct(kpis.hitRate, 0) },
          ].map((k) => (
            <div key={k.label} className={`${adminSurface} ${adminSurfacePad}`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                {k.label}
              </div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{k.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className={`${adminSurface} ${adminSurfacePad} flex flex-col gap-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Current week</h2>
            <p className={adminMuted}>Edit picks, refresh prices, then close the week into Track Record.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AdminGhostButton icon={RefreshCw} disabled={refreshing || saving || closing} onClick={() => void onRefreshPrices()}>
              {refreshing ? 'Refreshing…' : 'Refresh prices'}
            </AdminGhostButton>
            <AdminGhostButton icon={Save} disabled={saving || refreshing || closing} onClick={() => void onSave()}>
              {saving ? 'Saving…' : 'Save'}
            </AdminGhostButton>
            <AdminPrimaryButton icon={Lock} disabled={closing || saving || refreshing} onClick={() => void onCloseWeek()}>
              {closing ? 'Closing…' : 'Close the week'}
            </AdminPrimaryButton>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Year</span>
            <input className={adminField} value={draftYear} onChange={(e) => setDraftYear(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Week</span>
            <input className={adminField} value={draftWeek} onChange={(e) => setDraftWeek(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Week start</span>
            <input
              type="date"
              className={adminField}
              value={draftStart}
              onChange={(e) => setDraftStart(e.target.value)}
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-220 border-collapse text-left">
            <thead>
              <tr>
                {[
                  'Strategy',
                  'Pick',
                  'Dir',
                  'Open',
                  'Stop %',
                  'TP %',
                  'Stop $',
                  'TP $',
                  'Price',
                  'Ret 5d',
                  'w/ Stop',
                  'Comments',
                ].map((h) => (
                  <th key={h} className={adminTh}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {picks.map((p) => {
                const stop$ = stopLossDollars(p.weekOpen, p.stopLossPct, p.direction || null);
                const tp$ = takeProfitDollars(p.weekOpen, p.takeProfitPct, p.direction || null);
                const live5d = return5d(p.weekOpen, p.currentPrice, p.direction || null);
                return (
                  <tr key={p.strategy}>
                    <td className={adminTd}>{strategyLabel(p.strategy)}</td>
                    <td className={adminTd}>
                      <input
                        className={`${adminField} min-w-20 uppercase`}
                        value={p.ticker}
                        onChange={(e) => updatePick(p.strategy, { ticker: e.target.value.toUpperCase() })}
                      />
                    </td>
                    <td className={adminTd}>
                      <select
                        className={`${adminSelect} min-w-24`}
                        value={p.direction}
                        onChange={(e) =>
                          updatePick(p.strategy, {
                            direction: e.target.value as MomentumCurrentPick['direction'],
                          })
                        }
                      >
                        <option value="">—</option>
                        <option value="long">Long</option>
                        <option value="short">Short</option>
                      </select>
                    </td>
                    <td className={adminTd}>
                      <input
                        className={`${adminField} min-w-20`}
                        value={p.weekOpen ?? ''}
                        onChange={(e) => updatePick(p.strategy, { weekOpen: numOrNull(e.target.value) })}
                      />
                    </td>
                    <td className={adminTd}>
                      <input
                        className={`${adminField} min-w-18`}
                        value={pctInputFromRatio(p.stopLossPct)}
                        onChange={(e) => updatePick(p.strategy, { stopLossPct: numOrNull(e.target.value) })}
                        placeholder="-0.02"
                      />
                    </td>
                    <td className={adminTd}>
                      <input
                        className={`${adminField} min-w-18`}
                        value={pctInputFromRatio(p.takeProfitPct)}
                        onChange={(e) => updatePick(p.strategy, { takeProfitPct: numOrNull(e.target.value) })}
                        placeholder="0.06"
                      />
                    </td>
                    <td className={`${adminTd} tabular-nums text-muted-foreground`}>
                      {stop$ == null ? '—' : stop$.toFixed(2)}
                    </td>
                    <td className={`${adminTd} tabular-nums text-muted-foreground`}>
                      {tp$ == null ? '—' : tp$.toFixed(2)}
                    </td>
                    <td className={adminTd}>
                      <input
                        className={`${adminField} min-w-20`}
                        value={p.currentPrice ?? ''}
                        onChange={(e) => updatePick(p.strategy, { currentPrice: numOrNull(e.target.value) })}
                      />
                    </td>
                    <td className={`${adminTd} tabular-nums`}>
                      {formatRatioAsPct(p.return5d ?? live5d, 2)}
                    </td>
                    <td className={adminTd}>
                      <input
                        className={`${adminField} min-w-20`}
                        value={p.returnStopLoss ?? ''}
                        onChange={(e) => updatePick(p.strategy, { returnStopLoss: numOrNull(e.target.value) })}
                        title="Override Return with Stop/Loss (defaults to Return 5-d)"
                      />
                    </td>
                    <td className={adminTd}>
                      <input
                        className={`${adminField} min-w-36`}
                        value={p.comments}
                        onChange={(e) => updatePick(p.strategy, { comments: e.target.value })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Stop % / TP % are decimals (e.g. -0.02 = −2%, 0.06 = 6%). Return w/ Stop defaults to Return 5-d; edit to override.
          {week ? ` Status: ${week.status}.` : null}
        </p>
      </div>

      <div className={`${adminSurface} ${adminSurfacePad}`}>
        <h3 className="text-base font-semibold tracking-tight text-foreground">Recent track record</h3>
        <p className={`${adminMuted} mb-3`}>Read-only preview (newest first). Closed weeks are not editable here.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 border-collapse text-left">
            <thead>
              <tr>
                {['Year', 'Week', 'Start', 'Pick1', 'Pick2', 'Pick3', 'Avg Stop', 'Cum Stop'].map((h) => (
                  <th key={h} className={adminTh}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {track.length === 0 ? (
                <tr>
                  <td className={adminTd} colSpan={8}>
                    No closed weeks yet.
                  </td>
                </tr>
              ) : (
                track.map((w) => (
                  <tr key={w.id}>
                    <td className={adminTd}>{w.year}</td>
                    <td className={adminTd}>{w.week}</td>
                    <td className={adminTd}>{w.weekStart}</td>
                    <td className={adminTd}>
                      {formatPickCell(w.pick1Ticker, w.pick1Direction, w.pick1Return5d, w.pick1ReturnStopLoss)}
                    </td>
                    <td className={adminTd}>
                      {formatPickCell(w.pick2Ticker, w.pick2Direction, w.pick2Return5d, w.pick2ReturnStopLoss)}
                    </td>
                    <td className={adminTd}>
                      {formatPickCell(w.pick3Ticker, w.pick3Direction, w.pick3Return5d, w.pick3ReturnStopLoss)}
                    </td>
                    <td className={`${adminTd} tabular-nums`}>{formatRatioAsPct(w.weeklyAvgStopLoss, 2)}</td>
                    <td className={`${adminTd} tabular-nums`}>{formatTotalReturnPct(w.cumulativeStopLoss, 1)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
