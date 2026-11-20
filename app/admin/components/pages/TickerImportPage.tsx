'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Ellipsis,
  Filter,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
  Activity,
  DownloadCloud,
  FileSpreadsheet,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdminAlert,
  AdminGhostButton,
  AdminOutlineButton,
  AdminPageHeader,
  AdminSearchInput,
  adminField,
  adminPageStack,
  adminSelect,
  adminSurface,
  adminSurfacePad,
  adminTh,
} from '../ui/admin-ui';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import { tickerMatchesSearchQuery } from '@/lib/queries/ticker';
import {
  bulkImportTickerCandidatesAction,
  deleteTickerCandidatesAction,
  getTickerCandidateStatsAction,
  importTickerCandidateAction,
  listTickerCandidatesAction,
  quickAddAndImportTickerAction,
  scanTickerCandidatesAction,
  skipTickerCandidateAction,
  type CandidateImportStatus,
  type CandidateProviderStatus,
  type TargetTable,
  type TickerCandidate,
  type TickerCandidateStats,
} from '../../_actions/ticker-import';
import TickerImportAddCandidatesModal from './TickerImportAddCandidatesModal';
import {
  getAdminApiConfigAction,
  runUpdateTickersAction,
  runImportCandidatesAction,
  listApiHealthAction,
  type ApiHealthRow,
} from '../../_actions/api-settings';
import { pickActiveEdgeProgressRow, type ApiHealthProgressPayload } from '../../_lib/api-health-progress';
import { useAdmin } from '../../_lib/admin-context';
import { useLiveAdminRefresh } from '../../_lib/use-live-admin-refresh';
import { TickerIcon } from '@/app/components/ui/ticker-icon';
import { supabase } from '@/lib/supabase-client';

const TARGET_TABLE_LABELS: Record<TargetTable, string> = {
  market_segments: 'Market Segments',
  sectors: 'Sectors',
  mega_caps: 'Mega Caps',
  other_stocks: 'Other Stocks',
};
const TARGET_TABLES: TargetTable[] = ['market_segments', 'sectors', 'mega_caps', 'other_stocks'];

const PAGE_SIZE = 100;

function ProviderBadge({ status }: { status: CandidateProviderStatus }) {
  switch (status) {
    case 'found':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-100">
          <CheckCircle2 size={11} />
          Found
        </span>
      );
    case 'not_found':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
          <XCircle size={11} />
          Not found
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-semibold text-orange-900 dark:text-orange-100">
          <AlertCircle size={11} />
          Error
        </span>
      );
    default:
      return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Pending</span>;
  }
}

function ImportBadge({ status }: { status: CandidateImportStatus }) {
  switch (status) {
    case 'imported':
      return (
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-100">Imported</span>
      );
    case 'skipped':
      return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Skipped</span>;
    default:
      return (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Pending</span>
      );
  }
}

const TICKER_IMPORT_REALTIME = [
  { schema: 'public', table: 'ticker_import_candidates' },
  { schema: 'public', table: 'admin_api_config' },
] as const;

