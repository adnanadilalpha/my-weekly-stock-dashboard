'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AppHeader } from '../app-header';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { MwsTickerPickerDialog } from './mws-ticker-picker-dialog';
import { HoldingValuesDialog } from './holding-values-dialog';
import {
  addHoldingsBatch,
  cashWeightedReturn,
  computeSinceStartReturn,
  createUserPortfolio,
  deleteUserPortfolio,
  fetchMwsOverlays,
  fetchNearestDailyCloses,
  getUserPortfolio,
  listHoldings,
  listUserPortfolios,
  removeHolding,
  updateHoldingsPerformanceBatch,
  type HoldingPerformancePatch,
  type MwsOverlay,
  type UserPortfolio,
  type UserPortfolioHolding,
} from '@/lib/queries/user-portfolio';
import { composeBookBrief } from '@/lib/intelligence/brief';
import { BriefCard } from '../intelligence/brief-card';
import { RelativeStrengthButton } from '../charts/relative-strength-dialog';
import type { AppMode, PageView } from '../../types';
import { AlertTriangle, Briefcase, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useActivity } from '@/lib/activity/ActivityProvider';

type Props = {
  userEmail: string;
  currentAppMode: AppMode;
  onGoToPortfolio: () => void;
  onGoToMWS: () => void;
  onGoToMyHoldings: () => void;
  onSignOut: () => void;
  onNavigateMws?: (page: PageView, ticker?: string) => void;
  selectedPortfolioId: string | null;
  onSelectMyPortfolioId: (id: string | null) => void;
};

