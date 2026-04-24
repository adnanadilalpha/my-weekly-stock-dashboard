'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  XCircle,
  Activity,
  DownloadCloud,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import {
  bulkImportTickerCandidatesAction,
  deleteTickerCandidatesAction,
  getTickerCandidateStatsAction,
  importTickerCandidateAction,
  listTickerCandidatesAction,
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

/** Accent under each KPI — aligned to meaning (not arbitrary rotation). */
const STAT_ACCENT_BY_LABEL: Record<string, string> = {
  'Total Tickers': 'bg-sky-500/85',
  'Found by Provider': 'bg-emerald-500/85',
  'Not Found': 'bg-rose-500/85',
  'Already in System': 'bg-amber-500/85',
  'Ready to Import': 'bg-violet-500/85',
  'Imported': 'bg-teal-500/85',
};

/** Same field surface as shadcn `Input` — fixes native selects staying light in `.dark`. */
const SELECT_FIELD =
  'border border-input bg-input-background text-foreground shadow-sm outline-none ring-offset-background transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30 dark:scheme-dark';

/** Native `title` on disabled buttons often does not show; overlay captures hover. */
function HintDisabledWrap({
  blocked,
  hint,
  children,
}: {
  blocked: boolean;
  hint: string | null | undefined;
  children: ReactElement;
}) {
  const hintStr = (hint ?? '').trim() || null;
  const showOverlay = Boolean(blocked && hintStr);
  const titleAttr = hintStr ?? undefined;
  return (
    <span className={showOverlay ? 'relative inline-flex [&>button]:pointer-events-none' : 'inline-flex'}>
      {children}
      {showOverlay && titleAttr ? (
        <span
          className="absolute inset-0 z-10 cursor-not-allowed rounded-md"
          title={titleAttr}
          role="presentation"
          aria-hidden
        />
      ) : null}
    </span>
  );
}

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

export default function TickerImportPage() {
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
  const debouncedSearch = useDebouncedValue(search.trim(), 250);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState<TargetTable>('other_stocks');
  const [bulkActive, setBulkActive] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [preferredProvider, setPreferredProvider] = useState<string | null>(null);

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

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const inSystem = systemFilter === 'all' ? 'all' : systemFilter === 'existing';
      const [listRes, statsRes, cfgRes] = await Promise.all([
        listTickerCandidatesAction(token, {
          provider_status: providerFilter,
          import_status: importFilter,
          in_system: inSystem,
          search: debouncedSearch || undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        }),
        getTickerCandidateStatsAction(token),
        getAdminApiConfigAction(token),
      ]);
      if (!listRes.ok) { setError(listRes.error); return; }
      if (!statsRes.ok) { setError(statsRes.error); return; }
      if (cfgRes.ok) {
        setPreferredProvider(cfgRes.data.preferred_provider?.trim().toLowerCase() ?? 'finnhub');
      }
      setRows(listRes.data.rows);
      setTotalCount(listRes.data.total_count);
      setStats(statsRes.data);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
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

  const dataJobLockHint = useMemo(() => {
    if (scanning) {
      return 'A candidate scan is running. Wait for it to finish before starting update, import, or another scan.';
    }
    if (edgeLiveProgress && edgeLiveProgress.percent < 100) {
      return edgeLiveProgress.mode === 'import'
        ? 'Ticker import is already running (this page, another admin, or a queued batch). Wait until it finishes.'
        : 'Ticker data collection is already running — including the hourly schedule, another admin, or a job you started. Wait until it finishes to avoid overlapping runs.';
    }
    if (runningAction) {
      return 'A data job is starting or finishing. Please wait.';
    }
    return null;
  }, [scanning, edgeLiveProgress, runningAction]);

  // Realtime stream first, polling fallback second.
  useEffect(() => {
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
              void fetchLatestProgress();
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
    }, 2500);
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
  }, [fetchLatestProgress, getAccessToken]);

  useLiveAdminRefresh({
    channelName: 'admin-ticker-import-live',
    getAccessToken,
    refresh: loadData,
    pollingMs: 30_000,
    throttleMs: 4_000,
    realtime: [
      { schema: 'public', table: 'ticker_import_candidates' },
      { schema: 'public', table: 'admin_api_config' },
    ],
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

  const scanLockHint = useMemo(() => {
    if (preferredProvider === 'yahoo') {
      return 'Yahoo Finance does not support scan. Change the preferred provider in API Settings.';
    }
    return dataJobLockHint;
  }, [preferredProvider, dataJobLockHint]);

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

  const allPageSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selected.has(r.id)),
    [rows, selected]
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
        rows.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        rows.forEach((r) => next.add(r.id));
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

  const statCards = stats
    ? [
        { label: 'Total Tickers', value: stats.total },
        { label: 'Found by Provider', value: stats.found },
        { label: 'Not Found', value: stats.not_found },
        { label: 'Already in System', value: stats.in_system },
        { label: 'Ready to Import', value: stats.ready_to_import },
        { label: 'Imported', value: stats.imported },
      ]
    : [];

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      {/* Stats */}
      <div className="grid min-w-0 grid-cols-2 gap-4 md:gap-6 lg:grid-cols-6">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
          >
            <div className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{stats ? s.value : '—'}</div>
            <div className="mt-2 text-xs font-medium text-muted-foreground sm:text-sm">{s.label}</div>
            <div
              className={`mt-2 h-1 w-10 rounded-full ${STAT_ACCENT_BY_LABEL[s.label] ?? 'bg-muted-foreground/35'}`}
              aria-hidden
            />
          </div>
        ))}
        {!stats &&
          [1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm animate-pulse sm:p-6"
            >
              <div className="h-7 w-12 rounded bg-muted" />
              <div className="mt-2 h-3 w-20 rounded bg-muted/70" />
            </div>
          ))}
      </div>

      {/* Data actions: Update Tickers + Import Tickers */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex-1">
            <h3 className="text-base font-semibold tracking-tight text-foreground">Data Collection</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              <strong>Update Tickers</strong> — refreshes all existing tickers in the 4 system tables, 40 per batch, self-chains until all are updated.<br />
              <strong>Import Tickers</strong> — fetches full market data for candidates marked "Found" with a target table assigned, 12 per batch, self-chains until all imported.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <HintDisabledWrap blocked={dataJobBlocking} hint={dataJobBlocking ? (dataJobLockHint ?? 'Please wait.') : null}>
              <button
                type="button"
                disabled={dataJobBlocking}
                onClick={() => void handleUpdateTickers()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                <Activity size={15} className={runningAction === 'update' ? 'animate-pulse' : ''} />
                {runningAction === 'update' ? 'Updating…' : 'Update Tickers'}
              </button>
            </HintDisabledWrap>
            <HintDisabledWrap blocked={dataJobBlocking} hint={dataJobBlocking ? (dataJobLockHint ?? 'Please wait.') : null}>
              <button
                type="button"
                disabled={dataJobBlocking}
                onClick={() => void handleImportCandidates()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                <DownloadCloud size={15} className={runningAction === 'import-candidates' ? 'animate-bounce' : ''} />
                {runningAction === 'import-candidates' ? 'Importing…' : 'Import Tickers'}
              </button>
            </HintDisabledWrap>
          </div>
        </div>

        {/* Inline progress — edge jobs from this session, cron, or another admin */}
        {(runningAction || edgeLiveProgress) && (
          <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 dark:border-primary/25 dark:bg-primary/10">
            {edgeLiveProgress ? (
              <>
                <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-foreground">
                  <span>
                    {edgeLiveProgress.mode === 'import' ? 'Import in progress (overall queue)' : 'Update in progress'} — phase: {edgeLiveProgress.phase}
                  </span>
                  <span>{edgeLiveProgress.percent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.max(2, edgeLiveProgress.percent)}%` }}
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>Progress: {edgeLiveProgress.done}/{edgeLiveProgress.total}</span>
                  <span>Updated: {edgeLiveProgress.updated ?? 0}</span>
                  <span>Imported: {edgeLiveProgress.imported ?? 0}</span>
                  <span>Failed: {edgeLiveProgress.failed ?? 0}</span>
                  <span>Elapsed: {Math.round((edgeLiveProgress.elapsedMs ?? 0) / 1000)}s</span>
                </div>
                {Array.isArray(edgeLiveProgress.recent_failures) && edgeLiveProgress.recent_failures.length > 0 ? (
                  <div className="mt-2 rounded-md border border-border bg-card/80 p-2 backdrop-blur-sm">
                    <p className="text-xs font-semibold text-foreground">Recent failures</p>
                    <p className="mt-1 text-xs text-muted-foreground">{edgeLiveProgress.recent_failures.join(' | ')}</p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Queued — waiting for progress…</p>
            )}
          </div>
        )}
      </div>

      {/* Feedback messages */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-100">
          {successMsg}
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="ml-3 font-medium text-emerald-800 underline underline-offset-2 hover:text-emerald-950 dark:text-emerald-200 dark:hover:text-emerald-50"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Table card */}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Header / filters */}
        <div className="border-b border-border bg-muted/40 px-4 py-4 md:px-6 md:py-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-foreground">Ticker Candidates</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {totalCount.toLocaleString()} tickers · page {page + 1} of {totalPages}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <HintDisabledWrap blocked={dataJobBlocking} hint={dataJobBlocking ? (dataJobLockHint ?? 'Please wait.') : null}>
                <button
                  type="button"
                  disabled={dataJobBlocking}
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground shadow-sm transition-colors hover:bg-secondary/80 disabled:opacity-50"
                >
                  <UserPlus size={15} />
                  Add tickers
                </button>
              </HintDisabledWrap>
              <HintDisabledWrap
                blocked={dataJobBlocking || preferredProvider === 'yahoo'}
                hint={
                  dataJobBlocking || preferredProvider === 'yahoo'
                    ? (scanLockHint ?? 'Scan unavailable.')
                    : null
                }
              >
                <button
                  type="button"
                  disabled={dataJobBlocking || preferredProvider === 'yahoo'}
                  onClick={() => void handleScan()}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
                >
                  <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
                  {scanning ? 'Scanning…' : 'Scan Tickers'}
                </button>
              </HintDisabledWrap>
              <button
                type="button"
                onClick={() => void loadData()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
              >
                <Download size={15} />
                Refresh
              </button>
            </div>
          </div>

          {/* Search + Filters button row */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative w-full max-w-xs">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ticker…"
                className="h-10 w-full rounded-lg border border-input bg-input-background py-2 pl-9 pr-3 text-sm text-foreground shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </div>

            {/* Filters button — same floating overlay pattern as TickerManagement */}
            <div ref={filtersWrapRef} className="relative shrink-0">
              <button
                ref={filtersBtnRef}
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                aria-haspopup="true"
                className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium shadow-sm transition-colors ${
                  filtersOpen || providerFilter !== 'all' || importFilter !== 'all' || systemFilter !== 'all'
                    ? 'border-primary/50 bg-primary/5 text-primary dark:border-primary/40 dark:bg-primary/10'
                    : 'border-border bg-card text-foreground hover:bg-muted/50'
                }`}
              >
                <Filter size={14} />
                Filters
                {(providerFilter !== 'all' || importFilter !== 'all' || systemFilter !== 'all') && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {[providerFilter !== 'all', importFilter !== 'all', systemFilter !== 'all'].filter(Boolean).length}
                  </span>
                )}
              </button>

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
                      className={`h-9 min-w-0 rounded-lg px-3 pr-9 text-sm ${SELECT_FIELD}`}
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
              <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <th className="w-10 border-b border-border bg-muted/50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-border"
                  />
                </th>
                <th className="border-b border-border bg-muted/50 px-4 py-3">Ticker</th>
                <th className="border-b border-border bg-muted/50 px-4 py-3">Provider Name</th>
                <th className="border-b border-border bg-muted/50 px-4 py-3">Type</th>
                <th className="border-b border-border bg-muted/50 px-4 py-3">Provider</th>
                <th className="border-b border-border bg-muted/50 px-4 py-3">System</th>
                <th className="border-b border-border bg-muted/50 px-4 py-3">Notes</th>
                <th className="border-b border-border bg-muted/50 px-4 py-3">Import Status</th>
                <th className="border-b border-border bg-muted/50 px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="border-b border-border px-4 py-8 text-sm text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="border-b border-border px-4 py-8 text-sm text-muted-foreground">
                    No candidates match the current filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => {
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
                              className={`h-8 min-h-8 max-w-[11rem] rounded-lg px-2 pr-7 text-xs ${SELECT_FIELD}`}
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
          {!loading && rows.length === 0 && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">No candidates match.</div>
          )}
          {rows.map((row) => {
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
                      className={`min-h-0 min-w-0 flex-1 rounded-lg px-2 py-1 pr-7 text-xs ${SELECT_FIELD}`}
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
            Showing <span className="font-semibold text-foreground">{rows.length}</span> of{' '}
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
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        getAccessToken={getAccessToken}
        onAdded={(msg) => {
          setSuccessMsg(msg);
          void loadData();
        }}
      />

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
