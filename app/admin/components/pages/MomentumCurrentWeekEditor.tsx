'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Lock, Radar, RefreshCw, Save } from 'lucide-react';
import {
  AdminAlert,
  AdminGhostButton,
  AdminPrimaryButton,
  adminField,
  adminMuted,
  adminSelect,
  adminSurface,
  adminSurfacePad,
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

function numOrNull(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Round a ratio to 1 decimal percent (0.052631… → 0.053). */
function roundRatioToPct1(ratio: number): number {
  return Math.round(ratio * 1000) / 1000;
}

/** Show stored ratio (−0.02) as a plain percent (−2 / 5.3) — max 1 decimal. */
function ratioToPctInput(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio)) return '';
  const pct = Math.round(ratio * 1000) / 10; // *100, 1 decimal
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
}

/** Parse plain percent (−2 / 5.3) into stored ratio (−0.02 / 0.053). */
function pctInputToRatio(raw: string): number | null {
  const t = raw.trim();
  if (!t || t === '-' || t === '.' || t === '-.') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return roundRatioToPct1(n / 100);
}

/** Percent field: type −2 / 6 / 5.3; store ratio under the hood. Keeps draft text while typing. */
function PercentInput({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
}: {
  value: number | null;
  onChange: (ratio: number | null) => void;
  placeholder?: string;
  'aria-label'?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => ratioToPctInput(value));

  useEffect(() => {
    if (!focused) setDraft(ratioToPctInput(value));
  }, [value, focused]);

  return (
    <input
      className={cellInput}
      value={focused ? draft : ratioToPctInput(value)}
      placeholder={placeholder}
      inputMode="decimal"
      aria-label={ariaLabel}
      onFocus={() => {
        setFocused(true);
        setDraft(ratioToPctInput(value));
      }}
      onBlur={() => {
        setFocused(false);
        const next = pctInputToRatio(draft);
        onChange(next);
        setDraft(ratioToPctInput(next));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() === '' || raw.trim() === '-' || raw.trim() === '.' || raw.trim() === '-.') {
          onChange(null);
          return;
        }
        const next = pctInputToRatio(raw);
        if (next != null) onChange(next);
      }}
    />
  );
}

function normalizePickPercents(p: MomentumCurrentPick): MomentumCurrentPick {
  return {
    ...p,
    return5d: p.return5d == null ? null : roundRatioToPct1(p.return5d),
    returnStopLoss: p.returnStopLoss == null ? null : roundRatioToPct1(p.returnStopLoss),
    stopLossPct: p.stopLossPct == null ? null : roundRatioToPct1(p.stopLossPct),
    takeProfitPct: p.takeProfitPct == null ? null : roundRatioToPct1(p.takeProfitPct),
  };
}

function formatWeekStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function pctTone(value: number | null | undefined): 'pos' | 'neg' | 'neu' {
  if (value == null || !Number.isFinite(value) || value === 0) return 'neu';
  return value > 0 ? 'pos' : 'neg';
}

function PctCell({ value, pill = false }: { value: number | null | undefined; pill?: boolean }) {
  const text = formatRatioAsPct(value, 1);
  const tone = pctTone(value);
  if (pill && tone !== 'neu') {
    return (
      <span
        className={`inline-flex rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums leading-tight sm:text-[11.5px] ${
          tone === 'pos'
            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
            : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
        }`}
      >
        {text}
      </span>
    );
  }
  const color =
    tone === 'pos'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'neg'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-foreground';
  return <span className={`font-mono text-[11px] font-semibold tabular-nums sm:text-[12px] ${color}`}>{text}</span>;
}

function CumCell({ value }: { value: number | null | undefined }) {
  const text = formatTotalReturnPct(value, 1);
  const tone = pctTone(value);
  const color =
    tone === 'pos'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'neg'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-foreground';
  return <span className={`font-mono text-[11px] font-semibold tabular-nums sm:text-[12px] ${color}`}>{text}</span>;
}

