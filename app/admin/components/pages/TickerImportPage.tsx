'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Search,
  UserPlus,
  XCircle,
  Activity,
  DownloadCloud,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import {
  bulkImportTickerCandidatesAction,
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
import { useAdmin } from '../../_lib/admin-context';
import { supabase } from '@/lib/supabase-client';

type ProgressPayload = {
  type: 'progress';
  mode: 'collect' | 'import';
  phase: string;
  done: number;
  total: number;
  percent: number;
  updated: number;
  failed: number;
  imported: number;
  skipped: number;
  elapsedMs: number;
  recent_failures?: string[];
};

type ApiHealthProgressRow = ApiHealthRow & { progress: ProgressPayload | null };

function parseProgressMessage(raw: string | null): ProgressPayload | null {
  if (!raw) return null;
  const idx = raw.indexOf('__progress__');
  if (idx < 0) return null;
  try {
    const parsed = JSON.parse(raw.slice(idx + '__progress__'.length).trim()) as ProgressPayload;
    if (parsed?.type !== 'progress') return null;
    return parsed;
  } catch {
    return null;
  }
}

const TARGET_TABLE_LABELS: Record<TargetTable, string> = {
  market_segments: 'Market Segments',
  sectors: 'Sectors',
  mega_caps: 'Mega Caps',
  other_stocks: 'Other Stocks',
};
const TARGET_TABLES: TargetTable[] = ['market_segments', 'sectors', 'mega_caps', 'other_stocks'];

const PAGE_SIZE = 100;

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
          className="absolute inset-0 z-10 cursor-not-allowed rounded-lg"
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
      return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"><CheckCircle2 size={11} />Found</span>;
    case 'not_found':
      return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600"><XCircle size={11} />Not found</span>;
    case 'error':
      return <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-600"><AlertCircle size={11} />Error</span>;
    default:
      return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Pending</span>;
  }
}

