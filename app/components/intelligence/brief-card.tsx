'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import type { MwsBriefOutput } from '@/lib/intelligence/brief';
import { featureFlags } from '@/lib/feature-flags';
import { useActivity } from '@/lib/activity/ActivityProvider';

function paragraphs(body: string): string[] {
  return body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function BriefCard({
  brief,
  defaultOpen = true,
  compact = false,
  label = 'MWS explain',
  /** Compact quick-read: no title bar, no pill tags — just the summary text. */
  variant = 'default',
}: {
  brief: MwsBriefOutput | null;
  defaultOpen?: boolean;
  compact?: boolean;
  label?: string;
  variant?: 'default' | 'quickRead';
}) {
  const [open, setOpen] = useState(defaultOpen);
  const activity = useActivity();

  if (!featureFlags.brief || !brief) return null;

  const paras = paragraphs(brief.body);

  if (variant === 'quickRead') {
    return (
      <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/90 px-3.5 py-3 text-left sm:px-4 sm:py-3.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          <Sparkles className="h-3 w-3" />
          Quick read
        </div>
        <p className={`leading-relaxed text-neutral-800 ${compact ? 'text-xs sm:text-[13px]' : 'text-sm'}`}>
          {brief.body}
        </p>
      </div>
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
        <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-neutral-500" />
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
