'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { MwsTickerPickGrid, type MwsPickerTickerRow } from '../mws-ticker-pick-grid';
import { loadUniversePickerRows } from '@/lib/mws-universe-picker-rows';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludeTickers?: string[];
  /** Called with uppercase tickers (MWS + custom). */
  onConfirm: (tickers: string[]) => void | Promise<void>;
  busy?: boolean;
};

/**
 * Holdings ticker picker — same searchable name+symbol grid as hub Customize → Personalized Tickers.
 */
export function MwsTickerPickerDialog({
  open,
  onOpenChange,
  excludeTickers = [],
  onConfirm,
  busy = false,
}: Props) {
  const [rows, setRows] = useState<MwsPickerTickerRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [customTickers, setCustomTickers] = useState<Set<string>>(() => new Set());
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [customHint, setCustomHint] = useState<string | null>(null);

  const excluded = useMemo(
    () => new Set(excludeTickers.map((t) => t.trim().toUpperCase()).filter(Boolean)),
    [excludeTickers],
  );

  const availableRows = useMemo(
    () => rows.filter((r) => !excluded.has(r.ticker.toUpperCase())),
    [rows, excluded],
  );

  const universeSet = useMemo(
    () => new Set(rows.map((r) => r.ticker.toUpperCase())),
    [rows],
  );

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelected(new Set());
    setCustomTickers(new Set());
    setCustomOpen(false);
    setCustomInput('');
    setCustomHint(null);
    setLoadError(null);

    let cancelled = false;
    setLoading(true);
    void loadUniversePickerRows()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load MWS tickers');
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const toggle = (row: MwsPickerTickerRow) => {
    const t = row.ticker.toUpperCase();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        next.delete(t);
        setCustomTickers((c) => {
          const nc = new Set(c);
          nc.delete(t);
          return nc;
        });
      } else {
        next.add(t);
      }
      return next;
    });
  };

  const addCustom = () => {
    const t = customInput.trim().toUpperCase().replace(/\s+/g, '');
    if (!t) {
      setCustomHint('Enter a symbol.');
      return;
    }
    if (excluded.has(t)) {
      setCustomHint('Already in this portfolio.');
      return;
    }
    if (universeSet.has(t)) {
      setSelected((prev) => new Set(prev).add(t));
      setCustomTickers((c) => {
        const nc = new Set(c);
        nc.delete(t);
        return nc;
      });
      setCustomInput('');
      setCustomHint(null);
      setCustomOpen(false);
      return;
    }
    setSelected((prev) => new Set(prev).add(t));
    setCustomTickers((c) => new Set(c).add(t));
    setCustomInput('');
    setCustomHint(null);
    setCustomOpen(false);
  };

  const selectedList = useMemo(
    () => [...selected].sort((a, b) => a.localeCompare(b)),
    [selected],
  );

  const handleConfirm = async () => {
    if (selected.size === 0) return;
    await onConfirm([...selected]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="!flex h-[min(88dvh,640px)] max-h-[88dvh] w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <DialogHeader className="space-y-1 pr-2 text-left">
            <DialogTitle className="text-lg">Add tickers</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Same picker as Customize — search by name or symbol. Custom symbols won&apos;t have MWS
              tracking.
            </p>
          </DialogHeader>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4">
          {selectedList.length > 0 && (
            <div className="mb-3 flex max-h-20 shrink-0 flex-wrap gap-1.5 overflow-y-auto">
              {selectedList.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    toggle({
                      ticker: t,
                      name: availableRows.find((r) => r.ticker === t)?.name ?? t,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-violet-600/40 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-800 dark:text-violet-200"
                >
                  {t}
                  {customTickers.has(t) && (
                    <span className="text-[10px] font-normal opacity-80">Custom</span>
                  )}
                  <X className="h-3 w-3 opacity-70" />
                </button>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading MWS tickers…</p>
            ) : loadError ? (
              <p className="py-10 text-center text-sm text-destructive">{loadError}</p>
            ) : (
              <MwsTickerPickGrid
                rows={availableRows}
                selectedTickers={selected}
                onToggle={toggle}
                search={search}
                onSearchChange={setSearch}
                disabled={busy}
                hint="Select tickers to add to this portfolio."
              />
            )}
          </div>

          {customOpen ? (
            <div className="mt-3 shrink-0 space-y-2 rounded-lg border border-dashed border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                Outside MWS — no Rating, Outlook, or relative-strength tracking.
              </p>
              <div className="flex gap-2">
                <input
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm uppercase tracking-wide outline-none focus:ring-2 focus:ring-violet-500/25"
                  placeholder="e.g. XYZ"
                  value={customInput}
                  disabled={busy}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addCustom();
                  }}
                />
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={addCustom}>
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setCustomOpen(false);
                    setCustomHint(null);
                    setCustomInput('');
                  }}
                >
                  Cancel
                </Button>
              </div>
              {customHint && <p className="text-xs text-destructive">{customHint}</p>}
            </div>
          ) : (
            <button
              type="button"
              className="mt-3 shrink-0 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setCustomOpen(true)}
            >
              + Add custom symbol
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {selected.size === 0 ? 'None selected' : `${selected.size} selected`}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => void handleConfirm()}
            >
              {busy
                ? 'Adding…'
                : selected.size === 0
                  ? 'Add tickers'
                  : `Add ${selected.size} ticker${selected.size === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
