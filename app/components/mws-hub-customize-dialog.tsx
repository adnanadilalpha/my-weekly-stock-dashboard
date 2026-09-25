'use client';

import { useState } from 'react';
import { GripVertical, X } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Switch } from './ui/switch';
import { cn } from './ui/utils';
import { MwsTickerPickGrid } from './mws-ticker-pick-grid';
import type { HubPrefs, HubSectionKey } from '@/lib/mws-hub-prefs';
import { DEFAULT_HUB_ORDER, HUB_SECTION_META } from '@/lib/mws-hub-prefs';

export interface CuratedHubRow {
  name: string;
  ticker: string;
}

interface MwsHubCustomizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: HubPrefs;
  onChangePrefs: (next: HubPrefs | ((p: HubPrefs) => HubPrefs)) => void;
  onReset: () => void;
  curatedRows: CuratedHubRow[];
}

export function MwsHubCustomizeDialog({
  open,
  onOpenChange,
  prefs,
  onChangePrefs,
  onReset,
  curatedRows,
}: MwsHubCustomizeDialogProps) {
  const [tab, setTab] = useState('sections');
  const [pickerSearch, setPickerSearch] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const order = prefs.order?.length ? prefs.order : [...DEFAULT_HUB_ORDER];
  const hidden = prefs.hidden || {};
  const personal = prefs.personalTickers || [];
  const personalSet = new Set(personal.map((t) => t.ticker.toUpperCase()));

  const toggleHidden = (k: HubSectionKey) => {
    onChangePrefs((p) => ({
      ...p,
      hidden: { ...p.hidden, [k]: !p.hidden[k] },
    }));
  };

  const onDragStart = (i: number) => () => setDragIdx(i);
  const onDragOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(i);
  };
  const onDrop = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) {
      setDragIdx(null);
      setDragOver(null);
      return;
    }
    const next = [...order];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    onChangePrefs((p) => ({ ...p, order: next }));
    setDragIdx(null);
    setDragOver(null);
  };
  const onDragEnd = () => {
    setDragIdx(null);
    setDragOver(null);
  };

  const togglePersonal = (row: CuratedHubRow) => {
    const t = row.ticker.toUpperCase();
    if (personalSet.has(t)) {
      onChangePrefs((p) => ({
        ...p,
        personalTickers: p.personalTickers.filter((x) => x.ticker.toUpperCase() !== t),
      }));
    } else if (personal.length < 20) {
      onChangePrefs((p) => ({
        ...p,
        personalTickers: [...p.personalTickers, { ticker: t, name: row.name }],
      }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="flex h-[min(90dvh,680px)] max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <DialogHeader className="space-y-1 pr-2 text-left">
            <DialogTitle className="text-lg">Customize dashboard</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Reorder and toggle sections · add up to 20 personalized tickers
            </p>
          </DialogHeader>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-border px-5">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'sections'}
            onClick={() => setTab('sections')}
            className={cn(
              '-mb-px border-b-2 border-transparent px-3.5 py-3 text-[13px] font-medium transition-colors',
              tab === 'sections'
                ? 'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Sections &amp; Order
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'personal'}
            onClick={() => setTab('personal')}
            className={cn(
              '-mb-px border-b-2 border-transparent px-3.5 py-3 text-[13px] font-medium transition-colors',
              tab === 'personal'
                ? 'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Personalized Tickers ({personal.length}/20)
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4">
            {tab === 'sections' ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <p className="mb-3.5 text-xs text-muted-foreground sm:text-[13px]">
                  Drag to reorder. Toggle to show / hide.
                </p>
                <div className="flex flex-col gap-2">
                  {order.map((k, i) => {
                    const meta = HUB_SECTION_META[k];
                    const visible = !hidden[k];
                    return (
                      <div
                        key={k}
                        draggable
                        onDragStart={onDragStart(i)}
                        onDragOver={onDragOver(i)}
                        onDrop={onDrop(i)}
                        onDragEnd={onDragEnd}
                        className={`flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors ${
                          dragIdx === i ? 'opacity-70' : ''
                        } ${dragOver === i && dragIdx !== i ? 'ring-2 ring-ring/40' : ''}`}
                      >
                        <GripVertical
                          className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground">{meta.label}</div>
                          <div className="text-xs text-muted-foreground">{meta.meta}</div>
                        </div>
                        <Switch
                          checked={visible}
                          onCheckedChange={() => toggleHidden(k)}
                          aria-label={visible ? 'Hide section' : 'Show section'}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <MwsTickerPickGrid
                rows={curatedRows}
                selectedTickers={personalSet}
                onToggle={togglePersonal}
                search={pickerSearch}
                onSearchChange={setPickerSearch}
                maxSelected={20}
                hint="Select up to 20 tickers to appear at the top of your dashboard. Drag the section in the first tab to change its position."
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onReset();
            }}
          >
            Reset
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
