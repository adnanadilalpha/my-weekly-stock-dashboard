'use client';

import { Filter, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runManualTickerUpdateAction } from '../../_actions/api-settings';
import { quickAddAndImportTickerAction } from '../../_actions/ticker-import';
import {
  bulkDeleteTickersAction,
  deleteTickerAction,
  listTickersAction,
  toggleTickerActiveAction,
  type AdminTickerRow,
  type TickerStats,
  type TickerTable,
} from '../../_actions/tickers';
import { useAdmin } from '../../_lib/admin-context';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import { tickerMatchesSearchQuery } from '@/lib/queries/ticker';
import { useLiveAdminRefresh } from '../../_lib/use-live-admin-refresh';
import {
  AdminAlert,
  AdminGhostButton,
  AdminIconButton,
  AdminKpi,
  AdminOutlineButton,
  AdminPageHeader,
  AdminPrimaryButton,
  AdminSearchInput,
  adminField,
  adminPageStack,
  adminSelect,
  adminSurface,
  adminTd,
  adminTh,
} from '../ui/admin-ui';
import { Switch } from '@/app/components/ui/switch';
import { TickerIcon } from '@/app/components/ui/ticker-icon';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';

const PAGE_SIZE = 50;

const SOURCE_TABLE_OPTIONS: { value: TickerTable | 'all'; label: string }[] = [
  { value: 'all', label: 'All sources (preview)' },
  { value: 'market_segments', label: 'Market Segments' },
  { value: 'sectors', label: 'Sectors' },
  { value: 'mega_caps', label: 'Mega Caps' },
  { value: 'other_stocks', label: 'Other Stocks' },
];