/** One portfolio per user in this version — list page removed; open detail directly. */
export function MyPortfoliosPage({
  userEmail,
  currentAppMode,
  onGoToPortfolio,
  onGoToMWS,
  onGoToMyHoldings,
  onSignOut,
  onNavigateMws,
  selectedPortfolioId,
  onSelectMyPortfolioId,
}: Props) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [openPickerOnEnter, setOpenPickerOnEnter] = useState(false);
  const [name, setName] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const activity = useActivity();

  const bootstrap = useCallback(async () => {
    setBootstrapping(true);
    setBootError(null);
    try {
      const list = await listUserPortfolios();
      if (list.length > 0) {
        // Prefer the most recently updated book; ignore extras (single-portfolio product).
        onSelectMyPortfolioId(list[0].id);
        setCreateOpen(false);
      } else {
        onSelectMyPortfolioId(null);
        setCreateOpen(true);
      }
    } catch (e) {
      setBootError(e instanceof Error ? e.message : 'Failed to load holdings');
    } finally {
      setBootstrapping(false);
    }
  }, [onSelectMyPortfolioId]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setFormError(null);
    try {
      const existing = await listUserPortfolios();
      if (existing.length > 0) {
        onSelectMyPortfolioId(existing[0].id);
        setCreateOpen(false);
        return;
      }
      const p = await createUserPortfolio({ name });
      activity?.trackEvent({
        eventType: 'feature_use',
        eventName: 'my_portfolio_create',
        metadata: { portfolioId: p.id },
      });
      setCreateOpen(false);
      setName('');
      setOpenPickerOnEnter(true);
      onSelectMyPortfolioId(p.id);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  if (selectedPortfolioId) {
    return (
      <MyPortfolioDetail
        portfolioId={selectedPortfolioId}
        userEmail={userEmail}
        currentAppMode={currentAppMode}
        onGoToPortfolio={onGoToPortfolio}
        onGoToMWS={onGoToMWS}
        onGoToMyHoldings={onGoToMyHoldings}
        onSignOut={onSignOut}
        onDeleted={() => {
          setOpenPickerOnEnter(false);
          onSelectMyPortfolioId(null);
          setCreateOpen(true);
          setName('');
        }}
        onNavigateMws={onNavigateMws}
        autoOpenPicker={openPickerOnEnter}
        onAutoOpenPickerConsumed={() => setOpenPickerOnEnter(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-muted/25">
      <AppHeader
        userEmail={userEmail}
        currentAppMode={currentAppMode}
        onGoToPortfolio={onGoToPortfolio}
        onGoToMWS={onGoToMWS}
        onGoToMyHoldings={onGoToMyHoldings}
        onSignOut={onSignOut}
      />
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        {bootstrapping ? (
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        ) : bootError ? (
          <p className="text-center text-sm text-destructive">{bootError}</p>
        ) : (
          <div className="flex flex-col items-center px-4 py-16 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background">
              <Briefcase className="h-6 w-6 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">My Holdings</h1>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Create your portfolio, pick tickers from MWS, enter Start and Cash — we compute Since-start and layer live ratings.
            </p>
            <Button
              type="button"
              className="mt-6"
              onClick={() => {
                setFormError(null);
                setCreateOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Create portfolio
            </Button>
          </div>
        )}
      </main>

      <NameFieldDialog
        open={createOpen && !selectedPortfolioId}
        onOpenChange={(o) => {
          if (!bootstrapping) setCreateOpen(o);
        }}
        title="Create your portfolio"
        description="One portfolio in this version. Give it a short name, then pick tickers from MWS."
        placeholder="e.g. Core, Swing, Watch"
        confirmLabel="Create"
        value={name}
        onChange={setName}
        onConfirm={() => void handleCreate()}
        busy={creating}
        error={formError}
      />
    </div>
  );
}

function NameFieldDialog({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  confirmLabel,
  value,
  onChange,
  onConfirm,
  busy,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  placeholder: string;
  confirmLabel: string;
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const inputId = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor={inputId} className="sr-only">
            {placeholder}
          </label>
          <input
            id={inputId}
            autoFocus
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
            placeholder={placeholder}
            value={value}
            disabled={busy}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value.trim()) onConfirm();
            }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || !value.trim()} onClick={onConfirm}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MyPortfolioDetail({
  portfolioId,
  userEmail,
  currentAppMode,
  onGoToPortfolio,
  onGoToMWS,
  onGoToMyHoldings,
  onSignOut,
  onDeleted,
  onNavigateMws,
  autoOpenPicker = false,
  onAutoOpenPickerConsumed,
}: {
  portfolioId: string;
  userEmail: string;
  currentAppMode: AppMode;
  onGoToPortfolio: () => void;
  onGoToMWS: () => void;
  onGoToMyHoldings: () => void;
  onSignOut: () => void;
  onDeleted: () => void;
  onNavigateMws?: (page: PageView, ticker?: string) => void;
  autoOpenPicker?: boolean;
  onAutoOpenPickerConsumed?: () => void;
}) {
  const [portfolio, setPortfolio] = useState<UserPortfolio | null>(null);
  const [holdings, setHoldings] = useState<UserPortfolioHolding[]>([]);
  const [overlays, setOverlays] = useState<Map<string, MwsOverlay>>(new Map());
  const [startCloses, setStartCloses] = useState<Map<string, number>>(new Map());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [valuesOpen, setValuesOpen] = useState(false);
  const [valuesBusy, setValuesBusy] = useState(false);
  const [valuesTargets, setValuesTargets] = useState<UserPortfolioHolding[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const activity = useActivity();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, h] = await Promise.all([getUserPortfolio(portfolioId), listHoldings(portfolioId)]);
      setPortfolio(p);
      setHoldings(h);
      const ov = await fetchMwsOverlays(h.map((x) => x.ticker));
      setOverlays(ov);

      const closeReqs = h
        .filter((row) => row.start_date)
        .map((row) => ({ ticker: row.ticker, asOfDate: String(row.start_date) }));
      setStartCloses(closeReqs.length ? await fetchNearestDailyCloses(closeReqs) : new Map());

      return h;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load portfolio');
      return [] as UserPortfolioHolding[];
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!autoOpenPicker || loading) return;
    setPickerOpen(true);
    onAutoOpenPickerConsumed?.();
  }, [autoOpenPicker, loading, onAutoOpenPickerConsumed]);

  const openValuesFor = (rows: UserPortfolioHolding[]) => {
    if (rows.length === 0) return;
    setValuesTargets(rows);
    setValuesOpen(true);
  };

  const handlePickerConfirm = async (tickers: string[]) => {
    setPickerBusy(true);
    setError(null);
    try {
      const added = await addHoldingsBatch(portfolioId, tickers);
      activity?.trackEvent({
        eventType: 'feature_use',
        eventName: 'my_portfolio_add_holding',
        metadata: { portfolioId, count: added.length, tickers: added.map((h) => h.ticker) },
      });
      setPickerOpen(false);
      const all = await reload();
      const addedIds = new Set(added.map((a) => a.id));
      const justAdded = all.filter((h) => addedIds.has(h.id));
      openValuesFor(justAdded.length > 0 ? justAdded : added);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed');
    } finally {
      setPickerBusy(false);
    }
  };

  const handleSaveValues = async (rows: Array<{ id: string } & HoldingPerformancePatch>) => {
    setValuesBusy(true);
    setError(null);
    try {
      await updateHoldingsPerformanceBatch(rows);
      setValuesOpen(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setValuesBusy(false);
    }
  };

  const handleDeletePortfolio = async () => {
    if (!confirm('Delete this portfolio and all holdings?')) return;
    try {
      await deleteUserPortfolio(portfolioId);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const enriched = useMemo(() => {
    const cashTotal = holdings.reduce((s, h) => s + (h.cash_invested ?? 0), 0);
    const hasCash = holdings.some((h) => h.cash_invested != null);

    return holdings.map((h) => {
      const o = overlays.get(h.ticker.toUpperCase()) ?? null;
      const inMws = o?.in_mws_coverage ?? false;
      const startKey =
        h.start_date && h.ticker
          ? `${h.ticker.toUpperCase()}|${String(h.start_date).slice(0, 10)}`
          : null;
      const startClose = startKey ? (startCloses.get(startKey) ?? null) : null;
      const currentPrice = o?.daily_current_price ?? null;
      const { sinceStartReturn, holdingDays, cagr } = computeSinceStartReturn(
        startClose,
        currentPrice,
        h.start_date,
      );
      const ret1m = o?.['1m_percent'] ?? null;
      const strength = o?.performance_strength ?? o?.daily_performance_strength ?? null;
      const rating = o?.daily_rating ?? null;
      const outlook = o?.daily_outlook ?? null;
      const weight =
        hasCash && h.cash_invested != null && cashTotal > 0
          ? h.cash_invested / cashTotal
          : null;

      const ratingLower = (rating ?? '').toLowerCase();
      const needsAttention =
        inMws &&
        ((strength ?? '').toLowerCase() === 'weak' ||
          ratingLower.includes('downtrend') ||
          (ret1m != null && ret1m <= -0.05));

      return {
        h,
        o,
        inMws,
        startClose,
        currentPrice,
        sinceStartReturn,
        holdingDays,
        cagr,
        ret1m,
        strength,
        rating,
        outlook,
        weight,
        needsAttention,
      };
    });
  }, [holdings, overlays, startCloses]);

  const totals = useMemo(() => {
    const cash = holdings.reduce((s, h) => s + (h.cash_invested ?? 0), 0);
    const hasCash = holdings.some((h) => h.cash_invested != null);
    const book = cashWeightedReturn(
      enriched.map((e) => ({ cash: e.h.cash_invested, ret: e.sinceStartReturn })),
    );
    const ones = enriched.map((e) => e.ret1m).filter((v): v is number => v != null && Number.isFinite(v));
    const avg1m = ones.length ? ones.reduce((a, b) => a + b, 0) / ones.length : null;
    const attention = enriched.filter((e) => e.needsAttention);
    return {
      cashInvested: hasCash ? cash : null,
      bookReturn: book.bookReturn,
      bookReturnCounted: book.counted,
      avg1m,
      attention,
    };
  }, [holdings, enriched]);

  const bookBrief = useMemo(
    () =>
      composeBookBrief({
        holdingCount: holdings.length,
        bookReturn: totals.bookReturn,
        bookReturnCounted: totals.bookReturnCounted,
        avg1m: totals.avg1m,
        attentionTickers: totals.attention.map((a) => a.h.ticker),
      }),
    [holdings.length, totals],
  );

  const fmtMoney = (v: number | null) =>
    v == null
      ? '—'
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: portfolio?.base_currency || 'USD',
          maximumFractionDigits: 0,
        }).format(v);

  const fmtPct = (v: number | null) => {
    if (v == null || !Number.isFinite(v)) return '—';
    // MWS stores returns as decimals (0.05 = 5%). Allow up to ±200% as ratio.
    const display = Math.abs(v) <= 2 ? v * 100 : v;
    const rounded = Number(display.toFixed(1));
    const sign = rounded > 0 ? '+' : '';
    return `${sign}${rounded}%`;
  };

  const fmtWeight = (v: number | null) => {
    if (v == null) return '—';
    return `${Number((v * 100).toFixed(0))}%`;
  };

  return (
    <div className="min-h-screen bg-muted/25">
      <AppHeader
        userEmail={userEmail}
        currentAppMode={currentAppMode}
        onGoToPortfolio={onGoToPortfolio}
        onGoToMWS={onGoToMWS}
        onGoToMyHoldings={onGoToMyHoldings}
        onSignOut={onSignOut}
      />
      <main className="w-full min-w-0 space-y-6 px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="flex w-full min-w-0 flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">
              {portfolio?.name ?? 'My Holdings'}
            </h1>
            <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
              {loading
                ? '…'
                : holdings.length === 0
                  ? 'Add tickers from MWS, then enter when you bought (Start) and how much (Cash).'
                  : `${holdings.length} ticker${holdings.length === 1 ? '' : 's'} · your return vs last month’s market move`}
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <RelativeStrengthButton
              initialTickers={holdings.map((h) => h.ticker)}
              onSelectTicker={(t) => onNavigateMws?.('ticker-analysis', t)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openValuesFor(holdings)}
              disabled={holdings.length === 0}
            >
              <Pencil className="mr-1 h-4 w-4" />
              Edit values
            </Button>
            <Button type="button" size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add tickers
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleDeletePortfolio()}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
              <span className="sr-only">Delete portfolio</span>
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && holdings.length > 0 && (
          <>
            <div className="flex w-full min-w-0 flex-wrap gap-3.5">
              <div className="box-border flex min-h-[100px] min-w-0 flex-[1_1_11rem] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Cash in
                </div>
                <div className="mt-1 text-[1.375rem] font-semibold tracking-tight text-foreground sm:text-2xl">
                  {fmtMoney(totals.cashInvested)}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">Total you entered as invested</div>
              </div>
              <div className="box-border flex min-h-[100px] min-w-0 flex-[1_1_11rem] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Your return
                </div>
                <div
                  className={`mt-1 text-[1.375rem] font-semibold tracking-tight sm:text-2xl ${
                    totals.bookReturn == null
                      ? 'text-foreground'
                      : totals.bookReturn >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {fmtPct(totals.bookReturn)}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {totals.bookReturnCounted > 0
                    ? `Gain/loss since your Start dates (${totals.bookReturnCounted} of ${holdings.length} positions)`
                    : 'Add Start dates under Edit values to calculate'}
                </div>
              </div>
              <div className="box-border flex min-h-[100px] min-w-0 flex-[1_1_11rem] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Last month
                </div>
                <div
                  className={`mt-1 text-[1.375rem] font-semibold tracking-tight sm:text-2xl ${
                    totals.avg1m == null
                      ? 'text-foreground'
                      : totals.avg1m >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {fmtPct(totals.avg1m)}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Average price change over the past month (not your Start date)
                </div>
              </div>
            </div>

            <BriefCard brief={bookBrief} variant="quickRead" compact defaultOpen />

            {totals.attention.length > 0 && (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3.5">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Needs attention
                </div>
                <ul className="flex flex-wrap gap-2">
                  {totals.attention.map((a) => (
                    <li key={a.h.id}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 disabled:opacity-60"
                        disabled={!onNavigateMws || !a.inMws}
                        onClick={() => onNavigateMws?.('ticker-analysis', a.h.ticker)}
                      >
                        <span className="font-mono font-semibold">{a.h.ticker}</span>
                        <span className="text-muted-foreground">{a.rating ?? a.strength ?? 'Watch'}</span>
                        <span
                          className={
                            a.ret1m != null && a.ret1m < 0
                              ? 'font-mono text-rose-600 dark:text-rose-400'
                              : 'font-mono text-muted-foreground'
                          }
                        >
                          {fmtPct(a.ret1m)} last mo.
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-violet-600" />
          </div>
        ) : holdings.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-4 py-14 text-center shadow-sm">
            <p className="text-sm font-medium text-foreground">This portfolio is empty</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Add tickers from MWS, then set Start (when you bought) and Cash. We calculate your return from that date.
            </p>
            <Button type="button" className="mt-5" size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add tickers
            </Button>
          </div>
        ) : (
          <>
            <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex w-full min-w-0 flex-col gap-3 border-b border-border bg-muted/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
                    <Layers className="h-[15px] w-[15px]" />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[12px]">
                    Holdings
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:text-[12px]">
                    {holdings.length}
                  </span>
                </div>
                <span className="text-[11px] italic text-muted-foreground sm:text-[12px]">
                  Your return = since Start · Last month = market move · Trend = MWS rating
                </span>
              </div>
              <div className="w-full min-w-0 overflow-x-auto">
                <table className="min-w-[720px] w-full border-separate border-spacing-0 text-xs sm:text-sm">
                  <thead>
                    <tr>
                      {[
                        { key: 'ticker', label: 'Ticker' },
                        { key: 'cash', label: 'Cash' },
                        { key: 'weight', label: 'Weight' },
                        { key: 'yours', label: 'Your return', title: 'How much this holding is up or down since the Start date you entered' },
                        { key: 'month', label: 'Last month', title: 'How the stock’s price moved in the past month (market, not your Start date)' },
                        { key: 'rating', label: 'Trend', title: 'MWS trend rating (e.g. Strong Uptrend)' },
                        { key: 'outlook', label: 'Outlook', title: 'MWS outlook (e.g. Stable)' },
                        { key: 'actions', label: '' },
                      ].map((col) => (
                          <th
                            key={col.key}
                            title={col.title}
                            className="whitespace-nowrap border-b border-border px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-4 sm:py-3.5 sm:text-[10.5px]"
                          >
                            {col.label}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {enriched.map((row) => {
                      const { h, inMws, sinceStartReturn, ret1m, rating, outlook, weight } = row;
                      const sincePos = sinceStartReturn != null && sinceStartReturn > 0;
                      const sinceNeg = sinceStartReturn != null && sinceStartReturn < 0;
                      const m1Pos = ret1m != null && ret1m > 0;
                      const m1Neg = ret1m != null && ret1m < 0;
                      return (
                        <tr
                          key={h.id}
                          className="border-b border-border transition-colors last:border-b-0 hover:bg-muted/40"
                        >
                          <td className="px-3 py-3 text-left align-middle sm:px-4 sm:py-4">
                            {inMws ? (
                              <button
                                type="button"
                                className="truncate text-xs font-semibold text-foreground hover:underline sm:text-sm"
                                disabled={!onNavigateMws}
                                onClick={() => onNavigateMws?.('ticker-analysis', h.ticker)}
                              >
                                {h.ticker}
                              </button>
                            ) : (
                              <span className="truncate text-xs font-semibold text-muted-foreground sm:text-sm">
                                {h.ticker}
                                <span className="ml-1.5 text-[10px] font-normal">Not tracked</span>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs tabular-nums text-foreground sm:px-4 sm:py-4 sm:text-sm">
                            {fmtMoney(h.cash_invested)}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs tabular-nums text-muted-foreground sm:px-4 sm:py-4 sm:text-sm">
                            {fmtWeight(weight)}
                          </td>
                          <td
                            className="px-3 py-3 text-left align-middle font-mono text-xs tabular-nums sm:px-4 sm:py-4 sm:text-sm"
                            title="Up or down since the Start date you entered"
                          >
                            {sincePos || sinceNeg ? (
                              <span
                                className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold sm:px-3 sm:py-1.5 sm:text-xs ${
                                  sincePos
                                    ? 'bg-emerald-600 text-white dark:bg-emerald-600'
                                    : 'bg-rose-600 text-white dark:bg-rose-600'
                                }`}
                              >
                                {fmtPct(sinceStartReturn)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground" title="Set Start under Edit values">
                                {fmtPct(sinceStartReturn)}
                              </span>
                            )}
                          </td>
                          <td
                            className="px-3 py-3 font-mono text-xs tabular-nums sm:px-4 sm:py-4 sm:text-sm"
                            title="Price change over the past month"
                          >
                            {inMws ? (
                              <span
                                className={
                                  m1Pos
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : m1Neg
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-foreground'
                                }
                              >
                                {fmtPct(ret1m)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs text-foreground sm:px-4 sm:py-4 sm:text-sm">
                            {inMws ? (rating ?? '—') : '—'}
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground sm:px-4 sm:py-4 sm:text-sm">
                            {inMws ? (outlook ?? '—') : '—'}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2.5 text-right align-middle sm:py-3">
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => void removeHolding(h.id).then(() => reload())}
                              aria-label={`Remove ${h.ticker}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>

      <MwsTickerPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        excludeTickers={holdings.map((h) => h.ticker)}
        onConfirm={handlePickerConfirm}
        busy={pickerBusy}
      />

      <HoldingValuesDialog
        open={valuesOpen}
        onOpenChange={setValuesOpen}
        holdings={valuesTargets}
        onSave={handleSaveValues}
        busy={valuesBusy}
        title="Start & Cash Invested"
      />
    </div>
  );
}