function ImportBadge({ status }: { status: CandidateImportStatus }) {
  switch (status) {
    case 'imported':
      return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Imported</span>;
    case 'skipped':
      return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500">Skipped</span>;
    default:
      return <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-600">Pending</span>;
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
  const [edgeLiveProgress, setEdgeLiveProgress] = useState<ProgressPayload | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeReadyRef = useRef(false);

  // Filters
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<CandidateProviderStatus | 'all'>('all');
  const [importFilter, setImportFilter] = useState<CandidateImportStatus | 'all'>('all');
  const [systemFilter, setSystemFilter] = useState<'all' | 'new' | 'existing'>('all');
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(search.trim(), 400);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState<TargetTable>('other_stocks');
  const [bulkActive, setBulkActive] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [preferredProvider, setPreferredProvider] = useState<string | null>(null);

  // Row-level import target
  const [rowTarget, setRowTarget] = useState<Record<string, TargetTable>>({});

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

  const applyProgressRows = useCallback((rows: ApiHealthRow[]) => {
    let found: ApiHealthProgressRow | null = null;
    for (const row of rows) {
      const p = parseProgressMessage(row.error_message);
      if (p && p.percent < 100) {
        found = { ...row, progress: p };
        break;
      }
    }
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
            (payload) => {
              const next = payload.new as Partial<ApiHealthRow> | null;
              const progress = parseProgressMessage((next?.error_message as string | null) ?? null);
              if (progress) {
                setEdgeLiveProgress(progress);
                return;
              }
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
          <div key={s.label} className="admin-card min-w-0 rounded-2xl p-5 shadow-sm">
            <div className="admin-text-main text-2xl font-bold">{stats ? s.value : '—'}</div>
            <div className="admin-text-muted mt-1 text-xs">{s.label}</div>
          </div>
        ))}
        {!stats && [1,2,3,4,5,6].map((i) => (
          <div key={i} className="admin-card min-w-0 rounded-2xl p-5 shadow-sm animate-pulse">
            <div className="h-7 w-12 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-20 rounded bg-slate-100" />
          </div>
        ))}
      </div>

      {/* Data actions: Update Tickers + Import Tickers */}
      <div className="admin-card rounded-2xl p-4 shadow-sm md:p-6">
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex-1">
            <h3 className="admin-text-main text-base font-semibold">Data Collection</h3>
            <p className="admin-text-muted mt-1 text-sm">
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
                className="admin-border admin-text-muted inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
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
                className="admin-green-bg inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                <DownloadCloud size={15} className={runningAction === 'import-candidates' ? 'animate-bounce' : ''} />
                {runningAction === 'import-candidates' ? 'Importing…' : 'Import Tickers'}
              </button>
            </HintDisabledWrap>
          </div>
        </div>

        {/* Inline progress — edge jobs from this session, cron, or another admin */}
        {(runningAction || edgeLiveProgress) && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
            {edgeLiveProgress ? (
              <>
                <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-blue-700">
                  <span>
                    {edgeLiveProgress.mode === 'import' ? 'Import in progress (overall queue)' : 'Update in progress'} — phase: {edgeLiveProgress.phase}
                  </span>
                  <span>{edgeLiveProgress.percent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200">
                  <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${Math.max(2, edgeLiveProgress.percent)}%` }} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-4 text-xs text-blue-600">
                  <span>Progress: {edgeLiveProgress.done}/{edgeLiveProgress.total}</span>
                  <span>Updated: {edgeLiveProgress.updated}</span>
                  <span>Imported: {edgeLiveProgress.imported}</span>
                  <span>Failed: {edgeLiveProgress.failed}</span>
                  <span>Elapsed: {Math.round(edgeLiveProgress.elapsedMs / 1000)}s</span>
                </div>
                {Array.isArray(edgeLiveProgress.recent_failures) && edgeLiveProgress.recent_failures.length > 0 ? (
                  <div className="mt-2 rounded-md border border-blue-200 bg-white/70 p-2">
                    <p className="text-xs font-semibold text-blue-900">Recent failures</p>
                    <p className="mt-1 text-xs text-blue-800">
                      {edgeLiveProgress.recent_failures.join(' | ')}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-blue-600">Queued — waiting for progress…</p>
            )}
          </div>
        )}
      </div>

      {/* Feedback messages */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMsg}
          <button onClick={() => setSuccessMsg(null)} className="ml-3 underline text-green-600">Dismiss</button>
        </div>
      )}

      {/* Table card */}
      <div className="admin-card min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl shadow-sm">
        {/* Header / filters */}
        <div className="admin-border border-b px-4 py-4 md:px-6 md:py-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="admin-text-main text-lg font-semibold">Ticker Candidates</h3>
              <p className="admin-text-muted mt-0.5 text-sm">
                {totalCount.toLocaleString()} tickers · page {page + 1} of {totalPages}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <HintDisabledWrap blocked={dataJobBlocking} hint={dataJobBlocking ? (dataJobLockHint ?? 'Please wait.') : null}>
                <button
                  type="button"
                  disabled={dataJobBlocking}
                  onClick={() => setShowAddModal(true)}
                  className="admin-green-bg inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
                  className="admin-border admin-text-muted inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                >
                  <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
                  {scanning ? 'Scanning…' : 'Scan Tickers'}
                </button>
              </HintDisabledWrap>
              <button
                onClick={() => void loadData()}
                className="admin-border admin-text-muted inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <Download size={15} />
                Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto_auto]">
            <div className="relative">
              <Search size={15} className="admin-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ticker…"
                className="admin-border w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value as CandidateProviderStatus | 'all')}
              className="admin-border rounded-lg border px-3 py-2 text-sm"
            >
              <option value="all">All provider status</option>
              <option value="pending">Pending scan</option>
              <option value="found">Found</option>
              <option value="not_found">Not found</option>
              <option value="error">Error</option>
            </select>
            <select
              value={importFilter}
              onChange={(e) => setImportFilter(e.target.value as CandidateImportStatus | 'all')}
              className="admin-border rounded-lg border px-3 py-2 text-sm"
            >
              <option value="all">All import status</option>
              <option value="pending">Pending import</option>
              <option value="imported">Imported</option>
              <option value="skipped">Skipped</option>
            </select>
            <select
              value={systemFilter}
              onChange={(e) => setSystemFilter(e.target.value as 'all' | 'new' | 'existing')}
              className="admin-border rounded-lg border px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="new">New (not in system)</option>
              <option value="existing">Already in system</option>
            </select>
          </div>


          {/* Bulk import controls — shown when rows are selected */}
          {selected.size > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
              <span className="text-sm font-semibold text-blue-700">{selected.size} selected</span>
              <select
                value={bulkTarget}
                onChange={(e) => setBulkTarget(e.target.value as TargetTable)}
                className="admin-border rounded-lg border px-3 py-1.5 text-sm"
              >
                {TARGET_TABLES.map((t) => (
                  <option key={t} value={t}>{TARGET_TABLE_LABELS[t]}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-blue-700">
                <input
                  type="checkbox"
                  checked={bulkActive}
                  onChange={(e) => setBulkActive(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                Activate immediately
              </label>
              <button
                onClick={() => void handleBulkImport()}
                disabled={bulkImporting}
                className="admin-green-bg inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                <DownloadCloud size={14} />
                {bulkImporting ? 'Importing…' : `Import ${selected.size} tickers`}
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="admin-text-muted text-sm underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden min-w-0 overflow-x-auto md:block">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded"
                  />
                </th>
                <th className="px-4 py-3">Ticker</th>
                <th className="px-4 py-3">Provider Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">System</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Import Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-sm admin-text-muted">Loading…</td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-sm admin-text-muted">No candidates match the current filters.</td>
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
                  <tr key={row.id} className="admin-border-soft border-t text-sm hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        className="h-4 w-4 rounded"
                      />
                    </td>
                    <td className="px-4 py-3 font-semibold admin-text-main">{row.ticker}</td>
                    <td className="px-4 py-3 admin-text-muted max-w-[200px] truncate">{row.provider_name ?? '—'}</td>
                    <td className="px-4 py-3 admin-text-muted">{row.provider_type ?? '—'}</td>
                    <td className="px-4 py-3"><ProviderBadge status={row.provider_status} /></td>
                    <td className="px-4 py-3">
                      {row.is_in_system ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          {row.existing_table ?? 'In system'}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">New</span>
                      )}
                    </td>
                    <td className="px-4 py-3 admin-text-muted max-w-[180px] truncate text-xs" title={row.notes ?? ''}>
                      {row.notes ?? '—'}
                    </td>
                    <td className="px-4 py-3"><ImportBadge status={row.import_status} /></td>
                    <td className="px-4 py-3">
                      {canImport ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={target}
                            onChange={(e) => setRowTarget((prev) => ({ ...prev, [row.id]: e.target.value as TargetTable }))}
                            className="admin-border rounded border px-2 py-1 text-xs"
                          >
                            {TARGET_TABLES.map((t) => (
                              <option key={t} value={t}>{TARGET_TABLE_LABELS[t]}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => void handleImport(row)}
                            disabled={isBusy}
                            className="admin-green-bg rounded px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {isBusy ? '…' : 'Import'}
                          </button>
                          <button
                            onClick={() => void handleSkip(row.id)}
                            className="admin-text-muted rounded px-2 py-1 text-xs hover:bg-slate-100"
                          >
                            Skip
                          </button>
                        </div>
                      ) : (
                        <span className="admin-text-muted text-xs">
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
            <div className="admin-border-soft rounded-lg border p-4 text-sm admin-text-muted">No candidates match.</div>
          )}
          {rows.map((row) => {
            const target = rowTarget[row.id] ?? row.import_target_table ?? 'other_stocks';
            const canImport = row.provider_status === 'found' && !row.is_in_system && row.import_status === 'pending';
            return (
              <div key={row.id} className="admin-border-soft rounded-lg border p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleSelect(row.id)}
                      className="mt-0.5 h-4 w-4 rounded"
                    />
                    <div>
                      <div className="admin-text-main text-sm font-semibold">{row.ticker}</div>
                      <div className="admin-text-muted text-xs">{row.provider_name ?? '—'}</div>
                    </div>
                  </div>
                  <ImportBadge status={row.import_status} />
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <ProviderBadge status={row.provider_status} />
                  {row.is_in_system && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      {row.existing_table}
                    </span>
                  )}
                  {row.provider_type && (
                    <span className="admin-text-muted text-xs">{row.provider_type}</span>
                  )}
                </div>
                {row.notes && (
                  <div className="mb-3 text-xs admin-text-muted">{row.notes}</div>
                )}
                {canImport && (
                  <div className="flex items-center gap-2">
                    <select
                      value={target}
                      onChange={(e) => setRowTarget((prev) => ({ ...prev, [row.id]: e.target.value as TargetTable }))}
                      className="admin-border flex-1 rounded border px-2 py-1 text-xs"
                    >
                      {TARGET_TABLES.map((t) => (
                        <option key={t} value={t}>{TARGET_TABLE_LABELS[t]}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => void handleImport(row)}
                      disabled={importing === row.id}
                      className="admin-green-bg rounded px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {importing === row.id ? '…' : 'Import'}
                    </button>
                    <button
                      onClick={() => void handleSkip(row.id)}
                      className="admin-text-muted rounded px-2 py-1 text-xs"
                    >
                      Skip
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        <div className="admin-border flex flex-col gap-3 border-t px-4 py-4 text-sm md:flex-row md:items-center md:justify-between md:px-6">
          <div className="admin-text-muted">
            Showing <span className="admin-text-main font-semibold">{rows.length}</span> of{' '}
            <span className="admin-text-main font-semibold">{totalCount.toLocaleString()}</span> results
            {selected.size > 0 && (
              <span className="ml-2 text-blue-600 font-semibold">· {selected.size} selected</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="admin-border inline-flex items-center gap-1 rounded-lg border px-3 py-2 font-medium disabled:opacity-40 admin-text-muted"
            >
              <ChevronLeft size={15} />
              Previous
            </button>
            <span className="admin-text-muted text-xs">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="admin-green-bg inline-flex items-center gap-1 rounded-lg px-3 py-2 font-semibold text-white disabled:opacity-40"
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
    </div>
  );
}
