'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { MwsBriefOutput } from '@/lib/intelligence/brief';
import { useActivity } from '@/lib/activity/ActivityProvider';
import { MwsLogo } from '@/app/components/brand/mws-logo';

function paragraphs(body: string): string[] {
  return body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseQuadrantQuickRead(body: string): {
  /** Short quadrant name, e.g. "Synced Uptrend" */
  name: string;
  metrics: { label: string; value: string }[];
} | null {
  const lines = body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const name = lines[0].split(' — ')[0]?.trim() || lines[0];
  const metrics = lines.slice(1).flatMap((line) => {
    const match = line.match(/^% from (.+?):\s*(.+)$/i);
    if (!match) return [];
    const horizon = match[1]
      .replace(/\s*EMA\s*$/i, '')
      .trim();
    return [{ label: horizon, value: match[2].trim() }];
  });

  return { name, metrics };
}

export function BriefCard({
  brief,
  defaultOpen = true,
  compact = false,
  label = 'MWS explain',
  /** Compact quick-read: no title bar, no pill tags — just the summary text. */
  variant = 'default',
  /** Optional quadrant snapshot shown above the recap in quick-read. */
  quadrantBrief = null,
}: {
  brief: MwsBriefOutput | null;
  defaultOpen?: boolean;
  compact?: boolean;
  label?: string;
  variant?: 'default' | 'quickRead';
  quadrantBrief?: MwsBriefOutput | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const activity = useActivity();

  if (!brief) return null;

  const paras = paragraphs(brief.body);

  if (variant === 'quickRead') {
    const quadrant =
      quadrantBrief && !quadrantBrief.body.toLowerCase().includes('not enough')
        ? parseQuadrantQuickRead(quadrantBrief.body)
        : null;
    const hasRecap = Boolean(brief.body.trim());

    return (
      <aside className="w-full text-left">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <MwsLogo variant="mark" className="h-3.5 w-3.5 rounded-sm" alt="" />
          Quick read
        </div>

        <div
          className={
            quadrant && hasRecap
              ? 'grid gap-3 sm:gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start lg:gap-6'
              : undefined
          }
        >
          {quadrant && (
            <div className="min-w-0 lg:border-r lg:border-border/70 lg:pr-6">
              <p className="text-[15px] font-semibold leading-snug tracking-tight text-foreground sm:text-base">
                {quadrant.name}
              </p>
              {quadrant.metrics.length > 0 && (
                <p className="mt-1.5 whitespace-nowrap text-[13px] leading-relaxed text-muted-foreground">
                  {quadrant.metrics.map((m, i) => {
                    const below = m.value.trim().startsWith('-');
                    return (
                      <span key={m.label}>
                        {i > 0 && <span className="mx-1.5 text-border">·</span>}
                        <span className="font-mono text-[12.5px] font-semibold tabular-nums text-foreground">
                          {m.value}
                        </span>
                        {' '}
                        {below ? 'below' : 'above'} {m.label} EMA
                      </span>
                    );
                  })}
                </p>
              )}
            </div>
          )}

          {hasRecap ? (
            <p className="text-[13px] leading-relaxed text-foreground/85 sm:text-sm lg:pt-0.5">
              {brief.body}
            </p>
          ) : null}
        </div>
      </aside>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white text-left shadow-sm">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-50"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            activity?.trackEvent({
              eventType: 'feature_use',
              eventName: 'brief_open',
              metadata: { composerId: brief.composerId, title: brief.title },
            });
          }
        }}
      >
        <MwsLogo variant="mark" className="h-4 w-4 flex-shrink-0 rounded-sm" alt="" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{brief.title}</span>
          <span className="block text-[11px] font-normal text-neutral-400">{label}</span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-neutral-400" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-neutral-400" />
        )}
      </button>
      {open && (
        <div className={`space-y-3 border-t border-neutral-100 px-3 py-3 ${compact ? 'text-xs' : 'text-sm'}`}>
          {brief.bullets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {brief.bullets.map((b) => (
                <span
                  key={b}
                  className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700"
                >
                  {b}
                </span>
              ))}
            </div>
          )}
          <div className="space-y-3 leading-relaxed text-neutral-700">
            {paras.map((p) => (
              <p key={p.slice(0, 48)}>{p}</p>
            ))}
          </div>
          {brief.disclaimer && (
            <p className="text-[11px] text-neutral-400">{brief.disclaimer}</p>
          )}
        </div>
      )}
    </div>
  );
}
