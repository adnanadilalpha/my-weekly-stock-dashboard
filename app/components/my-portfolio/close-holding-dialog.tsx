'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticker: string;
  defaultExitPrice?: number | null;
  busy?: boolean;
  onConfirm: (input: { exit_date: string; exit_price: number | null }) => void | Promise<void>;
};

export function CloseHoldingDialog({
  open,
  onOpenChange,
  ticker,
  defaultExitPrice = null,
  busy = false,
  onConfirm,
}: Props) {
  const [exitDate, setExitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exitPrice, setExitPrice] = useState('');

  useEffect(() => {
    if (!open) return;
    setExitDate(new Date().toISOString().slice(0, 10));
    setExitPrice(
      defaultExitPrice != null && Number.isFinite(defaultExitPrice)
        ? String(Number(defaultExitPrice.toFixed(2)))
        : '',
    );
  }, [open, defaultExitPrice, ticker]);

  const parsedPrice = useMemo(() => {
    const s = exitPrice.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }, [exitPrice]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 overflow-hidden p-0 sm:max-w-sm">
        <DialogHeader className="space-y-1 border-b border-border px-5 py-4 text-left">
          <DialogTitle>Close {ticker}</DialogTitle>
          <DialogDescription>
            Moves this name to Past positions for analysis. It leaves your active book.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-5 py-4">
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Exit date
            </span>
            <input
              type="date"
              className="h-9 w-full rounded-lg border border-border bg-background px-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              value={exitDate}
              disabled={busy}
              onChange={(e) => setExitDate(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Exit price
            </span>
            <input
              type="text"
              inputMode="decimal"
              className="h-9 w-full rounded-lg border border-border bg-background px-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Current MWS price if available"
              value={exitPrice}
              disabled={busy}
              onChange={(e) => setExitPrice(e.target.value)}
            />
          </label>
        </div>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !exitDate.trim()}
            onClick={() =>
              void onConfirm({
                exit_date: exitDate.trim(),
                exit_price: parsedPrice,
              })
            }
          >
            {busy ? 'Closing…' : 'Close position'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
