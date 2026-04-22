'use client';

import { FileSpreadsheet, Loader2, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { getAdminApiConfigAction } from '../../_actions/api-settings';
import {
  addTickerCandidatesAction,
  searchProviderSymbolsAction,
  type AddCandidateInput,
  type ProviderSymbolHit,
} from '../../_actions/ticker-import';
import { useDebouncedValue } from '../../_lib/use-debounced-value';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after a successful add (parent should refresh list). */
  onAdded: (summary: string) => void;
  getAccessToken: () => Promise<string | null>;
};

type Tab = 'search' | 'upload';

function findTickerColumnKey(sampleRow: Record<string, unknown>): string | undefined {
  for (const k of Object.keys(sampleRow)) {
    if (String(k).trim().toLowerCase() === 'ticker') return k;
  }
  return Object.keys(sampleRow)[0];
}

export default function TickerImportAddCandidatesModal({ open, onClose, onAdded, getAccessToken }: Props) {
  const [tab, setTab] = useState<Tab>('search');
  const [providerLabel, setProviderLabel] = useState<string>('');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), 320);
  const [hits, setHits] = useState<ProviderSymbolHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quickTicker, setQuickTicker] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [sheetRows, setSheetRows] = useState<AddCandidateInput[]>([]);
  const [sheetName, setSheetName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await getAdminApiConfigAction(token);
        if (cancelled || !res.ok) return;
        setProviderLabel(res.data.preferred_provider?.trim() || 'finnhub');
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, getAccessToken]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHits([]);
      setSelected(new Set());
      setQuickTicker('');
      setSheetRows([]);
      setSheetName(null);
      setLocalError(null);
      setSearchError(null);
      setTab('search');
    }
  }, [open]);

  useEffect(() => {
    if (!open || tab !== 'search') return;
    if (debouncedQuery.length < 1) {
      setHits([]);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token || cancelled) return;
        const res = await searchProviderSymbolsAction(token, { q: debouncedQuery, limit: 30 });
        if (cancelled) return;
        if (!res.ok) {
          setHits([]);
          setSearchError(res.error);
          return;
        }
        setHits(res.data.hits);
      } catch (e) {
        if (!cancelled) setSearchError(e instanceof Error ? e.message : 'Search failed.');
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tab, debouncedQuery, getAccessToken]);

  const toggleHit = (sym: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  };

  const submitRows = useCallback(
    async (rows: AddCandidateInput[]) => {
      setLocalError(null);
      if (rows.length === 0) {
        setLocalError('Select or enter at least one ticker.');
        return;
      }
      setBusy(true);
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await addTickerCandidatesAction(token, { rows });
        if (!res.ok) {
          setLocalError(res.error);
          return;
        }
        const { added, skipped } = res.data;
        onAdded(`Added ${added} ticker${added === 1 ? '' : 's'}${skipped ? ` (${skipped} already in queue)` : ''}. Run Scan to validate with the provider.`);
        onClose();
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : 'Failed to add.');
      } finally {
        setBusy(false);
      }
    },
    [getAccessToken, onAdded, onClose]
  );

  const addFromSearch = () => {
    const rows: AddCandidateInput[] = [];
    for (const sym of selected) {
      const hit = hits.find((h) => h.symbol === sym);
      rows.push({
        ticker: sym,
        provider_name: hit?.description ?? null,
      });
    }
    void submitRows(rows);
  };

  const addQuickOne = () => {
    const t = quickTicker.trim().toUpperCase();
    if (!t) return;
    void submitRows([{ ticker: t }]);
  };

  const parseXlsx = async (file: File) => {
    setLocalError(null);
    setSheetRows([]);
    setSheetName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sn = wb.SheetNames[0];
      if (!sn) {
        setLocalError('No sheet in workbook.');
        return;
      }
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sn], { defval: '' });
      if (json.length === 0) {
        setLocalError('Sheet is empty.');
        return;
      }
      const key = findTickerColumnKey(json[0]!);
      if (!key) {
        setLocalError('Could not find a ticker column.');
        return;
      }
      const rows: AddCandidateInput[] = [];
      const seen = new Set<string>();
      for (const row of json) {
        const raw = String(row[key] ?? '').trim().toUpperCase();
        if (!raw || seen.has(raw)) continue;
        seen.add(raw);
        rows.push({ ticker: raw });
        if (rows.length >= 1000) break;
      }
      if (rows.length === 0) {
        setLocalError('No valid tickers in file.');
        return;
      }
      setSheetRows(rows);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not read file.');
    }
  };

  const downloadSample = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['ticker'],
      ['EXAMPLE'],
      ['DEMO'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Tickers');
    XLSX.writeFile(wb, 'ticker-import-sample.xlsx');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="admin-card flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-xl">
        <div className="admin-border flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div>
            <h4 className="admin-text-main text-lg font-semibold">Add tickers</h4>
            <p className="admin-text-muted mt-0.5 text-xs">
              Search uses preferred provider: <span className="admin-text-main font-semibold">{providerLabel || '…'}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-40"
            aria-label="Close"
          >
            <X size={18} className="admin-text-muted" />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-100 px-5 pt-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setTab('search')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${
                tab === 'search' ? 'bg-white text-slate-900 shadow-sm' : 'admin-text-muted'
              }`}
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setTab('upload')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${
                tab === 'upload' ? 'bg-white text-slate-900 shadow-sm' : 'admin-text-muted'
              }`}
            >
              Spreadsheet
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === 'search' && (
            <div className="space-y-4">
              <div className="relative">
                <Search size={16} className="admin-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search symbol or company…"
                  className="admin-border w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm"
                  autoFocus
                />
              </div>
              {searching && (
                <div className="flex items-center gap-2 text-sm admin-text-muted">
                  <Loader2 size={16} className="animate-spin" />
                  Searching…
                </div>
              )}
              {searchError && !searching && <p className="text-sm text-red-600">{searchError}</p>}
              {!searching && hits.length > 0 && (
                <ul className="admin-border max-h-56 divide-y overflow-auto rounded-lg border">
                  {hits.map((h) => (
                    <li key={h.symbol}>
                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selected.has(h.symbol)}
                          onChange={() => toggleHit(h.symbol)}
                          className="mt-1 h-4 w-4 shrink-0 rounded"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-mono font-semibold admin-text-main">{h.symbol}</span>
                          {h.description && (
                            <span className="admin-text-muted mt-0.5 block truncate text-xs">{h.description}</span>
                          )}
                          {(h.type || h.exchange) && (
                            <span className="admin-text-muted mt-0.5 block text-[11px]">
                              {[h.type, h.exchange].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {!searching && debouncedQuery.length >= 1 && hits.length === 0 && !searchError && (
                <p className="text-sm admin-text-muted">No matches. Try another query.</p>
              )}

              <div className="admin-border rounded-lg border border-dashed px-3 py-3">
                <p className="admin-text-muted mb-2 text-xs font-medium uppercase tracking-wide">Quick add</p>
                <div className="flex gap-2">
                  <input
                    value={quickTicker}
                    onChange={(e) => setQuickTicker(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addQuickOne();
                      }
                    }}
                    placeholder="TICKER"
                    className="admin-border min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy || !quickTicker.trim()}
                    onClick={() => addQuickOne()}
                    className="admin-green-bg shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Add one
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'upload' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={downloadSample}
                  className="admin-border admin-text-muted inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
                >
                  <FileSpreadsheet size={16} />
                  Sample .xlsx
                </button>
                <span className="admin-text-muted text-xs">First sheet: column <code className="rounded bg-slate-100 px-1">ticker</code> (or first column).</span>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="admin-border block w-full cursor-pointer rounded-lg border border-dashed px-3 py-3 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void parseXlsx(f);
                }}
              />
              {sheetRows.length > 0 && (
                <p className="text-sm admin-text-main">
                  <span className="font-semibold">{sheetRows.length}</span> tickers from{' '}
                  <span className="font-medium">{sheetName}</span>
                </p>
              )}
            </div>
          )}

          {localError && <p className="mt-3 text-sm text-red-600">{localError}</p>}
        </div>

        <div className="admin-border flex shrink-0 flex-wrap justify-end gap-2 border-t px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="admin-border admin-text-muted rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          {tab === 'search' ? (
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => addFromSearch()}
              className="admin-green-bg inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus size={16} />
              {busy ? 'Adding…' : `Add selected (${selected.size})`}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || sheetRows.length === 0}
              onClick={() => void submitRows(sheetRows)}
              className="admin-green-bg inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus size={16} />
              {busy ? 'Adding…' : `Add ${sheetRows.length} tickers`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
