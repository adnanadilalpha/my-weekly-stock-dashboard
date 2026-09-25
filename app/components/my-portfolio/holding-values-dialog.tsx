'use client';

import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import type { HoldingPerformancePatch, UserPortfolioHolding } from '@/lib/queries/user-portfolio';

type DraftRow = {
  id: string;
  ticker: string;
  start_date: string;
  cash_invested: string;
};

function toDraft(h: UserPortfolioHolding): DraftRow {
  return {
    id: h.id,
    ticker: h.ticker,
    start_date: h.start_date ? String(h.start_date).slice(0, 10) : '',
    cash_invested: h.cash_invested == null ? '' : String(h.cash_invested),
  };
}

function parseOptionalNumber(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function draftToPatch(d: DraftRow): { id: string } & HoldingPerformancePatch {
  return {
    id: d.id,
    start_date: d.start_date.trim() || null,
    cash_invested: parseOptionalNumber(d.cash_invested),
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holdings: UserPortfolioHolding[];
  onSave: (rows: Array<{ id: string } & HoldingPerformancePatch>) => void | Promise<void>;
  busy?: boolean;
  title?: string;
  description?: string;
};

export function HoldingValuesDialog({
  open,
  onOpenChange,
  holdings,
  onSave,
  busy = false,
  title = 'Add values',
  description = 'Enter Start date and Cash Invested. Since-start return is calculated from MWS prices when the ticker is covered — Hit Rate and similar stats are not tracked here.',
}: Props) {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setDrafts(holdings.map(toDraft));
  }, [open, holdings]);

  const setField = (id: string, key: keyof DraftRow, value: string) => {
    setDrafts((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickers to edit.</p>
          ) : (
            <div className="space-y-4">
              {drafts.map((d) => (
                <div key={d.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-3 font-mono text-sm font-semibold text-foreground">{d.ticker}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Start
                      </span>
                      <input
                        type="date"
                        className="h-9 w-full rounded-lg border border-border bg-background px-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                        value={d.start_date}
                        disabled={busy}
                        onChange={(e) => setField(d.id, 'start_date', e.target.value)}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Cash Invested
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="h-9 w-full rounded-lg border border-border bg-background px-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                        placeholder="10000"
                        value={d.cash_invested}
                        disabled={busy}
                        onChange={(e) => setField(d.id, 'cash_invested', e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-5 py-3">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Skip for now
          </Button>
          <Button
            type="button"
            disabled={busy || drafts.length === 0}
            onClick={() => void onSave(drafts.map(draftToPatch))}
          >
            {busy ? 'Saving…' : 'Save values'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
