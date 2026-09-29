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
import {
  deriveCashInvested,
  type HoldingPerformancePatch,
  type UserPortfolioHolding,
} from '@/lib/queries/user-portfolio';

type DraftRow = {
  id: string;
  ticker: string;
  start_date: string;
  shares: string;
  avg_entry: string;
};

function toDraft(h: UserPortfolioHolding): DraftRow {
  return {
    id: h.id,
    ticker: h.ticker,
    start_date: h.start_date ? String(h.start_date).slice(0, 10) : '',
    shares: h.shares == null ? '' : String(h.shares),
    avg_entry: h.cost_basis == null ? '' : String(h.cost_basis),
  };
}

function parseOptionalNumber(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function draftToPatch(d: DraftRow): { id: string } & HoldingPerformancePatch {
  const shares = parseOptionalNumber(d.shares);
  const cost_basis = parseOptionalNumber(d.avg_entry);
  const cash_invested = deriveCashInvested(shares, cost_basis);
  return {
    id: d.id,
    start_date: d.start_date.trim() || null,
    shares,
    cost_basis,
    cash_invested,
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
  title = 'Edit holdings',
  description = 'Enter Start date, shares, and average entry cost. Cash invested is shares × avg entry. Your return uses MWS prices from Start when the ticker is covered.',
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
              {drafts.map((d) => {
                const shares = parseOptionalNumber(d.shares);
                const avg = parseOptionalNumber(d.avg_entry);
                const cash = deriveCashInvested(shares, avg);
                return (
                  <div key={d.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="font-mono text-sm font-semibold text-foreground">{d.ticker}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Cash{' '}
                        <span className="font-mono text-foreground">
                          {cash == null
                            ? '—'
                            : new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                maximumFractionDigits: 0,
                              }).format(cash)}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
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
                          Shares
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="h-9 w-full rounded-lg border border-border bg-background px-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                          placeholder="100"
                          value={d.shares}
                          disabled={busy}
                          onChange={(e) => setField(d.id, 'shares', e.target.value)}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Avg entry
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="h-9 w-full rounded-lg border border-border bg-background px-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                          placeholder="185.50"
                          value={d.avg_entry}
                          disabled={busy}
                          onChange={(e) => setField(d.id, 'avg_entry', e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
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