const CURRENT_WEEK_HEADERS = [
  'Strategy',
  'Pick',
  'Direction',
  'Week Open',
  'Stop-loss (%)',
  'Take Profit (%)',
  'Stop-loss ($)',
  'Take Profit',
  'Current Price',
  'Return 5-d',
  'Return with Stop/Loss',
  'Comments',
] as const;

const TRACK_GROUP = [
  { label: '', span: 3 },
  { label: 'Dow 30', span: 4 },
  { label: 'Large Cap', span: 4 },
  { label: 'Nasdaq', span: 4 },
  { label: 'Consolidated (5-D)', span: 4 },
] as const;

const TRACK_HEADERS = [
  'Year',
  'Week',
  'Week Start',
  'Pick',
  'Direction',
  'Return 5-d',
  'Return Stop/Loss',
  'Pick',
  'Direction',
  'Return 5-d',
  'Return Stop/Loss',
  'Pick',
  'Direction',
  'Return 5-d',
  'Return Stop/Loss',
  'Weekly Avg 5d',
  'Cumulative 5d',
  'Weekly Avg Stop-Loss',
  'Cumulative Stop-Loss',
] as const;

const thGroup =
  'sticky top-0 z-20 whitespace-nowrap border-b border-border bg-blue-900 px-2.5 py-1.5 text-center text-[10px] font-semibold uppercase leading-tight tracking-[0.05em] text-blue-50 shadow-sm sm:px-3 sm:text-[10.5px]';
const thCol =
  'sticky top-[30px] z-20 whitespace-nowrap border-b border-border bg-card px-2.5 py-2.5 text-left text-[10px] font-semibold uppercase leading-tight tracking-[0.05em] text-muted-foreground shadow-sm sm:px-3 sm:py-3 sm:text-[10.5px]';
const td =
  'whitespace-nowrap bg-card px-2.5 py-2 align-middle font-sans text-[11px] sm:px-3 sm:py-2.5 sm:text-[12px]';