function formatMoney(v: number | null) {
  if (v === null) return '—';
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(v: number | null) {
  if (v === null) return '—';
  const pct = v * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function formatVolume(v: number | null) {
  if (v === null) return '—';
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

function formatLastUpdated(iso: string | null) {
  if (!iso) return '—';
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return iso;
  const mins = Math.max(1, Math.round((Date.now() - time) / 60000));
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hrs ago`;
  const days = Math.round(hrs / 24);
  return `${days} days ago`;
}

const TICKER_MGMT_REALTIME = [
  { schema: 'public', table: 'market_segments' },
  { schema: 'public', table: 'sectors' },
  { schema: 'public', table: 'mega_caps' },
  { schema: 'public', table: 'other_stocks' },
] as const;

export default function TickerManagement({ dataActive = true }: { dataActive?: boolean }) {
  const { getAccessToken } = useAdmin();
  const [query, setQuery] = useState('');
  const liveQuery = query.trim();
  const debouncedQuery = useDebouncedValue(liveQuery, 150);
  const [sectorFilter, setSectorFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const [filterMenuPos, setFilterMenuPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 320,
  });
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sourceFilter, setSourceFilter] = useState<TickerTable | 'all'>('all');
  const [updatedSort, setUpdatedSort] = useState<'latest' | 'oldest'>('latest');
  const [etfFilter, setEtfFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [tickers, setTickers] = useState<AdminTickerRow[]>([]);
  const [listStats, setListStats] = useState<TickerStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [listMode, setListMode] = useState<'paged' | 'preview'>('paged');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const isSearchPending = liveQuery !== debouncedQuery;
  const searchBusy = isSearchPending || (loading && Boolean(liveQuery));
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateFlash, setUpdateFlash] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTicker, setAddTicker] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addResult, setAddResult] = useState<{ ok: boolean; message: string; ticker?: string } | null>(
    null
  );
  const addInputRef = useRef<HTMLInputElement>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    actionLabel: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const closeAddModal = () => {
    const addedTicker = addResult?.ok ? addResult.ticker : null;
    setShowAddModal(false);
    setAddTicker('');
    setAddResult(null);
    setAddBusy(false);
    if (addedTicker) {
      setQuery(addedTicker);
      setPage(0);
      void load({ silent: true });
    }
  };

  const openAddModal = () => {
    setAddTicker('');
    setAddResult(null);
    setShowAddModal(true);
    requestAnimationFrame(() => addInputRef.current?.focus());
  };

  const handleAddTicker = async () => {
    const sym = addTicker.trim().toUpperCase();
    if (!sym) {
      setAddResult({ ok: false, message: 'Enter a ticker symbol (e.g. AAPL).' });
      return;
    }
    setAddBusy(true);
    setAddResult(null);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await quickAddAndImportTickerAction(token, { ticker: sym });
      if (!res.ok) {
        setAddResult({ ok: false, message: friendlyAddError(res.error) });
        return;
      }
      if (res.data.status === 'not_found') {
        setAddResult({
          ok: false,
          message: `Couldn't find ${res.data.ticker}. Check the symbol and try again.`,
        });
        return;
      }
      if (res.data.status === 'already_exists') {
        setAddResult({
          ok: false,
          message: `${res.data.ticker} is already in your list.`,
        });
        return;
      }
      setAddResult({
        ok: true,
        ticker: res.data.ticker,
        message: `${res.data.ticker} added.`,
      });
      void load({ silent: true });
    } catch (e) {
      setAddResult({
        ok: false,
        message: e instanceof Error ? e.message : 'Could not add ticker. Try again.',
      });
    } finally {
      setAddBusy(false);
    }
  };

  const listKey = `${sourceFilter}|${debouncedQuery}|${statusFilter}|${updatedSort}`;
  const lastListKeyRef = useRef<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const sort = updatedSort === 'latest' ? 'last_updated_desc' : 'last_updated_asc';
      const res = await listTickersAction(token, {
        page,
        pageSize: PAGE_SIZE,
        sourceTable: sourceFilter,
        search: debouncedQuery,
        status: statusFilter,
        sort,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTickers(res.data.rows);
      setListStats(res.data.stats);
      setTotalCount(res.data.totalCount);
      setListMode(res.data.listMode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [getAccessToken, page, sourceFilter, debouncedQuery, statusFilter, updatedSort]);

  useEffect(() => {
    if (lastListKeyRef.current !== listKey) {
      lastListKeyRef.current = listKey;
      if (page !== 0) {
        setPage(0);
        return;
      }
    }
    void load();
  }, [load, listKey, page]);

  useLiveAdminRefresh({
    enabled: dataActive,
    channelName: 'admin-ticker-management-live',
    getAccessToken,
    refresh: () => void load({ silent: true }),
    pollingMs: 60_000,
    throttleMs: 8_000,
    realtime: [...TICKER_MGMT_REALTIME],
  });

  useEffect(() => {
    if (!filtersOpen) return;
    const recalcPos = () => {
      const el = filterButtonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuWidth = Math.min(320, window.innerWidth - 16);
      const preferredLeft = rect.right - menuWidth;
      const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - menuWidth - 8));
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow >= 360 ? rect.bottom + 8 : Math.max(8, rect.top - 360 - 8);
      setFilterMenuPos({ top, left, width: menuWidth });
    };
    recalcPos();
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = filtersRef.current;
      if (!el) return;
      const target = e.target instanceof Node ? e.target : null;
      if (target && !el.contains(target)) setFiltersOpen(false);
    };
    const onReposition = () => recalcPos();
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [filtersOpen]);

  const filtered = useMemo(
    () =>
      tickers.filter(
        (t) =>
          (sectorFilter === 'all' || t.sector.toLowerCase().includes(sectorFilter)) &&
          (etfFilter === 'all' || (etfFilter === 'mapped' ? t.etf_mapping.length > 0 : t.etf_mapping.length === 0))
      ),
    [tickers, sectorFilter, etfFilter]
  );

  const filteredSorted = useMemo(() => {
    const toTime = (iso: string | null) => {
      if (!iso) return -1;
      const t = new Date(iso).getTime();
      return Number.isFinite(t) ? t : -1;
    };
    return [...filtered].sort((a, b) => {
      const aTime = toTime(a.last_updated);
      const bTime = toTime(b.last_updated);
      return updatedSort === 'latest' ? bTime - aTime : aTime - bTime;
    });
  }, [filtered, updatedSort]);

  const displayRows = useMemo(() => {
    if (!liveQuery) return filteredSorted;
    if (isSearchPending || loading) {
      return filteredSorted.filter(
        (t) =>
          tickerMatchesSearchQuery(t.ticker, liveQuery) ||
          tickerMatchesSearchQuery(t.company, liveQuery)
      );
    }
    return filteredSorted;
  }, [filteredSorted, liveQuery, isSearchPending, loading]);

  const searchHint =
    liveQuery && !searchBusy
      ? totalCount === 0
        ? 'No matches'
        : `${totalCount.toLocaleString()} match${totalCount === 1 ? '' : 'es'}`
      : null;

  const sectorOptions = useMemo(() => {
    const unique = Array.from(new Set(tickers.map((t) => t.sector))).sort((a, b) => a.localeCompare(b));
    return unique;
  }, [tickers]);

  const stats = useMemo(
    () => [
      { label: 'Total Tickers', value: String(listStats?.total ?? 0) },
      { label: 'Active', value: String(listStats?.active ?? 0) },
      { label: 'Inactive', value: String(listStats?.inactive ?? 0) },
      { label: 'Sectors (sampled)', value: String(listStats?.sectors ?? 0) },
    ],
    [listStats]
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const canPrev = listMode === 'paged' && page > 0;
  const canNext = listMode === 'paged' && page + 1 < totalPages;

  const onToggle = async (row: AdminTickerRow) => {
    setError(null);
    setBusyId(row.id);
    try {
      const token = await getAccessToken();
      const res = await toggleTickerActiveAction(token, {
        source_table: row.source_table,
        id: row.id,
        active: !row.active,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTickers((prev) => prev.map((t) => (t.id === row.id ? { ...t, active: res.data.active } : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onManualUpdate = async () => {
    const selected = filteredSorted.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return;
    setUpdateBusy(true);
    setUpdateFlash(null);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await runManualTickerUpdateAction(token, { tickers: selected.map((t) => t.ticker) });
      if (!res.ok) setError(res.error);
      else {
        setUpdateFlash(`Update queued for ${selected.length} ticker${selected.length > 1 ? 's' : ''}: ${selected.map((t) => t.ticker).join(', ')}`);
        setSelectedIds(new Set());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setUpdateBusy(false);
    }
  };

  const executeDeleteOne = async (row: AdminTickerRow) => {
    setError(null);
    setBusyId(row.id);
    try {
      const token = await getAccessToken();
      const res = await deleteTickerAction(token, { source_table: row.source_table, id: row.id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTickers((prev) => prev.filter((t) => t.id !== row.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      setTotalCount((n) => Math.max(0, n - 1));
      setUpdateFlash(`${row.ticker} deleted.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusyId(null);
    }
  };
  const onDeleteOne = (row: AdminTickerRow) => {
    setConfirmDialog({
      title: `Delete ${row.ticker}?`,
      description: 'This action cannot be undone.',
      actionLabel: 'Delete',
      onConfirm: () => executeDeleteOne(row),
    });
  };

  const executeDeleteSelected = async () => {
    const selected = filteredSorted.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await bulkDeleteTickersAction(token, {
        rows: selected.map((t) => ({ source_table: t.source_table, id: t.id })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const removeIds = new Set(selected.map((t) => t.id));
      setTickers((prev) => prev.filter((t) => !removeIds.has(t.id)));
      setSelectedIds(new Set());
      setTotalCount((n) => Math.max(0, n - res.data.deleted));
      setUpdateFlash(`Deleted ${res.data.deleted} ticker${res.data.deleted === 1 ? '' : 's'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setDeleteBusy(false);
    }
  };
  const onDeleteSelected = () => {
    const selected = filteredSorted.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return;
    setConfirmDialog({
      title: `Delete ${selected.length} selected ticker${selected.length === 1 ? '' : 's'}?`,
      description: 'This action cannot be undone.',
      actionLabel: 'Delete selected',
      onConfirm: () => executeDeleteSelected(),
    });
  };

  return (
    <div className={adminPageStack}>
      <AlertDialog open={Boolean(confirmDialog)} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy || busyId != null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBusy || busyId != null}
              onClick={async (e) => {
                e.preventDefault();
                if (!confirmDialog) return;
                await confirmDialog.onConfirm();
                setConfirmDialog(null);
              }}
            >
              {confirmDialog?.actionLabel ?? 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="grid min-w-0 grid-cols-2 gap-4 sm:gap-5 md:gap-6 lg:grid-cols-4">
        {stats.map((stat) => (
          <AdminKpi
            key={stat.label}
            label={stat.label}
            value={loading && !listStats ? '—' : stat.value}
          />
        ))}
      </div>

      <div className={`${adminSurface} min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-visible`}>
        <div className="flex flex-col gap-4 px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
          {updateFlash && (
            <AdminAlert tone="success" onDismiss={() => setUpdateFlash(null)}>
              {updateFlash}
            </AdminAlert>
          )}
          <AdminPageHeader
            title="Tickers"
            description="Add and manage stocks in the live universe."
            actions={
              selectedIds.size > 0 ? (
                <>
                  <AdminPrimaryButton
                    icon={RefreshCw}
                    onClick={() => void onManualUpdate()}
                    disabled={updateBusy || deleteBusy || addBusy}
                  >
                    {updateBusy ? 'Queuing…' : `Update Selected (${selectedIds.size})`}
                  </AdminPrimaryButton>
                  <AdminOutlineButton
                    icon={Trash2}
                    onClick={() => void onDeleteSelected()}
                    disabled={deleteBusy || updateBusy || addBusy}
                    className="border-destructive/35 text-destructive hover:bg-destructive/8"
                  >
                    {deleteBusy ? 'Deleting…' : `Delete Selected (${selectedIds.size})`}
                  </AdminOutlineButton>
                </>
              ) : (
                <AdminOutlineButton icon={Plus} onClick={openAddModal} disabled={addBusy}>
                  Add ticker
                </AdminOutlineButton>
              )
            }
          />

          <div className="flex min-w-0 items-start gap-3">
            <AdminSearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticker or company…"
              busy={searchBusy}
              hint={searchHint}
              onClear={() => setQuery('')}
            />
            <div ref={filtersRef} className="relative shrink-0">
              <AdminGhostButton
                ref={filterButtonRef}
                icon={Filter}
                onClick={() => setFiltersOpen((o) => !o)}
                aria-expanded={filtersOpen}
                aria-haspopup="true"
              >
                Filters
              </AdminGhostButton>
              {filtersOpen && (
                <div
                  className="fixed z-[70] max-h-[min(70vh,28rem)] overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-xl"
                  style={{ top: filterMenuPos.top, left: filterMenuPos.left, width: filterMenuPos.width }}
                  role="dialog"
                  aria-label="Ticker filters"
                >
                  <div className="space-y-4">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Sector
                      </span>
                      <select
                        value={sectorFilter}
                        onChange={(e) => setSectorFilter(e.target.value)}
                        className={adminSelect}
                      >
                        <option value="all">All Sectors</option>
                        {sectorOptions.map((sector) => (
                          <option key={sector} value={sector.toLowerCase()}>
                            {sector}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Status
                      </span>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                        className={adminSelect}
                      >
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Source table
                      </span>
                      <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value as TickerTable | 'all')}
                        className={adminSelect}
                      >
                        {SOURCE_TABLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        ETF mapping
                      </span>
                      <select
                        value={etfFilter}
                        onChange={(e) => setEtfFilter(e.target.value as 'all' | 'mapped' | 'unmapped')}
                        className={adminSelect}
                      >
                        <option value="all">All ETF Mapping</option>
                        <option value="mapped">Mapped to ETF</option>
                        <option value="unmapped">No ETF mapping</option>
                      </select>
                    </label>
                    <div>
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Sort by updated
                      </span>
                      <AdminGhostButton
                        onClick={() => setUpdatedSort((prev) => (prev === 'latest' ? 'oldest' : 'latest'))}
                        className="w-full justify-start"
                      >
                        {updatedSort === 'latest' ? 'Latest first' : 'Oldest first'}
                      </AdminGhostButton>
                    </div>
                    <AdminGhostButton
                      className="w-full"
                      onClick={() => {
                        setQuery('');
                        setSectorFilter('all');
                        setStatusFilter('all');
                        setSourceFilter('all');
                        setEtfFilter('all');
                        setUpdatedSort('latest');
                        setFiltersOpen(false);
                      }}
                    >
                      Clear all filters
                    </AdminGhostButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {error && (
          <div className="px-4 pb-4 sm:px-6">
            <AdminAlert tone="error">{error}</AdminAlert>
          </div>
        )}

        <div className="hidden min-w-0 overflow-x-auto md:block">
          <table className="w-full min-w-262.5 border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left">
                <th className={`${adminTh} w-10`}>
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={displayRows.length > 0 && displayRows.every((t) => selectedIds.has(t.id))}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(new Set(displayRows.map((t) => t.id)));
                      else setSelectedIds(new Set());
                    }}
                  />
                </th>
                <th className={adminTh}>
                  Ticker
                </th>
                <th className={adminTh}>
                  Company
                </th>
                <th className={adminTh}>
                  Sector
                </th>
                <th className={adminTh}>
                  Price
                </th>
                <th className={adminTh}>
                  Volume
                </th>
                <th className={adminTh}>
                  ETF Mapping
                </th>
                <th className={adminTh}>
                  Status
                </th>
                <th className={adminTh}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && !liveQuery && filteredSorted.length === 0 && (
                <tr className="text-sm">
                  <td className={`${adminTd} py-8 text-muted-foreground`} colSpan={9}>
                    Loading…
                  </td>
                </tr>
              )}
              {searchBusy && displayRows.length === 0 && (
                <tr className="text-sm">
                  <td className={`${adminTd} py-8 text-muted-foreground`} colSpan={9}>
                    Searching…
                  </td>
                </tr>
              )}
              {!searchBusy && !loading && displayRows.length === 0 && (
                <tr className="text-sm">
                  <td className={`${adminTd} py-8 text-muted-foreground`} colSpan={9}>
                    {liveQuery ? 'No matches.' : 'No tickers match.'}
                  </td>
                </tr>
              )}
              {displayRows.map((item) => (
                <tr
                  key={item.id}
                  className={`text-sm transition-colors hover:bg-muted/30 ${
                    selectedIds.has(item.id) ? 'bg-primary/5 dark:bg-primary/10' : ''
                  }`}
                >
                  <td className={`${adminTd} w-10`}>
                    <input
                      type="checkbox"
                      className="rounded border-border"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                    />
                  </td>
                  <td className={adminTd}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                        <TickerIcon ticker={item.ticker} size={32} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
                      </div>
                      <span className="font-semibold">{item.ticker}</span>
                    </div>
                  </td>
                  <td className={adminTd}>
                    <div className="font-medium text-foreground">{item.company}</div>
                    <div className="text-xs text-muted-foreground">Updated {formatLastUpdated(item.last_updated)}</div>
                  </td>
                  <td className={`${adminTd} text-muted-foreground`}>{item.sector}</td>
                  <td className={adminTd}>
                    <div className="font-semibold text-foreground">{formatMoney(item.price)}</div>
                    <div
                      className={`text-xs font-semibold ${
                        formatPct(item.change_pct).startsWith('+')
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatPct(item.change_pct)}
                    </div>
                  </td>
                  <td className={`${adminTd} text-muted-foreground`}>{formatVolume(item.volume)}</td>
                  <td className={adminTd}>
                    <div className="flex flex-wrap gap-1">
                      {item.etf_mapping.map((etf) => (
                        <span
                          key={`${item.ticker}-${etf}`}
                          className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300"
                        >
                          {etf}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className={adminTd}>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        item.active
                          ? 'border border-emerald-500/25 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                          : 'border border-border bg-muted/60 text-muted-foreground'
                      }`}
                    >
                      {item.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className={adminTd}>
                    <div className="flex items-center gap-2.5">
                      <Switch
                        checked={item.active}
                        onCheckedChange={() => void onToggle(item)}
                        disabled={busyId === item.id}
                        aria-label={item.active ? `Disable ${item.ticker}` : `Enable ${item.ticker}`}
                        className="border border-border data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-500/70 dark:data-[state=unchecked]:bg-slate-600"
                      />
                      <AdminIconButton
                        icon={Trash2}
                        tone="danger"
                        onClick={() => void onDeleteOne(item)}
                        disabled={busyId === item.id}
                        title="Delete ticker"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4 p-4 md:hidden">
          {searchBusy && displayRows.length === 0 && (
            <div className="rounded-xl border border-border/80 p-4 text-sm text-muted-foreground">Searching…</div>
          )}
          {!searchBusy && !loading && displayRows.length === 0 && (
            <div className="rounded-xl border border-border/80 p-4 text-sm text-muted-foreground">
              {liveQuery ? 'No matches.' : 'No tickers match.'}
            </div>
          )}
          {displayRows.map((item) => (
            <div key={item.id} className="rounded-xl border border-border/80 bg-card p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                    <TickerIcon ticker={item.ticker} size={32} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
                  </div>
                  <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{item.ticker} - {item.company}</div>
                  <div className="text-xs text-muted-foreground">{item.sector} · Vol {formatVolume(item.volume)}</div>
                  </div>
                </div>
                <span
                  className={`shrink-0 text-xs font-semibold ${
                    formatPct(item.change_pct).startsWith('+')
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {formatPct(item.change_pct)}
                </span>
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {item.etf_mapping.map((etf) => (
                  <span
                    key={`${item.ticker}-${etf}-mobile`}
                    className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300"
                  >
                    {etf}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                    item.active
                      ? 'border border-emerald-500/25 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                      : 'border border-border bg-muted/60 text-muted-foreground'
                  }`}
                >
                  {item.active ? 'Active' : 'Inactive'}
                </span>
                <div className="flex items-center gap-2.5">
                  <Switch
                    checked={item.active}
                    onCheckedChange={() => void onToggle(item)}
                    disabled={busyId === item.id}
                    aria-label={item.active ? `Disable ${item.ticker}` : `Enable ${item.ticker}`}
                    className="border border-border data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-500/70 dark:data-[state=unchecked]:bg-slate-600"
                  />
                  <AdminIconButton
                    icon={Trash2}
                    tone="danger"
                    onClick={() => void onDeleteOne(item)}
                    disabled={busyId === item.id}
                    title="Delete ticker"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-4 text-sm md:flex-row md:items-center md:justify-between md:px-6">
          <div className="text-muted-foreground">
            {listMode === 'preview' ? (
              <span>
                Preview: <span className="font-semibold text-foreground">{displayRows.length}</span> symbols (cap
                across tables). Choose a source for full paginated lists.
              </span>
            ) : (
              <span>
                Page <span className="font-semibold text-foreground">{page + 1}</span> of{' '}
                <span className="font-semibold text-foreground">{totalPages}</span> · Showing{' '}
                <span className="font-semibold text-foreground">{displayRows.length}</span> loaded ·{' '}
                <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span> in this source
                {sectorFilter !== 'all' || etfFilter !== 'all' ? ' (filters apply to this page)' : ''}
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <AdminGhostButton
              disabled={!canPrev || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </AdminGhostButton>
            <AdminOutlineButton
              disabled={!canNext || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </AdminOutlineButton>
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border-0 bg-card shadow-[0_8px_40px_rgba(15,23,42,0.12),0_0_0_1px_rgba(15,23,42,0.08)]">
            <div className="flex items-start justify-between gap-3 border-b border-black/6 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  {addResult?.ok ? 'Ticker added' : addResult && !addResult.ok ? 'Couldn’t add ticker' : 'Add ticker'}
                </h2>
                {!addResult ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Enter a symbol. We’ll look it up and add it if it exists.
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={addBusy}
                onClick={closeAddModal}
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {addResult ? (
              <div className="space-y-4 p-5">
                <AdminAlert tone={addResult.ok ? 'success' : 'error'}>{addResult.message}</AdminAlert>
                <div className="flex justify-end gap-2">
                  {!addResult.ok ? (
                    <AdminGhostButton
                      type="button"
                      onClick={() => {
                        setAddResult(null);
                        requestAnimationFrame(() => addInputRef.current?.focus());
                      }}
                    >
                      Try again
                    </AdminGhostButton>
                  ) : null}
                  <AdminPrimaryButton type="button" onClick={closeAddModal}>
                    Close
                  </AdminPrimaryButton>
                </div>
              </div>
            ) : (
              <form
                className="space-y-4 p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleAddTicker();
                }}
              >
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-foreground">Symbol</span>
                  <input
                    ref={addInputRef}
                    value={addTicker}
                    onChange={(e) => setAddTicker(e.target.value.toUpperCase())}
                    placeholder="e.g. AAPL"
                    maxLength={40}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={addBusy}
                    autoFocus
                    className={`${adminField} font-medium tracking-wide`}
                  />
                </label>
                <div className="flex justify-end gap-2 pt-1">
                  <AdminGhostButton type="button" disabled={addBusy} onClick={closeAddModal}>
                    Cancel
                  </AdminGhostButton>
                  <AdminPrimaryButton
                    type="submit"
                    icon={Plus}
                    disabled={addBusy || !addTicker.trim()}
                  >
                    {addBusy ? 'Adding…' : 'Add'}
                  </AdminPrimaryButton>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function friendlyAddError(raw: string): string {
  const msg = (raw ?? '').trim();
  if (!msg) return 'Could not add ticker. Try again.';
  const lower = msg.toLowerCase();
  if (lower.includes('api key') || lower.includes('no active')) {
    return 'Market data isn’t set up. Add an API key in API & Data, then try again.';
  }
  if (lower.includes('provider lookup') || lower.includes('provider')) {
    return 'Couldn’t verify that symbol right now. Try again in a moment.';
  }
  if (lower.includes('valid ticker') || lower.includes('enter a')) {
    return 'Enter a valid ticker symbol (e.g. AAPL).';
  }
  return msg;
}

