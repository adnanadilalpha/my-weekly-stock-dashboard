'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { CloseHoldingDialog } from './close-holding-dialog';
import {
  addHoldingsBatch,
  cashWeightedReturn,
  closeHolding,
  computeRealizedReturn,
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
import { composeBookBrief, quadrantFromPct } from '@/lib/intelligence/brief';
import { BriefCard } from '../intelligence/brief-card';
import { RelativeStrengthButton } from '../charts/relative-strength-dialog';
import { QuadrantScreenerButton } from '../charts/quadrant-screener-dialog';
import type { AppMode, PageView } from '../../types';
import { QUADRANT_COLORS, QUADRANT_COPY } from '@/lib/relative-strength';
import type { QuadrantId } from '@/lib/intelligence/brief';
import {
  Archive,
  Briefcase,
  Layers,
  Pencil,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useActivity } from '@/lib/activity/ActivityProvider';
import { cn } from '../ui/utils';

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

function QuadrantCell({ quadrant }: { quadrant: QuadrantId }) {
  if (quadrant === 'UNKNOWN') {
    return <span className="text-muted-foreground">—</span>;
  }
  const copy = QUADRANT_COPY[quadrant];
  const color = QUADRANT_COLORS[quadrant];
  return (
    <div className="min-w-0 max-w-[11rem]">
      <div className="flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color.dot }}
          aria-hidden
        />
        <span className="truncate text-xs font-medium text-foreground sm:text-sm" style={{ color: color.label }}>
          {copy.title}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
        {copy.subtitle}
      </div>
    </div>
  );
}

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
      <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center">
        {bootstrapping ? (
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
        ) : bootError ? (
          <p className="text-sm text-destructive">{bootError}</p>
        ) : (
          <>
            <Briefcase className="mb-3 h-10 w-10 text-muted-foreground" />
            <h1 className="text-xl font-semibold tracking-tight">Create your holdings book</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Track shares and average entry, then review MWS quadrant position for each name.
            </p>
          </>
        )}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Name your book</DialogTitle>
            <DialogDescription>You can rename later. Start by adding tickers after this.</DialogDescription>
          </DialogHeader>
          <input
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="e.g. Core holdings"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
          />
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <DialogFooter>
            <Button type="button" disabled={creating || !name.trim()} onClick={() => void handleCreate()}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
  autoOpenPicker,
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
  const [closeTarget, setCloseTarget] = useState<UserPortfolioHolding | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
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

  const openHoldings = useMemo(() => holdings.filter((h) => h.status !== 'closed'), [holdings]);
  const closedHoldings = useMemo(() => holdings.filter((h) => h.status === 'closed'), [holdings]);

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

  const handleCloseConfirm = async (input: { exit_date: string; exit_price: number | null }) => {
    if (!closeTarget) return;
    setCloseBusy(true);
    setError(null);
    try {
      await closeHolding(closeTarget.id, input);
      activity?.trackEvent({
        eventType: 'feature_use',
        eventName: 'my_portfolio_close_holding',
        metadata: { portfolioId, ticker: closeTarget.ticker },
      });
      setCloseTarget(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Close failed');
    } finally {
      setCloseBusy(false);
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

  const enrichOne = useCallback(
    (h: UserPortfolioHolding) => {
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
      const quadrant = quadrantFromPct(o?.daily_price_vs_21ema, o?.weekly_price_vs_30ema);
      const realizedReturn = computeRealizedReturn(h.cost_basis, h.exit_price);

      const ratingLower = ((o?.daily_rating ?? '') as string).toLowerCase();
      const needsAttention =
        h.status !== 'closed' &&
        inMws &&
        (quadrant === 'BROKEN_TREND' ||
          quadrant === 'PULLBACK' ||
          (strength ?? '').toLowerCase() === 'weak' ||
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
        quadrant,
        realizedReturn,
        needsAttention,
      };
    },
    [overlays, startCloses],
  );

  const enrichedOpen = useMemo(() => {
    const cashTotal = openHoldings.reduce((s, h) => s + (h.cash_invested ?? 0), 0);
    const hasCash = openHoldings.some((h) => h.cash_invested != null);
    return openHoldings.map((h) => {
      const base = enrichOne(h);
      const weight =
        hasCash && h.cash_invested != null && cashTotal > 0 ? h.cash_invested / cashTotal : null;
      return { ...base, weight };
    });
  }, [openHoldings, enrichOne]);

  const enrichedClosed = useMemo(() => closedHoldings.map(enrichOne), [closedHoldings, enrichOne]);

  const totals = useMemo(() => {
    const cash = openHoldings.reduce((s, h) => s + (h.cash_invested ?? 0), 0);
    const hasCash = openHoldings.some((h) => h.cash_invested != null);
    const book = cashWeightedReturn(
      enrichedOpen.map((e) => ({ cash: e.h.cash_invested, ret: e.sinceStartReturn })),
    );
    const ones = enrichedOpen.map((e) => e.ret1m).filter((v): v is number => v != null && Number.isFinite(v));
    const avg1m = ones.length ? ones.reduce((a, b) => a + b, 0) / ones.length : null;
    const attention = enrichedOpen.filter((e) => e.needsAttention);
    const quadrantCounts: Partial<Record<Exclude<QuadrantId, 'UNKNOWN'>, number>> = {};
    for (const e of enrichedOpen) {
      if (e.quadrant === 'UNKNOWN') continue;
      quadrantCounts[e.quadrant] = (quadrantCounts[e.quadrant] ?? 0) + 1;
    }
    return {
      cashInvested: hasCash ? cash : null,
      bookReturn: book.bookReturn,
      bookReturnCounted: book.counted,
      avg1m,
      attention,
      quadrantCounts,
    };
  }, [openHoldings, enrichedOpen]);

  const bookBrief = useMemo(
    () =>
      composeBookBrief({
        holdingCount: openHoldings.length,
        bookReturn: totals.bookReturn,
        bookReturnCounted: totals.bookReturnCounted,
        avg1m: totals.avg1m,
        attentionTickers: totals.attention.map((a) => a.h.ticker),
        attentionQuadrants: totals.attention.map((a) => a.quadrant),
        quadrantCounts: totals.quadrantCounts,
        closedCount: closedHoldings.length,
      }),
    [openHoldings.length, closedHoldings.length, totals],
  );

  const fmtMoney = (v: number | null, digits = 0) =>
    v == null
      ? '—'
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: portfolio?.base_currency || 'USD',
          maximumFractionDigits: digits,
        }).format(v);

  const fmtPct = (v: number | null) => {
    if (v == null || !Number.isFinite(v)) return '—';
    const display = Math.abs(v) <= 2 ? v * 100 : v;
    const rounded = Number(display.toFixed(1));
    const sign = rounded > 0 ? '+' : '';
    return `${sign}${rounded}%`;
  };

  const fmtWeight = (v: number | null) => {
    if (v == null) return '—';
    return `${Number((v * 100).toFixed(0))}%`;
  };

  const fmtShares = (v: number | null) => {
    if (v == null) return '—';
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
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
      <main className="w-full min-w-0 space-y-5 px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="flex w-full min-w-0 flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">
              {portfolio?.name ?? 'My Holdings'}
            </h1>
            <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
              {loading
                ? '…'
                : openHoldings.length === 0
                  ? 'Add tickers, then set shares and average entry cost.'
                  : `${openHoldings.length} open · ${closedHoldings.length} past · shares × avg entry`}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <Button type="button" size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add tickers
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openValuesFor(openHoldings)}
              disabled={openHoldings.length === 0}
            >
              <Pencil className="mr-1 h-4 w-4" />
              Edit values
            </Button>
            <RelativeStrengthButton
              initialTickers={openHoldings.map((h) => h.ticker)}
              onSelectTicker={(t) => onNavigateMws?.('ticker-analysis', t)}
            />
            <QuadrantScreenerButton onSelectTicker={(t) => onNavigateMws?.('ticker-analysis', t)} />
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

        {!loading && openHoldings.length > 0 && (
          <>
            <BriefCard brief={bookBrief} variant="quickRead" compact defaultOpen />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Cost basis
                </div>
                <div className="mt-1 text-[1.375rem] font-semibold tracking-tight text-foreground sm:text-2xl">
                  {fmtMoney(totals.cashInvested)}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">Shares × avg entry (open book)</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Your return
                </div>
                <div
                  className={cn(
                    'mt-1 text-[1.375rem] font-semibold tracking-tight sm:text-2xl',
                    totals.bookReturn == null
                      ? 'text-foreground'
                      : totals.bookReturn >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400',
                  )}
                >
                  {fmtPct(totals.bookReturn)}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {totals.bookReturnCounted > 0
                    ? `Since your Start dates (${totals.bookReturnCounted} of ${openHoldings.length})`
                    : 'Add Start under Edit values'}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Last month
                </div>
                <div
                  className={cn(
                    'mt-1 text-[1.375rem] font-semibold tracking-tight sm:text-2xl',
                    totals.avg1m == null
                      ? 'text-foreground'
                      : totals.avg1m >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400',
                  )}
                >
                  {fmtPct(totals.avg1m)}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">Avg market move (not your Start)</div>
              </div>
            </div>
          </>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          </div>
        ) : openHoldings.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-4 py-14 text-center shadow-sm">
            <p className="text-sm font-medium text-foreground">No open holdings</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Add tickers from MWS, then set shares and average entry. Closed names stay under Past positions.
            </p>
            <Button type="button" className="mt-5" size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add tickers
            </Button>
          </div>
        ) : (
          <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex w-full min-w-0 flex-col gap-2 border-b border-border bg-muted/40 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-foreground">
                  <Layers className="h-[15px] w-[15px]" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[12px]">
                  Open holdings
                </span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:text-[12px]">
                  {openHoldings.length}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground sm:text-[12px]">
                Your return = since Start · Quadrant = 21d & 30w EMA
              </span>
            </div>
            <div className="w-full min-w-0 overflow-x-auto">
              <table className="min-w-[880px] w-full border-separate border-spacing-0 text-xs sm:text-sm">
                <thead>
                  <tr>
                    {[
                      { key: 'ticker', label: 'Ticker' },
                      { key: 'shares', label: 'Shares' },
                      { key: 'avg', label: 'Avg entry' },
                      { key: 'cash', label: 'Cash' },
                      { key: 'weight', label: 'Weight' },
                      { key: 'yours', label: 'Your return' },
                      { key: 'month', label: 'Last month' },
                      { key: 'quad', label: 'Quadrant' },
                      { key: 'actions', label: '' },
                    ].map((col) => (
                      <th
                        key={col.key}
                        className="whitespace-nowrap border-b border-border px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-4 sm:py-3.5"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {enrichedOpen.map((row) => {
                    const { h, inMws, sinceStartReturn, ret1m, weight, quadrant } = row;
                    const sincePos = sinceStartReturn != null && sinceStartReturn > 0;
                    const sinceNeg = sinceStartReturn != null && sinceStartReturn < 0;
                    const m1Pos = ret1m != null && ret1m > 0;
                    const m1Neg = ret1m != null && ret1m < 0;
                    const missingSize = h.shares == null || h.cost_basis == null;
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
                          {missingSize && h.shares == null ? (
                            <span className="text-muted-foreground" title="Set under Edit values">
                              Add size
                            </span>
                          ) : (
                            fmtShares(h.shares)
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs tabular-nums text-foreground sm:px-4 sm:py-4 sm:text-sm">
                          {h.cost_basis == null ? (
                            <span className="text-muted-foreground">Add entry</span>
                          ) : (
                            fmtMoney(h.cost_basis, 2)
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs tabular-nums text-foreground sm:px-4 sm:py-4 sm:text-sm">
                          {fmtMoney(h.cash_invested)}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs tabular-nums text-muted-foreground sm:px-4 sm:py-4 sm:text-sm">
                          {fmtWeight(weight)}
                        </td>
                        <td className="px-3 py-3 text-left align-middle font-mono text-xs tabular-nums sm:px-4 sm:py-4 sm:text-sm">
                          {sincePos || sinceNeg ? (
                            <span
                              className={cn(
                                'inline-flex rounded-full px-2 py-1 text-[10px] font-semibold sm:px-3 sm:py-1.5 sm:text-xs',
                                sincePos
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-rose-600 text-white',
                              )}
                            >
                              {fmtPct(sinceStartReturn)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground" title="Set Start under Edit values">
                              Add start
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs tabular-nums sm:px-4 sm:py-4 sm:text-sm">
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
                        <td className="px-3 py-3 sm:px-4 sm:py-4">
                          {inMws ? <QuadrantCell quadrant={quadrant} /> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right align-middle sm:py-3">
                          <div className="inline-flex items-center gap-0.5">
                            <button
                              type="button"
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              onClick={() => setCloseTarget(h)}
                              title="Close to past positions"
                              aria-label={`Close ${h.ticker}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                              onClick={() => {
                                if (!confirm(`Permanently remove ${h.ticker}? Prefer Close to keep history.`)) return;
                                void removeHolding(h.id).then(() => reload());
                              }}
                              aria-label={`Remove ${h.ticker}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!loading && closedHoldings.length > 0 && (
          <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex w-full min-w-0 flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-4 py-3.5 sm:px-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-foreground">
                <Archive className="h-[15px] w-[15px]" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[12px]">
                Past positions
              </span>
              <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {closedHoldings.length}
              </span>
              <span className="text-[11px] text-muted-foreground">Kept for analysis — not in book totals</span>
            </div>
            <div className="w-full min-w-0 overflow-x-auto">
              <table className="min-w-[720px] w-full border-separate border-spacing-0 text-xs sm:text-sm">
                <thead>
                  <tr>
                    {['Ticker', 'Shares', 'Avg entry', 'Exit', 'Realized', 'Quadrant now', ''].map((label, i) => (
                      <th
                        key={label || `a${i}`}
                        className="whitespace-nowrap border-b border-border px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-4"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {enrichedClosed.map((row) => {
                    const { h, inMws, quadrant, realizedReturn } = row;
                    const rPos = realizedReturn != null && realizedReturn > 0;
                    const rNeg = realizedReturn != null && realizedReturn < 0;
                    return (
                      <tr key={h.id} className="border-b border-border last:border-b-0 hover:bg-muted/40">
                        <td className="px-3 py-3 font-semibold sm:px-4">
                          {inMws ? (
                            <button
                              type="button"
                              className="hover:underline"
                              disabled={!onNavigateMws}
                              onClick={() => onNavigateMws?.('ticker-analysis', h.ticker)}
                            >
                              {h.ticker}
                            </button>
                          ) : (
                            h.ticker
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono tabular-nums sm:px-4">{fmtShares(h.shares)}</td>
                        <td className="px-3 py-3 font-mono tabular-nums sm:px-4">{fmtMoney(h.cost_basis, 2)}</td>
                        <td className="px-3 py-3 font-mono tabular-nums text-muted-foreground sm:px-4">
                          {h.exit_date ? String(h.exit_date).slice(0, 10) : '—'}
                          {h.exit_price != null ? ` · ${fmtMoney(h.exit_price, 2)}` : ''}
                        </td>
                        <td className="px-3 py-3 font-mono tabular-nums sm:px-4">
                          <span
                            className={
                              rPos
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : rNeg
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-muted-foreground'
                            }
                          >
                            {fmtPct(realizedReturn)}
                          </span>
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          {inMws ? <QuadrantCell quadrant={quadrant} /> : '—'}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (!confirm(`Permanently delete past position ${h.ticker}?`)) return;
                              void removeHolding(h.id).then(() => reload());
                            }}
                            aria-label={`Delete past ${h.ticker}`}
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
        )}
      </main>

      <MwsTickerPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        excludeTickers={openHoldings.map((h) => h.ticker)}
        onConfirm={handlePickerConfirm}
        busy={pickerBusy}
      />

      <HoldingValuesDialog
        open={valuesOpen}
        onOpenChange={setValuesOpen}
        holdings={valuesTargets}
        onSave={handleSaveValues}
        busy={valuesBusy}
        title="Shares & avg entry"
      />

      <CloseHoldingDialog
        open={closeTarget != null}
        onOpenChange={(o) => {
          if (!o) setCloseTarget(null);
        }}
        ticker={closeTarget?.ticker ?? ''}
        defaultExitPrice={
          closeTarget
            ? (overlays.get(closeTarget.ticker.toUpperCase())?.daily_current_price ?? null)
            : null
        }
        busy={closeBusy}
        onConfirm={handleCloseConfirm}
      />
    </div>
  );
}
