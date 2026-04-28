'use client';

import { ChevronDown, Filter, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runManualTickerUpdateAction } from '../../_actions/api-settings';
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
import { useLiveAdminRefresh } from '../../_lib/use-live-admin-refresh';
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

export default function TickerManagement() {
  const { getAccessToken } = useAdmin();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
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
  const [sourceFilter, setSourceFilter] = useState<TickerTable | 'all'>('other_stocks');
  const [updatedSort, setUpdatedSort] = useState<'latest' | 'oldest'>('latest');
  const [etfFilter, setEtfFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [tickers, setTickers] = useState<AdminTickerRow[]>([]);
  const [listStats, setListStats] = useState<TickerStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [listMode, setListMode] = useState<'paged' | 'preview'>('paged');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateFlash, setUpdateFlash] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    actionLabel: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const listKey = `${sourceFilter}|${debouncedQuery}|${statusFilter}|${updatedSort}`;
  const lastListKeyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
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
    channelName: 'admin-ticker-management-live',
    getAccessToken,
    refresh: load,
    pollingMs: 45_000,
    throttleMs: 5_000,
    realtime: [
      { schema: 'public', table: 'market_segments' },
      { schema: 'public', table: 'sectors' },
      { schema: 'public', table: 'mega_caps' },
      { schema: 'public', table: 'other_stocks' },
    ],
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
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
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
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
          >
            <div className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {loading && !listStats ? '—' : stat.value}
            </div>
            <div className="mt-2 text-sm font-medium text-muted-foreground">{stat.label}</div>
            <div
              className={`mt-2 h-1 w-10 rounded-full ${
                i === 0
                  ? 'bg-violet-500/80'
                  : i === 1
                    ? 'bg-emerald-500/80'
                    : i === 2
                      ? 'bg-sky-500/80'
                      : 'bg-amber-500/80'
              }`}
              aria-hidden
            />
          </div>
        ))}
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-visible rounded-2xl border border-border bg-card shadow-sm">
        {updateFlash && (
          <div className="border-b border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-100 md:px-6">
            {updateFlash}
          </div>
        )}
        <div className="border-b border-border bg-muted/40 px-4 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">All Tickers</h3>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Manage tracked stocks and ETF mappings</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedIds.size > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => void onManualUpdate()}
                    disabled={updateBusy || deleteBusy}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={updateBusy ? 'animate-spin' : ''} />
                    {updateBusy ? 'Queuing…' : `Update Selected (${selectedIds.size})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDeleteSelected()}
                    disabled={deleteBusy || updateBusy}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm transition-colors hover:bg-rose-500/15 dark:text-rose-300 disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                    {deleteBusy ? 'Deleting…' : `Delete Selected (${selectedIds.size})`}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="relative w-full max-w-xs">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ticker or company..."
                className="h-10 w-full rounded-lg border border-border bg-card py-2 pl-9 pr-4 text-sm text-foreground shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div ref={filtersRef} className="relative w-full shrink-0 sm:w-auto">
              <button
                type="button"
                ref={filterButtonRef}
                onClick={() => setFiltersOpen((o) => !o)}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 sm:min-w-[9.5rem]"
                aria-expanded={filtersOpen}
                aria-haspopup="true"
              >
                <Filter size={15} aria-hidden />
                Filters
                <ChevronDown
                  size={16}
                  className={`shrink-0 opacity-70 transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
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
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm"
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
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm"
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
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm"
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
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm"
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
                      <button
                        type="button"
                        onClick={() => setUpdatedSort((prev) => (prev === 'latest' ? 'oldest' : 'latest'))}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
                      >
                        {updatedSort === 'latest' ? 'Latest first' : 'Oldest first'}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setSectorFilter('all');
                        setStatusFilter('all');
                        setSourceFilter('other_stocks');
                        setEtfFilter('all');
                        setUpdatedSort('latest');
                        setFiltersOpen(false);
                      }}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
                    >
                      Clear all filters
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {error && (
          <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive md:px-6 dark:border-destructive/30 dark:bg-destructive/15">
            {error}
          </div>
        )}

        <div className="hidden min-w-0 overflow-x-auto md:block">
          <table className="w-full min-w-[1050px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left">
                <th className="w-10 border-b border-border bg-muted/50 px-4 py-3">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={filteredSorted.length > 0 && filteredSorted.every((t) => selectedIds.has(t.id))}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(new Set(filteredSorted.map((t) => t.id)));
                      else setSelectedIds(new Set());
                    }}
                  />
                </th>
                <th className="border-b border-border bg-muted/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-6 sm:text-[11px]">
                  Ticker
                </th>
                <th className="border-b border-border bg-muted/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-6 sm:text-[11px]">
                  Company
                </th>
                <th className="border-b border-border bg-muted/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-6 sm:text-[11px]">
                  Sector
                </th>
                <th className="border-b border-border bg-muted/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-6 sm:text-[11px]">
                  Price
                </th>
                <th className="border-b border-border bg-muted/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-6 sm:text-[11px]">
                  Volume
                </th>
                <th className="border-b border-border bg-muted/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-6 sm:text-[11px]">
                  ETF Mapping
                </th>
                <th className="border-b border-border bg-muted/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-6 sm:text-[11px]">
                  Status
                </th>
                <th className="border-b border-border bg-muted/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-6 sm:text-[11px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="border-b border-border text-sm">
                  <td className="px-4 py-8 text-muted-foreground sm:px-6" colSpan={9}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filteredSorted.length === 0 && (
                <tr className="border-b border-border text-sm">
                  <td className="px-4 py-8 text-muted-foreground sm:px-6" colSpan={9}>
                    No tickers match.
                  </td>
                </tr>
              )}
              {filteredSorted.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-border text-sm transition-colors last:border-b-0 hover:bg-muted/30 ${
                    selectedIds.has(item.id) ? 'bg-primary/5 dark:bg-primary/10' : ''
                  }`}
                >
                  <td className="w-10 px-4 py-3.5 sm:py-4">
                    <input
                      type="checkbox"
                      className="rounded border-border"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                    />
                  </td>
                  <td className="px-4 py-3.5 text-foreground sm:px-6 sm:py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                        <TickerIcon ticker={item.ticker} size={32} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
                      </div>
                      <span className="font-semibold">{item.ticker}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 sm:px-6 sm:py-4">
                    <div className="font-medium text-foreground">{item.company}</div>
                    <div className="text-xs text-muted-foreground">Updated {formatLastUpdated(item.last_updated)}</div>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground sm:px-6 sm:py-4">{item.sector}</td>
                  <td className="px-4 py-3.5 sm:px-6 sm:py-4">
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
                  <td className="px-4 py-3.5 text-muted-foreground sm:px-6 sm:py-4">{formatVolume(item.volume)}</td>
                  <td className="px-4 py-3.5 sm:px-6 sm:py-4">
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
                  <td className="px-4 py-3.5 sm:px-6 sm:py-4">
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
                  <td className="px-4 py-3.5 sm:px-6 sm:py-4">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Switch
                        checked={item.active}
                        onCheckedChange={() => void onToggle(item)}
                        disabled={busyId === item.id}
                        aria-label={item.active ? `Disable ${item.ticker}` : `Enable ${item.ticker}`}
                        className="border border-border data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-500/70 dark:data-[state=unchecked]:bg-slate-600"
                      />
                      <button
                        type="button"
                        onClick={() => void onDeleteOne(item)}
                        disabled={busyId === item.id}
                        className="rounded-lg p-2 text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"
                        title="Delete ticker"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4 p-4 md:hidden">
          {!loading && filteredSorted.length === 0 && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">No tickers match.</div>
          )}
          {filteredSorted.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
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
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Switch
                    checked={item.active}
                    onCheckedChange={() => void onToggle(item)}
                    disabled={busyId === item.id}
                    aria-label={item.active ? `Disable ${item.ticker}` : `Enable ${item.ticker}`}
                    className="border border-border data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-500/70 dark:data-[state=unchecked]:bg-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => void onDeleteOne(item)}
                    disabled={busyId === item.id}
                    className="rounded-lg p-2 text-rose-600 hover:bg-rose-500/10 disabled:opacity-60 dark:text-rose-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-4 py-4 text-sm md:flex-row md:items-center md:justify-between md:px-6">
          <div className="text-muted-foreground">
            {listMode === 'preview' ? (
              <span>
                Preview: <span className="font-semibold text-foreground">{filteredSorted.length}</span> symbols (cap
                across tables). Choose a source for full paginated lists.
              </span>
            ) : (
              <span>
                Page <span className="font-semibold text-foreground">{page + 1}</span> of{' '}
                <span className="font-semibold text-foreground">{totalPages}</span> · Showing{' '}
                <span className="font-semibold text-foreground">{filteredSorted.length}</span> loaded ·{' '}
                <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span> in this source
                {sectorFilter !== 'all' || etfFilter !== 'all' ? ' (filters apply to this page)' : ''}
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={!canPrev || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-border bg-card px-4 py-2 font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!canNext || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

