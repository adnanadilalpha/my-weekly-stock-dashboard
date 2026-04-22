'use client';

import { ChevronDown, Edit2, Filter, RefreshCw, Search, TrendingUp, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runManualTickerUpdateAction } from '../../_actions/api-settings';
import {
  listTickersAction,
  toggleTickerActiveAction,
  type AdminTickerRow,
  type TickerStats,
  type TickerTable,
} from '../../_actions/tickers';
import { useAdmin } from '../../_lib/admin-context';
import { useDebouncedValue } from '../../_lib/use-debounced-value';

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
  const debouncedQuery = useDebouncedValue(query.trim(), 400);
  const [sectorFilter, setSectorFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!filtersOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = filtersRef.current;
      if (!el) return;
      const target = e.target instanceof Node ? e.target : null;
      if (target && !el.contains(target)) setFiltersOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
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

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <div className="grid min-w-0 grid-cols-2 gap-4 md:gap-6 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="admin-card min-w-0 rounded-2xl p-6 shadow-sm">
            <div className="admin-text-main text-3xl font-bold">{loading && !listStats ? '—' : stat.value}</div>
            <div className="admin-text-muted mt-2 text-sm">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="admin-card min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl shadow-sm">
        {updateFlash && (
          <div className="border-b border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 md:px-6">{updateFlash}</div>
        )}
        <div className="admin-border border-b px-4 py-4 md:px-6 md:py-6">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="admin-text-main text-lg font-semibold">All Tickers</h3>
              <p className="admin-text-muted mt-1 text-sm">Manage tracked stocks and ETF mappings</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedIds.size > 0 && (
                <button
                  onClick={() => void onManualUpdate()}
                  disabled={updateBusy}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <RefreshCw size={16} className={updateBusy ? 'animate-spin' : ''} />
                  {updateBusy ? 'Queuing…' : `Update Selected (${selectedIds.size})`}
                </button>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-3">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="admin-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ticker or company..."
                className="admin-border w-full rounded-lg border py-2 pl-9 pr-4 text-sm"
              />
            </div>
            <div ref={filtersRef} className="relative w-full shrink-0 sm:w-auto">
              <button
                type="button"
                onClick={() => setFiltersOpen((o) => !o)}
                className="admin-border admin-text-muted flex h-[38px] w-full items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium sm:min-w-[9.5rem]"
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
                  className="admin-card absolute left-0 right-0 top-full z-20 mt-1 max-h-[min(70vh,28rem)] min-w-0 overflow-y-auto rounded-xl border p-4 shadow-lg sm:left-auto sm:right-0 sm:w-80 sm:min-w-[20rem]"
                  role="dialog"
                  aria-label="Ticker filters"
                >
                  <div className="space-y-4">
                    <label className="block">
                      <span className="admin-text-main mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Sector
                      </span>
                      <select
                        value={sectorFilter}
                        onChange={(e) => setSectorFilter(e.target.value)}
                        className="admin-border w-full rounded-lg border bg-white px-3 py-2 text-sm"
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
                      <span className="admin-text-main mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </span>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                        className="admin-border w-full rounded-lg border bg-white px-3 py-2 text-sm"
                      >
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="admin-text-main mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Source table
                      </span>
                      <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value as TickerTable | 'all')}
                        className="admin-border w-full rounded-lg border bg-white px-3 py-2 text-sm"
                      >
                        {SOURCE_TABLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="admin-text-main mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        ETF mapping
                      </span>
                      <select
                        value={etfFilter}
                        onChange={(e) => setEtfFilter(e.target.value as 'all' | 'mapped' | 'unmapped')}
                        className="admin-border w-full rounded-lg border bg-white px-3 py-2 text-sm"
                      >
                        <option value="all">All ETF Mapping</option>
                        <option value="mapped">Mapped to ETF</option>
                        <option value="unmapped">No ETF mapping</option>
                      </select>
                    </label>
                    <div>
                      <span className="admin-text-main mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Sort by updated
                      </span>
                      <button
                        type="button"
                        onClick={() => setUpdatedSort((prev) => (prev === 'latest' ? 'oldest' : 'latest'))}
                        className="admin-border admin-text-muted w-full rounded-lg border bg-white px-3 py-2 text-left text-sm font-medium"
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
                      className="admin-border admin-text-muted w-full rounded-lg border bg-white px-3 py-2 text-sm font-medium"
                    >
                      Clear all filters
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {error && <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:px-6">{error}</div>}

        <div className="hidden min-w-0 overflow-x-auto md:block">
          <table className="w-full min-w-[1050px]">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={filteredSorted.length > 0 && filteredSorted.every((t) => selectedIds.has(t.id))}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(new Set(filteredSorted.map((t) => t.id)));
                      else setSelectedIds(new Set());
                    }}
                  />
                </th>
                <th className="px-6 py-3">Ticker</th>
                <th className="px-6 py-3">Company</th>
                <th className="px-6 py-3">Sector</th>
                <th className="px-6 py-3">Price</th>
                <th className="px-6 py-3">Volume</th>
                <th className="px-6 py-3">ETF Mapping</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="admin-border-soft border-t text-sm">
                  <td className="px-6 py-8 admin-text-muted" colSpan={8}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filteredSorted.length === 0 && (
                <tr className="admin-border-soft border-t text-sm">
                  <td className="px-6 py-8 admin-text-muted" colSpan={8}>
                    No tickers match.
                  </td>
                </tr>
              )}
              {filteredSorted.map((item) => (
                <tr key={item.id} className={`admin-border-soft border-t text-sm ${selectedIds.has(item.id) ? 'bg-blue-50' : ''}`}>
                  <td className="w-10 px-4 py-4">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                    />
                  </td>
                  <td className="admin-text-main px-6 py-4 font-semibold">{item.ticker}</td>
                  <td className="px-6 py-4">
                    <div className="admin-text-main font-medium">{item.company}</div>
                    <div className="admin-text-muted text-xs">Updated {formatLastUpdated(item.last_updated)}</div>
                  </td>
                  <td className="admin-text-muted px-6 py-4">{item.sector}</td>
                  <td className="px-6 py-4">
                    <div className="admin-text-main font-semibold">{formatMoney(item.price)}</div>
                    <div className={`text-xs font-semibold ${formatPct(item.change_pct).startsWith('+') ? 'text-green-700' : 'text-red-600'}`}>
                      {formatPct(item.change_pct)}
                    </div>
                  </td>
                  <td className="admin-text-muted px-6 py-4">{formatVolume(item.volume)}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {item.etf_mapping.map((etf) => (
                        <span key={`${item.ticker}-${etf}`} className="rounded bg-green-700/10 px-2 py-1 text-xs font-semibold text-green-700">
                          {etf}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => void onToggle(item)}
                      disabled={busyId === item.id}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        item.active ? 'bg-green-700/15 text-green-700' : 'bg-gray-500/15 text-gray-500'
                      } disabled:opacity-60`}
                    >
                      {item.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="admin-text-muted flex items-center gap-2">
                      <button className="rounded p-2 hover:bg-slate-100" title="View trends"><TrendingUp size={15} /></button>
                      <button className="rounded p-2 hover:bg-slate-100" title="Edit ticker"><Edit2 size={15} /></button>
                      <button className="rounded p-2 text-red-600 hover:bg-red-50" title="Delete ticker"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4 p-4 md:hidden">
          {!loading && filteredSorted.length === 0 && (
            <div className="admin-border-soft rounded-lg border p-4 text-sm admin-text-muted">No tickers match.</div>
          )}
          {filteredSorted.map((item) => (
            <div key={item.id} className="admin-border-soft rounded-lg border p-4">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <div className="admin-text-main text-sm font-semibold">{item.ticker} - {item.company}</div>
                  <div className="admin-text-muted text-xs">{item.sector} · Vol {formatVolume(item.volume)}</div>
                </div>
                <span className={`text-xs font-semibold ${formatPct(item.change_pct).startsWith('+') ? 'text-green-700' : 'text-red-600'}`}>
                  {formatPct(item.change_pct)}
                </span>
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {item.etf_mapping.map((etf) => (
                  <span key={`${item.ticker}-${etf}-mobile`} className="rounded bg-green-700/10 px-2 py-1 text-xs font-semibold text-green-700">
                    {etf}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => void onToggle(item)}
                  disabled={busyId === item.id}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    item.active ? 'bg-green-700/15 text-green-700' : 'bg-gray-500/15 text-gray-500'
                  } disabled:opacity-60`}
                >
                  {item.active ? 'Active' : 'Inactive'}
                </button>
                <div className="admin-text-muted flex items-center gap-2">
                  <button className="rounded p-2 hover:bg-slate-100"><TrendingUp size={14} /></button>
                  <button className="rounded p-2 hover:bg-slate-100"><Edit2 size={14} /></button>
                  <button className="rounded p-2 text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="admin-border flex flex-col gap-3 border-t px-4 py-4 text-sm md:flex-row md:items-center md:justify-between md:px-6">
          <div className="admin-text-muted">
            {listMode === 'preview' ? (
              <span>
                Preview: <span className="admin-text-main font-semibold">{filteredSorted.length}</span> symbols (cap
                across tables). Choose a source for full paginated lists.
              </span>
            ) : (
              <span>
                Page <span className="admin-text-main font-semibold">{page + 1}</span> of{' '}
                <span className="admin-text-main font-semibold">{totalPages}</span> · Showing{' '}
                <span className="admin-text-main font-semibold">{filteredSorted.length}</span> loaded ·{' '}
                <span className="admin-text-main font-semibold">{totalCount.toLocaleString()}</span> in this source
                {sectorFilter !== 'all' || etfFilter !== 'all' ? ' (filters apply to this page)' : ''}
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={!canPrev || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="admin-border admin-text-muted rounded-lg border px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!canNext || loading}
              onClick={() => setPage((p) => p + 1)}
              className="admin-green-bg rounded-lg px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