const cellInput = `${adminField} h-8 min-w-20 w-full text-[12px]`;
const cellSelect = `${adminSelect} h-8 min-w-24 w-full text-[12px]`;

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
      setPicks(cw.data.picks.map(normalizePickPercents));
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
        const computedRaw = return5d(next.weekOpen, next.currentPrice, next.direction || null);
        const computed = computedRaw == null ? null : roundRatioToPct1(computedRaw);
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
        if (patch.returnStopLoss != null) {
          next.returnStopLoss = roundRatioToPct1(patch.returnStopLoss);
        }
        return next;
      })
    );
  };

  const buildSavePayload = () => ({
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

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await saveCurrentWeekAction(token, buildSavePayload());
      if (!res.ok) throw new Error(res.error);
      setWeek(res.data);
      setPicks(res.data.picks.map(normalizePickPercents));
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
      const token = await getAccessToken();
      const saved = await saveCurrentWeekAction(token, buildSavePayload());
      if (!saved.ok) throw new Error(saved.error);
      const res = await refreshCurrentWeekPricesAction(token);
      if (!res.ok) throw new Error(res.error);
      setWeek(res.data);
      setPicks(res.data.picks.map(normalizePickPercents));
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
      const saved = await saveCurrentWeekAction(token, buildSavePayload());
      if (!saved.ok) throw new Error(saved.error);
      const res = await closeWeekAction(token);
      if (!res.ok) throw new Error(res.error);
      setWeek(res.data.next);
      setDraftYear(String(res.data.next.year));
      setDraftWeek(String(res.data.next.week));
      setDraftStart(res.data.next.weekStart);
      setPicks(res.data.next.picks.map(normalizePickPercents));
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
            { label: 'Total Return', value: formatTotalReturnPct(kpis.totalReturn, 0), accent: true },
            { label: 'CAGR', value: formatRatioAsPct(kpis.cagr, 1), accent: false },
            { label: 'Hit Rate', value: formatRatioAsPct(kpis.hitRate, 0), accent: false },
          ].map((k) => (
            <div
              key={k.label}
              className="flex min-h-24 min-w-0 flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k.label}</div>
              <div
                className={`mt-1.5 text-2xl font-semibold tracking-tight tabular-nums ${
                  k.accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                }`}
              >
                {k.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:rounded-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Current Week Picks</h2>
            <p className={adminMuted}>Edit picks, refresh prices, then close the week into Track Record.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AdminGhostButton
              icon={RefreshCw}
              disabled={refreshing || saving || closing}
              onClick={() => void onRefreshPrices()}
            >
              {refreshing ? 'Refreshing…' : 'Refresh prices'}
            </AdminGhostButton>
            <AdminGhostButton icon={Save} disabled={saving || refreshing || closing} onClick={() => void onSave()}>
              {saving ? 'Saving…' : 'Save'}
            </AdminGhostButton>
            <AdminPrimaryButton
              icon={Lock}
              disabled={closing || saving || refreshing}
              onClick={() => void onCloseWeek()}
            >
              {closing ? 'Closing…' : 'Close the week'}
            </AdminPrimaryButton>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-border bg-muted/40 px-4 py-3.5 sm:grid-cols-3 sm:px-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Year</span>
            <input className={adminField} value={draftYear} onChange={(e) => setDraftYear(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Week</span>
            <input className={adminField} value={draftWeek} onChange={(e) => setDraftWeek(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Week Start</span>
            <input
              type="date"
              className={adminField}
              value={draftStart}
              onChange={(e) => setDraftStart(e.target.value)}
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-separate border-spacing-0 text-left text-[11px] leading-snug sm:text-[12px]">
            <thead>
              <tr>
                <th colSpan={12} className={`${thGroup} text-left`}>
                  Current Week Picks
                </th>
              </tr>
              <tr>
                {CURRENT_WEEK_HEADERS.map((h) => (
                  <th key={h} className={thCol}>
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
                  <tr
                    key={p.strategy}
                    className="transition-colors hover:bg-muted/40 [&>td]:border-b [&>td]:border-border [&:last-child>td]:border-b-0"
                  >
                    <td className={`${td} font-medium`}>{strategyLabel(p.strategy)}</td>
                    <td className={td}>
                      <input
                        className={`${cellInput} uppercase`}
                        value={p.ticker}
                        onChange={(e) => updatePick(p.strategy, { ticker: e.target.value.toUpperCase() })}
                      />
                    </td>
                    <td className={td}>
                      <select
                        className={cellSelect}
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
                    <td className={td}>
                      <input
                        className={cellInput}
                        value={p.weekOpen ?? ''}
                        onChange={(e) => updatePick(p.strategy, { weekOpen: numOrNull(e.target.value) })}
                      />
                    </td>
                    <td className={td}>
                      <PercentInput
                        value={p.stopLossPct}
                        onChange={(stopLossPct) => updatePick(p.strategy, { stopLossPct })}
                        placeholder="-2"
                        aria-label="Stop-loss percent"
                      />
                    </td>
                    <td className={td}>
                      <PercentInput
                        value={p.takeProfitPct}
                        onChange={(takeProfitPct) => updatePick(p.strategy, { takeProfitPct })}
                        placeholder="6"
                        aria-label="Take profit percent"
                      />
                    </td>
                    <td className={`${td} font-mono tabular-nums text-muted-foreground`}>
                      {stop$ == null ? '—' : stop$.toFixed(2)}
                    </td>
                    <td className={`${td} font-mono tabular-nums text-muted-foreground`}>
                      {tp$ == null ? '—' : tp$.toFixed(2)}
                    </td>
                    <td className={td}>
                      <input
                        className={cellInput}
                        value={p.currentPrice ?? ''}
                        onChange={(e) => updatePick(p.strategy, { currentPrice: numOrNull(e.target.value) })}
                      />
                    </td>
                    <td className={td}>
                      <PctCell value={p.return5d ?? live5d} pill />
                    </td>
                    <td className={td}>
                      <PercentInput
                        value={p.returnStopLoss}
                        onChange={(returnStopLoss) => updatePick(p.strategy, { returnStopLoss })}
                        placeholder="5.3"
                        aria-label="Return with stop/loss percent"
                      />
                    </td>
                    <td className={`${td} min-w-44`}>
                      <input
                        className={cellInput}
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
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
          Type percents as you say them (e.g. −2 for stop, 6 for take profit, 5.3 for return). Stored as ratios
          behind the scenes. Return with Stop/Loss defaults to Return 5-d; edit to override.
          {week ? ` Status: ${week.status}.` : null}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:rounded-2xl">
        <div className="flex w-full min-w-0 items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Radar className="h-[13px] w-[13px]" />
            </span>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Track record
              </div>
              <p className="text-[11px] text-muted-foreground">Newest first · read-only preview</p>
            </div>
          </div>
        </div>
        <div className="max-h-[min(55vh,520px)] overflow-auto">
          <table className="w-full min-w-max border-separate border-spacing-0 text-left text-[11px] leading-snug sm:text-[12px]">
            <thead>
              <tr>
                {TRACK_GROUP.map((seg, idx) => (
                  <th key={idx} colSpan={seg.span} className={thGroup}>
                    {seg.label || '\u00a0'}
                  </th>
                ))}
              </tr>
              <tr>
                {TRACK_HEADERS.map((h, i) => (
                  <th key={`${h}-${i}`} className={thCol}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {track.length === 0 ? (
                <tr>
                  <td className={`${td} text-muted-foreground`} colSpan={19}>
                    No closed weeks yet.
                  </td>
                </tr>
              ) : (
                track.map((w) => (
                  <tr
                    key={w.id}
                    className="transition-colors hover:bg-muted/40 [&>td]:border-b [&>td]:border-border [&:last-child>td]:border-b-0"
                  >
                    <td className={td}>{w.year}</td>
                    <td className={td}>{w.week}</td>
                    <td className={`${td} font-mono tabular-nums`}>{formatWeekStart(w.weekStart)}</td>
                    <td className={`${td} font-semibold`}>{w.pick1Ticker ?? '—'}</td>
                    <td className={td}>
                      {w.pick1Direction
                        ? w.pick1Direction[0].toUpperCase() + w.pick1Direction.slice(1)
                        : '—'}
                    </td>
                    <td className={td}>
                      <PctCell value={w.pick1Return5d} />
                    </td>
                    <td className={td}>
                      <PctCell value={w.pick1ReturnStopLoss} />
                    </td>
                    <td className={`${td} font-semibold`}>{w.pick2Ticker ?? '—'}</td>
                    <td className={td}>
                      {w.pick2Direction
                        ? w.pick2Direction[0].toUpperCase() + w.pick2Direction.slice(1)
                        : '—'}
                    </td>
                    <td className={td}>
                      <PctCell value={w.pick2Return5d} />
                    </td>
                    <td className={td}>
                      <PctCell value={w.pick2ReturnStopLoss} />
                    </td>
                    <td className={`${td} font-semibold`}>{w.pick3Ticker ?? '—'}</td>
                    <td className={td}>
                      {w.pick3Direction
                        ? w.pick3Direction[0].toUpperCase() + w.pick3Direction.slice(1)
                        : '—'}
                    </td>
                    <td className={td}>
                      <PctCell value={w.pick3Return5d} />
                    </td>
                    <td className={td}>
                      <PctCell value={w.pick3ReturnStopLoss} />
                    </td>
                    <td className={td}>
                      <PctCell value={w.weeklyAvg5d} pill />
                    </td>
                    <td className={td}>
                      <CumCell value={w.cumulative5d} />
                    </td>
                    <td className={td}>
                      <PctCell value={w.weeklyAvgStopLoss} pill />
                    </td>
                    <td className={td}>
                      <CumCell value={w.cumulativeStopLoss} />
                    </td>
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