export default function TickerImportPage({ dataActive = true }: { dataActive?: boolean }) {
  const { getAccessToken } = useAdmin();

  const [rows, setRows] = useState<TickerCandidate[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<TickerCandidateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<'update' | 'import-candidates' | null>(null);
  /** In-flight edge job from this session, cron, or another tab — parsed from api_health_log. */
  const [edgeLiveProgress, setEdgeLiveProgress] = useState<ApiHealthProgressPayload | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeReadyRef = useRef(false);

  // Filters
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<CandidateProviderStatus | 'all'>('all');
  const [importFilter, setImportFilter] = useState<CandidateImportStatus | 'all'>('all');
  const [systemFilter, setSystemFilter] = useState<'all' | 'new' | 'existing'>('all');
  const [page, setPage] = useState(0);
  const liveSearch = search.trim();
  const debouncedSearch = useDebouncedValue(liveSearch, 150);
  const isSearchPending = liveSearch !== debouncedSearch;
  const searchBusy = isSearchPending || (loading && Boolean(liveSearch));

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState<TargetTable>('other_stocks');
  const [bulkActive, setBulkActive] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [preferredProvider, setPreferredProvider] = useState<string | null>(null);
  const [quickTicker, setQuickTicker] = useState('');
  const [quickTarget, setQuickTarget] = useState<TargetTable>('other_stocks');
  const [quickAdding, setQuickAdding] = useState(false);
  const [quickAutoRoute, setQuickAutoRoute] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsWrapRef = useRef<HTMLDivElement>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);

  // Row-level import target
  const [rowTarget, setRowTarget] = useState<Record<string, TargetTable>>({});

  // Floating filter panel — same pattern as TickerManagement
  const filtersWrapRef = useRef<HTMLDivElement>(null);
  const filtersBtnRef = useRef<HTMLButtonElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterMenuPos, setFilterMenuPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 320 });

  // Delete confirmation
  type DeleteConfirm = { ids: string[]; affectedTickers: string[]; systemCount: number };
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [deleting, setDeleting] = useState(false);

  const statsRef = useRef(stats);
  statsRef.current = stats;
  const preferredProviderRef = useRef(preferredProvider);
  preferredProviderRef.current = preferredProvider;

  const loadData = useCallback(async (opts?: { silent?: boolean; withStats?: boolean }) => {
    const needStats = opts?.withStats === true || statsRef.current == null;
    const needConfig = preferredProviderRef.current == null;
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const inSystem = systemFilter === 'all' ? 'all' : systemFilter === 'existing';
      const listPromise = listTickerCandidatesAction(token, {
        provider_status: providerFilter,
        import_status: importFilter,
        in_system: inSystem,
        search: debouncedSearch || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      const statsPromise = needStats ? getTickerCandidateStatsAction(token) : null;
      const cfgPromise = needConfig ? getAdminApiConfigAction(token) : null;
      const [listRes, statsRes, cfgRes] = await Promise.all([
        listPromise,
        statsPromise,
        cfgPromise,
      ]);
      if (!listRes.ok) { setError(listRes.error); return; }
      if (statsRes && !statsRes.ok) { setError(statsRes.error); return; }
      if (cfgRes?.ok) {
        setPreferredProvider(cfgRes.data.preferred_provider?.trim().toLowerCase() ?? 'finnhub');
      }
      setRows(listRes.data.rows);
      setTotalCount(listRes.data.total_count);
      if (statsRes?.ok) setStats(statsRes.data);
      if (!opts?.silent) setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [getAccessToken, providerFilter, importFilter, systemFilter, debouncedSearch, page]);

  const lastListKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const listKey = `${debouncedSearch}|${providerFilter}|${importFilter}|${systemFilter}`;
    if (lastListKeyRef.current !== listKey) {
      lastListKeyRef.current = listKey;
      if (page !== 0) {
        setPage(0);
        return;
      }
    }
    void loadData();
  }, [loadData, page, debouncedSearch, providerFilter, importFilter, systemFilter]);

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;
  const runningActionRef = useRef(runningAction);
  runningActionRef.current = runningAction;

  // Position + close logic — exact same pattern as TickerManagement
  useEffect(() => {
    if (!filtersOpen) return;
    const recalcPos = () => {
      const el = filtersBtnRef.current;
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
      const el = filtersWrapRef.current;
      if (!el) return;
      const target = e.target instanceof Node ? e.target : null;
      if (target && !el.contains(target)) setFiltersOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    window.addEventListener('resize', recalcPos);
    window.addEventListener('scroll', recalcPos, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('resize', recalcPos);
      window.removeEventListener('scroll', recalcPos, true);
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (!toolsOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = toolsWrapRef.current;
      if (!el) return;
      const target = e.target instanceof Node ? e.target : null;
      if (target && !el.contains(target)) setToolsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [toolsOpen]);

  // Prompt delete confirmation — resolves which tickers are in system from current rows list
  const promptDelete = useCallback((ids: string[]) => {
    const affected = rows.filter((r) => ids.includes(r.id));
    const systemOnes = affected.filter((r) => r.is_in_system || r.import_status === 'imported');
    setDeleteConfirm({
      ids,
      affectedTickers: affected.map((r) => r.ticker),
      systemCount: systemOnes.length,
    });
  }, [rows]);

  // Execute delete after confirmation
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await deleteTickerCandidatesAction(token, { ids: deleteConfirm.ids });
      if (!res.ok) { setError(res.error); return; }
      const { deleted_candidates, deleted_from_system } = res.data;
      setSuccessMsg(
        `Deleted ${deleted_candidates} candidate${deleted_candidates !== 1 ? 's' : ''}${deleted_from_system > 0 ? ` and removed ${deleted_from_system} ticker${deleted_from_system !== 1 ? 's' : ''} from system tables` : ''}.`
      );
      setSelected(new Set());
      void loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  }, [deleteConfirm, getAccessToken, loadData]);

  const applyProgressRows = useCallback((rows: ApiHealthRow[]) => {
    const found = pickActiveEdgeProgressRow(rows);
    setEdgeLiveProgress(found?.progress ?? null);
    if (!found && runningActionRef.current) {
      setRunningAction(null);
      void loadDataRef.current();
    }
  }, []);

  const fetchLatestProgress = useCallback(async () => {
    const token = await getAccessToken();
    const res = await listApiHealthAction(token, { limit: 30 });
    if (!res.ok) return;
    applyProgressRows(res.data as ApiHealthRow[]);
  }, [applyProgressRows, getAccessToken]);

  const dataJobBlocking =
    scanning ||
    runningAction !== null ||
    (edgeLiveProgress !== null && edgeLiveProgress.percent < 100);

  // Progress polling only while this page is visible — was flooding the action queue every 2.5s.
  useEffect(() => {
    if (!dataActive) return;
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtime = async () => {
      try {
        const token = await getAccessToken();
        supabase.realtime.setAuth(token);
        channel = supabase
          .channel('admin-api-health-log')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'api_health_log' },
            () => {
              void fetchLatestProgress();
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              realtimeReadyRef.current = true;
            }
          });
      } catch {
        // fallback polling still runs
      }
    };

    const tick = async () => {
      try {
        if (!realtimeReadyRef.current) {
          await fetchLatestProgress();
        }
      } catch {
        /* silent */
      }
    };

    void setupRealtime();
    void fetchLatestProgress();
    pollRef.current = setInterval(() => {
      if (disposed) return;
      void tick();
    }, 5_000);
    return () => {
      disposed = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (channel) {
        void supabase.removeChannel(channel);
      }
      realtimeReadyRef.current = false;
    };
  }, [dataActive, fetchLatestProgress, getAccessToken]);

  useLiveAdminRefresh({
    enabled: dataActive,
    channelName: 'admin-ticker-import-live',
    getAccessToken,
    refresh: () => void loadData({ silent: true, withStats: true }),
    pollingMs: 60_000,
    throttleMs: 8_000,
    realtime: [...TICKER_IMPORT_REALTIME],
  });

  const handleUpdateTickers = async () => {
    if (dataJobBlocking) return;
    setError(null);
    setSuccessMsg('Update Tickers started. Batches of 40, self-chains until all tickers updated.');
    setRunningAction('update');
    try {
      const token = await getAccessToken();
      const res = await runUpdateTickersAction(token);
      if (!res.ok) {
        setError(res.error);
        setRunningAction(null);
        return;
      }
      if (res.data.queued) {
        setSuccessMsg('Update running in background.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.');
      setRunningAction(null);
    }
  };

  const handleImportCandidates = async () => {
    if (dataJobBlocking) return;
    setError(null);
    setSuccessMsg('Import Tickers started. Batches of 12 from the candidates list, self-chains until all imported.');
    setRunningAction('import-candidates');
    try {
      const token = await getAccessToken();
      const res = await runImportCandidatesAction(token);
      if (!res.ok) {
        setError(res.error);
        setRunningAction(null);
        return;
      }
      if (res.data.queued) {
        setSuccessMsg('Import running in background.');
        void loadData();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
      setRunningAction(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const handleScan = async () => {
    if (dataJobBlocking) return;
    setScanning(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const token = await getAccessToken();
      const res = await scanTickerCandidatesAction(token);
      if (!res.ok) { setError(res.error); return; }
      const { scanned, found, not_found, already_in_system } = res.data;
      setSuccessMsg(
        `Scan complete: ${scanned} tickers checked — ${found} found in provider, ${not_found} not found, ${already_in_system} already in system.`
      );
      void loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed.');
    } finally {
      setScanning(false);
    }
  };

  const openQuickAdd = () => {
    setQuickTicker('');
    setQuickAutoRoute(true);
    setQuickTarget('other_stocks');
    setShowQuickAddModal(true);
    requestAnimationFrame(() => quickInputRef.current?.focus());
  };

  const handleQuickAdd = async () => {
    const sym = quickTicker.trim().toUpperCase();
    if (!sym) {
      setError('Enter a ticker symbol (e.g. SPCX).');
      return;
    }
    setQuickAdding(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const token = await getAccessToken();
      const res = await quickAddAndImportTickerAction(token, {
        ticker: sym,
        targetTable: quickAutoRoute ? undefined : quickTarget,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccessMsg(res.data.message);
      setQuickTicker('');
      setShowQuickAddModal(false);
      setSearch(res.data.ticker);
      setProviderFilter('all');
      setImportFilter('all');
      setSystemFilter('all');
      setPage(0);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quick add failed.');
    } finally {
      setQuickAdding(false);
    }
  };

  const handleImport = async (row: TickerCandidate) => {
    const target = rowTarget[row.id] ?? row.import_target_table ?? 'other_stocks';
    setImporting(row.id);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await importTickerCandidateAction(token, { id: row.id, targetTable: target });
      if (!res.ok) { setError(res.error); return; }
      setSuccessMsg(`${res.data.ticker} imported to ${TARGET_TABLE_LABELS[res.data.targetTable]}.`);
      void loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setImporting(null);
    }
  };

  const handleSkip = async (id: string) => {
    setError(null);
    try {
      const token = await getAccessToken();
      await skipTickerCandidateAction(token, { id });
      void loadData();
    } catch {
      // silent
    }
  };

  const handleBulkImport = async () => {
    if (selected.size === 0) return;
    setBulkImporting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await bulkImportTickerCandidatesAction(token, {
        ids: Array.from(selected),
        targetTable: bulkTarget,
        activateImmediately: bulkActive,
      });
      if (!res.ok) { setError(res.error); return; }
      const { imported, skipped, errors } = res.data;
      setSuccessMsg(
        `Bulk import: ${imported} imported, ${skipped} skipped to ${TARGET_TABLE_LABELS[bulkTarget]}.${errors.length > 0 ? ` Issues: ${errors.slice(0, 3).join('; ')}` : ''}`
      );
      void loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk import failed.');
    } finally {
      setBulkImporting(false);
    }
  };

  const visibleRows = useMemo(() => {
    if (!liveSearch) return rows;
    if (isSearchPending || loading) {
      return rows.filter(
        (r) =>
          tickerMatchesSearchQuery(r.ticker, liveSearch) ||
          tickerMatchesSearchQuery(r.provider_name ?? '', liveSearch)
      );
    }
    return rows;
  }, [rows, liveSearch, isSearchPending, loading]);

  const searchHint =
    liveSearch && !searchBusy
      ? totalCount === 0
        ? 'No matches'
        : `${totalCount.toLocaleString()} match${totalCount === 1 ? '' : 'es'}`
      : null;

  const allPageSelected = useMemo(
    () => visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id)),
    [visibleRows, selected]
  );

  // Count of selected tickers that are actually importable (not already in system)
  const importableSelectedCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          selected.has(r.id) &&
          r.provider_status === 'found' &&
          !r.is_in_system &&
          r.import_status === 'pending'
      ).length,
    [rows, selected]
  );

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        visibleRows.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        visibleRows.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={adminPageStack}>
      {error && <AdminAlert tone="error">{error}</AdminAlert>}
      {successMsg && (
        <AdminAlert tone="success" onDismiss={() => setSuccessMsg(null)}>
          {successMsg}
        </AdminAlert>
      )}

      {(runningAction || edgeLiveProgress) && (
        <div className={`${adminSurface} px-5 py-3`}>
          {edgeLiveProgress ? (
            <>
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {edgeLiveProgress.mode === 'import' ? 'Importing' : 'Updating'} · {edgeLiveProgress.phase}
                </span>
                <span>{edgeLiveProgress.percent}%</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70 transition-all duration-500"
                  style={{ width: `${Math.max(2, edgeLiveProgress.percent)}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Job queued…</p>
          )}
        </div>
      )}

      <div className={`min-h-0 min-w-0 flex-1 ${adminSurface}`}>
        <div className={`${adminSurfacePad} border-b border-border/70`}>
          <AdminPageHeader
            title="Ticker List"
            description={
              stats
                ? `${stats.in_system.toLocaleString()} in system${
                    stats.ready_to_import > 0 ? ` · ${stats.ready_to_import} ready` : ''
                  }${stats.pending_scan > 0 ? ` · ${stats.pending_scan} pending` : ''}`
                : `${totalCount.toLocaleString()} candidates`
            }
            actions={
              <>
                <div ref={toolsWrapRef} className="relative">
                  <AdminGhostButton
                    icon={Ellipsis}
                    aria-expanded={toolsOpen}
                    aria-haspopup="menu"
                    title="More tools"
                    className="size-10 px-0"
                    onClick={() => setToolsOpen((v) => !v)}
                  />
                  {toolsOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border/80 bg-card py-1 shadow-lg"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        disabled={dataJobBlocking}
                        onClick={() => {
                          setToolsOpen(false);
                          setShowBulkModal(true);
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"
                      >
                        <FileSpreadsheet size={15} className="text-muted-foreground" />
                        Bulk add from file
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={dataJobBlocking || preferredProvider === 'yahoo'}
                        onClick={() => {
                          setToolsOpen(false);
                          void handleScan();
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"
                      >
                        <RefreshCw size={15} className={`text-muted-foreground ${scanning ? 'animate-spin' : ''}`} />
                        Scan candidates
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={dataJobBlocking}
                        onClick={() => {
                          setToolsOpen(false);
                          void handleUpdateTickers();
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"
                      >
                        <Activity size={15} className="text-muted-foreground" />
                        Update all tickers
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={dataJobBlocking}
                        onClick={() => {
                          setToolsOpen(false);
                          void handleImportCandidates();
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"
                      >
                        <DownloadCloud size={15} className="text-muted-foreground" />
                        Import found queue
                      </button>
                      <div className="my-1 border-t border-border/70" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setToolsOpen(false);
                          void loadData();
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted"
                      >
                        <Download size={15} className="text-muted-foreground" />
                        Refresh list
                      </button>
                    </div>
                  )}
                </div>
                <AdminOutlineButton icon={Plus} onClick={openQuickAdd}>
                  Add ticker
                </AdminOutlineButton>
              </>
            }
          />

          <div className="mt-5 flex items-start gap-2">
            <AdminSearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticker…"
              busy={searchBusy}
              hint={searchHint}
              onClear={() => setSearch('')}
            />

            <div ref={filtersWrapRef} className="relative shrink-0">
              <AdminGhostButton
                ref={filtersBtnRef}
                icon={Filter}
                aria-expanded={filtersOpen}
                aria-haspopup="true"
                onClick={() => setFiltersOpen((v) => !v)}
                className={
                  filtersOpen || providerFilter !== 'all' || importFilter !== 'all' || systemFilter !== 'all'
                    ? 'border-primary/35 text-primary'
                    : ''
                }
              >
                {(providerFilter !== 'all' || importFilter !== 'all' || systemFilter !== 'all') && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {[providerFilter !== 'all', importFilter !== 'all', systemFilter !== 'all'].filter(Boolean).length}
                  </span>
                )}
              </AdminGhostButton>

              {filtersOpen && (
                <div
                  className="fixed z-[70] rounded-xl border border-border bg-card p-4 shadow-xl"
                  style={{ top: filterMenuPos.top, left: filterMenuPos.left, width: filterMenuPos.width }}
                  role="dialog"
                  aria-label="Candidate filters"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Filters</span>
                    {(providerFilter !== 'all' || importFilter !== 'all' || systemFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => { setProviderFilter('all'); setImportFilter('all'); setSystemFilter('all'); }}
                        className="text-xs font-medium text-destructive hover:underline"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="space-y-4">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Provider status</span>
                      <select
                        value={providerFilter}
                        onChange={(e) => setProviderFilter(e.target.value as CandidateProviderStatus | 'all')}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm"
                      >
                        <option value="all">All</option>
                        <option value="pending">Pending scan</option>
                        <option value="found">Found</option>
                        <option value="not_found">Not found</option>
                        <option value="error">Error</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Import status</span>
                      <select
                        value={importFilter}
                        onChange={(e) => setImportFilter(e.target.value as CandidateImportStatus | 'all')}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm"
                      >
                        <option value="all">All</option>
                        <option value="pending">Pending import</option>
                        <option value="imported">Imported</option>
                        <option value="skipped">Skipped</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">System presence</span>
                      <select
                        value={systemFilter}
                        onChange={(e) => setSystemFilter(e.target.value as 'all' | 'new' | 'existing')}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm"
                      >
                        <option value="all">All</option>
                        <option value="new">New (not in system)</option>
                        <option value="existing">Already in system</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>


          {/* Bulk action bar — import + delete */}
          {selected.size > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 dark:border-primary/25 dark:bg-primary/10">
              <span className="text-sm font-semibold text-foreground">{selected.size} selected</span>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {/* Import controls — only shown when at least one selected ticker is importable */}
                {importableSelectedCount > 0 && (
                  <>
                    <select
                      value={bulkTarget}
                      onChange={(e) => setBulkTarget(e.target.value as TargetTable)}
                      className={`${adminSelect} h-9 min-w-0 pr-9`}
                    >
                      {TARGET_TABLES.map((t) => (
                        <option key={t} value={t}>{TARGET_TABLE_LABELS[t]}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={bulkActive}
                        onChange={(e) => setBulkActive(e.target.checked)}
                        className="h-4 w-4 rounded border-border"
                      />
                      Activate immediately
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleBulkImport()}
                      disabled={bulkImporting}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
                    >
                      <DownloadCloud size={14} />
                      {bulkImporting ? 'Importing…' : `Import ${importableSelectedCount}`}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => promptDelete(Array.from(selected))}
                  className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-1.5 text-sm font-semibold text-destructive shadow-sm transition-colors hover:bg-destructive/20"
                >
                  <Trash2 size={14} />
                  Delete {selected.size}
                </button>
              </div>
              <button type="button" onClick={() => setSelected(new Set())} className="text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden min-w-0 overflow-x-auto md:block">
          <table className="w-full min-w-[900px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${adminTh} w-10`}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-border"
                  />
                </th>
                <th className={adminTh}>Ticker</th>
                <th className={adminTh}>Provider Name</th>
                <th className={adminTh}>Type</th>
                <th className={adminTh}>Provider</th>
                <th className={adminTh}>System</th>
                <th className={adminTh}>Notes</th>
                <th className={adminTh}>Import Status</th>
                <th className={adminTh}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && !liveSearch && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="border-b border-border px-4 py-8 text-sm text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {searchBusy && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="border-b border-border px-4 py-8 text-sm text-muted-foreground">
                    Searching…
                  </td>
                </tr>
              )}
              {!searchBusy && !loading && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="border-b border-border px-4 py-8 text-sm text-muted-foreground">
                    {liveSearch ? 'No matches.' : 'No candidates match the current filters.'}
                  </td>
                </tr>
              )}
              {visibleRows.map((row) => {
                const isBusy = importing === row.id;
                const target = rowTarget[row.id] ?? row.import_target_table ?? 'other_stocks';
                const canImport =
                  row.provider_status === 'found' &&
                  !row.is_in_system &&
                  row.import_status === 'pending';
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-border text-sm transition-colors last:border-b-0 hover:bg-muted/30 ${
                      selected.has(row.id) ? 'bg-primary/5 dark:bg-primary/10' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        className="h-4 w-4 rounded border-border"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                          <TickerIcon ticker={row.ticker} size={28} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
                        </div>
                        <span className="font-semibold text-foreground">{row.ticker}</span>
                      </div>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground">{row.provider_name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.provider_type ?? '—'}</td>
                    <td className="px-4 py-3"><ProviderBadge status={row.provider_status} /></td>
                    <td className="px-4 py-3">
                      {row.is_in_system ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:text-amber-100">
                          {row.existing_table ?? 'In system'}
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">New</span>
                      )}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-xs text-muted-foreground" title={row.notes ?? ''}>
                      {row.notes ?? '—'}
                    </td>
                    <td className="px-4 py-3"><ImportBadge status={row.import_status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {canImport ? (
                          <>
                            <select
                              value={target}
                              onChange={(e) => setRowTarget((prev) => ({ ...prev, [row.id]: e.target.value as TargetTable }))}
                              className={`${adminSelect} h-8 min-h-8 max-w-44 px-2 pr-7 text-xs`}
                            >
                              {TARGET_TABLES.map((t) => (
                                <option key={t} value={t}>{TARGET_TABLE_LABELS[t]}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => void handleImport(row)}
                              disabled={isBusy}
                              className="rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
                            >
                              {isBusy ? '…' : 'Import'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSkip(row.id)}
                              className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              Skip
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {row.import_status === 'imported'
                              ? `→ ${row.import_target_table ?? ''}`
                              : row.import_status === 'skipped'
                              ? 'Skipped'
                              : row.is_in_system
                              ? 'In system'
                              : row.provider_status === 'not_found'
                              ? 'Not in provider'
                              : 'Pending scan'}
                          </span>
                        )}
                        {/* Per-row delete — always visible */}
                        <button
                          type="button"
                          onClick={() => promptDelete([row.id])}
                          title="Delete ticker completely"
                          className="ml-auto rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 p-4 md:hidden">
          {searchBusy && visibleRows.length === 0 && (
            <div className="rounded-xl border border-border/80 p-4 text-sm text-muted-foreground">Searching…</div>
          )}
          {!searchBusy && !loading && visibleRows.length === 0 && (
            <div className="rounded-xl border border-border/80 p-4 text-sm text-muted-foreground">
              {liveSearch ? 'No matches.' : 'No candidates match.'}
            </div>
          )}
          {visibleRows.map((row) => {
            const target = rowTarget[row.id] ?? row.import_target_table ?? 'other_stocks';
            const canImport = row.provider_status === 'found' && !row.is_in_system && row.import_status === 'pending';
            return (
              <div key={row.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleSelect(row.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
                    />
                    <div className="flex h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                      <TickerIcon ticker={row.ticker} size={32} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">{row.ticker}</div>
                      <div className="text-xs text-muted-foreground">{row.provider_name ?? '—'}</div>
                    </div>
                  </div>
                  <ImportBadge status={row.import_status} />
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <ProviderBadge status={row.provider_status} />
                  {row.is_in_system && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:text-amber-100">
                      {row.existing_table}
                    </span>
                  )}
                  {row.provider_type && (
                    <span className="text-xs text-muted-foreground">{row.provider_type}</span>
                  )}
                </div>
                {row.notes && <div className="mb-3 text-xs text-muted-foreground">{row.notes}</div>}
                {canImport && (
                  <div className="mb-2 flex items-center gap-2">
                    <select
                      value={target}
                      onChange={(e) => setRowTarget((prev) => ({ ...prev, [row.id]: e.target.value as TargetTable }))}
                      className={`${adminSelect} min-h-0 min-w-0 flex-1 px-2 py-1 pr-7 text-xs`}
                    >
                      {TARGET_TABLES.map((t) => (
                        <option key={t} value={t}>{TARGET_TABLE_LABELS[t]}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleImport(row)}
                      disabled={importing === row.id}
                      className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
                    >
                      {importing === row.id ? '…' : 'Import'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSkip(row.id)}
                      className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      Skip
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => promptDelete([row.id])}
                  className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 size={11} />
                  Delete ticker
                </button>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        <div className="flex flex-col gap-3 border-t border-border px-4 py-4 text-sm md:flex-row md:items-center md:justify-between md:px-6">
          <div className="text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{visibleRows.length}</span> of{' '}
            <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span> results
            {selected.size > 0 && (
              <span className="ml-2 font-semibold text-primary">· {selected.size} selected</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={15} />
              Previous
            </button>
            <span className="text-xs text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      <TickerImportAddCandidatesModal
        open={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        getAccessToken={getAccessToken}
        onAdded={(msg) => {
          setSuccessMsg(msg);
          void loadData();
        }}
      />

      {showQuickAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !quickAdding && setShowQuickAddModal(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Add ticker</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Looks up the symbol, places it, and fetches market data.
            </p>
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleQuickAdd();
              }}
            >
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Symbol</span>
                <input
                  ref={quickInputRef}
                  value={quickTicker}
                  onChange={(e) => setQuickTicker(e.target.value.toUpperCase())}
                  placeholder="e.g. SPCX"
                  maxLength={40}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={quickAdding}
                  autoFocus
                  className={`${adminField} font-medium tracking-wide`}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Table</span>
                <select
                  value={quickAutoRoute ? '__auto__' : quickTarget}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__auto__') setQuickAutoRoute(true);
                    else {
                      setQuickAutoRoute(false);
                      setQuickTarget(v as TargetTable);
                    }
                  }}
                  disabled={quickAdding}
                  className={adminSelect}
                >
                  <option value="__auto__">Auto table</option>
                  {TARGET_TABLES.map((t) => (
                    <option key={t} value={t}>
                      {TARGET_TABLE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <AdminGhostButton
                  type="button"
                  disabled={quickAdding}
                  onClick={() => setShowQuickAddModal(false)}
                >
                  Cancel
                </AdminGhostButton>
                <AdminOutlineButton
                  type="submit"
                  icon={Plus}
                  disabled={quickAdding || !quickTicker.trim()}
                >
                  {quickAdding ? 'Adding…' : 'Add'}
                </AdminOutlineButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !deleting && setDeleteConfirm(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            {/* Icon + title */}
            <div className="mb-4 flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-destructive/15">
                <Trash2 size={22} className="text-destructive" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Delete {deleteConfirm.ids.length === 1 ? 'ticker' : `${deleteConfirm.ids.length} tickers`}?
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>

            {/* Tickers affected */}
            <div className="mb-4 rounded-xl border border-border bg-muted/40 p-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tickers being removed</p>
              <div className="flex flex-wrap gap-1.5">
                {deleteConfirm.affectedTickers.slice(0, 20).map((t) => (
                  <span key={t} className="rounded-full bg-card border border-border px-2 py-0.5 text-xs font-semibold text-foreground">{t}</span>
                ))}
                {deleteConfirm.affectedTickers.length > 20 && (
                  <span className="text-xs text-muted-foreground">+{deleteConfirm.affectedTickers.length - 20} more</span>
                )}
              </div>
            </div>

            {/* Warning */}
            <div className={`mb-4 rounded-xl border p-3 ${deleteConfirm.systemCount > 0 ? 'border-destructive/30 bg-destructive/8' : 'border-amber-500/30 bg-amber-500/8'}`}>
              <div className="flex items-center gap-2">
                <AlertCircle size={15} className={`shrink-0 ${deleteConfirm.systemCount > 0 ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`} />
                <p className={`text-sm ${deleteConfirm.systemCount > 0 ? 'text-destructive' : 'text-amber-800 dark:text-amber-200'}`}>
                  {deleteConfirm.systemCount > 0
                    ? 'These are live tickers — users will immediately lose access to them in the dashboard.'
                    : 'These tickers will be removed from the candidates list.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90 disabled:opacity-60"
              >
                {deleting ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    Delete permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
