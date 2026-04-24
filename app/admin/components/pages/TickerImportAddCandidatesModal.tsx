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
import { TickerIcon } from '@/app/components/ui/ticker-icon';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after a successful add (parent should refresh list). */
  onAdded: (summary: string) => void;
  getAccessToken: () => Promise<string | null>;
};

type Tab = 'search' | 'upload';

const SELECT_FIELD =
  'border border-input bg-input-background text-foreground shadow-sm outline-none ring-offset-background transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30 dark:scheme-dark';

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
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
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
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h4 className="text-lg font-semibold tracking-tight text-foreground">Add tickers</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Search uses preferred provider: <span className="font-semibold text-foreground">{providerLabel || '…'}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="shrink-0 border-b border-border px-5 pt-3">
          <div className="flex gap-1 rounded-lg bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => setTab('search')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                tab === 'search' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setTab('upload')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                tab === 'upload' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
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
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search symbol or company…"
                  className="h-10 w-full rounded-lg border border-input bg-input-background py-2.5 pl-10 pr-3 text-sm text-foreground shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
                  autoFocus
                />
              </div>
              {searching && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  Searching…
                </div>
              )}
              {searchError && !searching && <p className="text-sm text-destructive">{searchError}</p>}
              {!searching && hits.length > 0 && (
                <ul className="max-h-56 divide-y divide-border overflow-auto rounded-lg border border-border">
                  {hits.map((h) => (
                    <li key={h.symbol}>
                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50">
                        <input
                          type="checkbox"
                          checked={selected.has(h.symbol)}
                          onChange={() => toggleHit(h.symbol)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-border"
                        />
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                          <TickerIcon ticker={h.symbol} size={28} className="h-full w-full max-h-full max-w-full rounded-none border-0 object-cover" />
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="font-mono font-semibold text-foreground">{h.symbol}</span>
                          {h.description && (
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{h.description}</span>
                          )}
                          {(h.type || h.exchange) && (
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">No matches. Try another query.</p>
              )}

              <div className="rounded-lg border border-dashed border-border px-3 py-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Quick add</p>
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
                    className="min-h-0 min-w-0 flex-1 rounded-lg border border-input bg-input-background px-3 py-2 font-mono text-sm text-foreground shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
                  />
                  <button
                    type="button"
                    disabled={busy || !quickTicker.trim()}
                    onClick={() => addQuickOne()}
                    className="shrink-0 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground shadow-sm transition-colors hover:bg-secondary/80 disabled:opacity-50"
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
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
                >
                  <FileSpreadsheet size={16} />
                  Sample .xlsx
                </button>
                <span className="text-xs text-muted-foreground">
                  First sheet: column <code className="rounded bg-muted px-1 font-mono text-foreground">ticker</code> (or first column).
                </span>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="block w-full cursor-pointer rounded-lg border border-dashed border-input bg-input-background px-3 py-3 text-sm text-foreground transition-[color,box-shadow] file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground dark:bg-input/30"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void parseXlsx(f);
                }}
              />
              {sheetRows.length > 0 && (
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{sheetRows.length}</span> tickers from{' '}
                  <span className="font-medium">{sheetName}</span>
                </p>
              )}
            </div>
          )}

          {localError && <p className="mt-3 text-sm text-destructive">{localError}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
          >
            Cancel
          </button>
          {tab === 'search' ? (
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => addFromSearch()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus size={16} />
              {busy ? 'Adding…' : `Add selected (${selected.size})`}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || sheetRows.length === 0}
              onClick={() => void submitRows(sheetRows)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
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
