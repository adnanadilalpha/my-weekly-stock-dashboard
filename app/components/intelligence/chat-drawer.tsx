'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  BarChart3,
  BookOpen,
  GitCompare,
  LineChart,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/lib/supabase-client';
import { useActivity } from '@/lib/activity/ActivityProvider';
import type { ChatContextRef } from '@/lib/intelligence/chat/context';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { cn } from '@/app/components/ui/utils';
import { MwsLogo } from '@/app/components/brand/mws-logo';

type ChatBubble = { role: 'user' | 'assistant'; content: string };

type QuickAction = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Auto-send this question. */
  prompt?: string;
  /** Prefill the composer (user finishes / sends). */
  draft?: string;
};

function quickActions(ref?: ChatContextRef): QuickAction[] {
  const t = ref?.ticker?.toUpperCase();
  if (t) {
    return [
      {
        id: 'summarize',
        label: 'Summarize',
        hint: `Current MWS state for ${t}`,
        icon: BarChart3,
        prompt: `Summarize the current MWS state for ${t}`,
      },
      {
        id: 'rating',
        label: 'Rating & outlook',
        hint: 'Daily vs Weekly read',
        icon: LineChart,
        prompt: `Explain ${t}'s Daily Rating, Weekly Rating, and Outlook`,
      },
      {
        id: 'quadrant',
        label: 'Quadrant',
        hint: '21d & 30w EMA position',
        icon: GitCompare,
        prompt: `What is ${t}'s Quadrant Analysis position and what does it mean?`,
      },
      {
        id: 'performance',
        label: 'Performance',
        hint: '1M / 3M strength',
        icon: BookOpen,
        prompt: `How is ${t} performing on 1M and 3M strength vs its Rating?`,
      },
    ];
  }
  if (ref?.userPortfolioId) {
    return [
      {
        id: 'summarize',
        label: 'Summarize book',
        hint: 'Open holdings snapshot',
        icon: BarChart3,
        prompt: 'Summarize MWS state for my open holdings',
      },
      {
        id: 'priority',
        label: 'Where to look',
        hint: 'Highest-priority name first',
        icon: LineChart,
        prompt: 'Which of my open holdings should I look at first and why?',
      },
      {
        id: 'weakspots',
        label: 'Weak spots',
        hint: 'Pullback & Broken Trend',
        icon: GitCompare,
        prompt: 'Which of my holdings are in Pullback or Broken Trend?',
      },
      {
        id: 'strong',
        label: 'Strong names',
        hint: 'Uptrend holdings',
        icon: BookOpen,
        prompt: 'Which of my holdings are in Strong Uptrend or Synced Uptrend?',
      },
    ];
  }
  // MWS Dashboard / general: no ticker bias — analyze is a draft so user names a ticker
  return [
    {
      id: 'analyze',
      label: 'Analyze a ticker',
      hint: 'Type any MWS name',
      icon: LineChart,
      draft: 'Analyze ',
    },
    {
      id: 'book',
      label: 'My holdings',
      hint: 'Snapshot of your book',
      icon: BarChart3,
      prompt: 'Summarize MWS state for my open holdings',
    },
    {
      id: 'weakspots',
      label: 'Weak spots',
      hint: 'Pullback & Broken Trend',
      icon: GitCompare,
      prompt: 'Which of my holdings are in Pullback or Broken Trend?',
    },
    {
      id: 'quadrant',
      label: 'Explain Quadrant',
      hint: '21d vs 30w EMA',
      icon: BookOpen,
      prompt: 'What is Quadrant Analysis (21-day vs 30-week EMA) and how do I use it?',
    },
  ];
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => (
          <p className="mb-2.5 last:mb-0 text-[13px] leading-[1.55] text-neutral-700 sm:text-sm">
            {children}
          </p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-neutral-900">{children}</strong>
        ),
        em: ({ children }) => <em className="italic text-neutral-600">{children}</em>,
        ul: ({ children }) => (
          <ul className="mb-2.5 list-disc space-y-1 pl-4 last:mb-0 marker:text-neutral-400">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2.5 list-decimal space-y-1 pl-4 last:mb-0 marker:text-neutral-400">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-[13px] leading-[1.55] text-neutral-700 sm:text-sm">{children}</li>
        ),
        h1: ({ children }) => (
          <h3 className="mb-1.5 mt-3 text-[13px] font-semibold text-neutral-900 first:mt-0 sm:text-sm">
            {children}
          </h3>
        ),
        h2: ({ children }) => (
          <h3 className="mb-1.5 mt-3 text-[13px] font-semibold text-neutral-900 first:mt-0 sm:text-sm">
            {children}
          </h3>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1.5 mt-3 text-[13px] font-semibold text-neutral-900 first:mt-0 sm:text-sm">
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4 className="mb-1 mt-2 text-[13px] font-semibold text-neutral-900 first:mt-0">
            {children}
          </h4>
        ),
        hr: () => <hr className="my-3 border-neutral-200" />,
        a: ({ href, children }) => (
          <a
            href={href}
            className="font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-500"
            target="_blank"
            rel="noreferrer"
          >
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="rounded-md bg-neutral-100 px-1 py-0.5 font-mono text-[12px] text-neutral-800">
            {children}
          </code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400"
          style={{ animationDelay: `${i * 120}ms`, animationDuration: '900ms' }}
        />
      ))}
    </div>
  );
}

export function ChatDrawer({ contextRef }: { contextRef?: ChatContextRef }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activity = useActivity();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const actions = useMemo(() => quickActions(contextRef), [contextRef]);

  useEffect(() => {
    if (!open) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 200);
    return () => window.clearTimeout(t);
  }, [open]);

  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    resizeInput();
  }, [input, resizeInput]);

  const sendMessage = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || busy) return;
      setBusy(true);
      setError(null);
      setInput('');
      setMessages((m) => [...m, { role: 'user', content: message }]);
      activity?.trackEvent({
        eventType: 'feature_use',
        eventName: 'ai_chat_send',
        metadata: { hasTicker: !!contextRef?.ticker },
      });

      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error('Not signed in');

        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message,
            sessionId,
            stream: false,
            contextRef: contextRef ?? {},
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setMessages((m) => [
            ...m,
            {
              role: 'assistant',
              content: json.message ?? json.error ?? 'Chat unavailable',
            },
          ]);
          setError(json.error ?? 'request_failed');
          return;
        }
        if (json.sessionId) setSessionId(json.sessionId);
        setMessages((m) => [...m, { role: 'assistant', content: json.content as string }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Chat failed');
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: 'Chat failed. Try again in a moment.',
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [activity, busy, contextRef, sessionId],
  );

  const applyQuickAction = useCallback(
    (action: QuickAction) => {
      if (action.draft != null) {
        setInput(action.draft);
        window.setTimeout(() => {
          const el = inputRef.current;
          if (!el) return;
          el.focus();
          const len = action.draft!.length;
          el.setSelectionRange(len, len);
        }, 0);
        return;
      }
      if (action.prompt) void sendMessage(action.prompt);
    },
    [sendMessage],
  );

  const empty = messages.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-5 right-5 z-40 inline-flex items-center gap-2.5 rounded-full bg-neutral-950 pl-1 pr-4 py-1 text-sm font-medium text-white',
          'shadow-[0_8px_28px_-8px_rgba(0,0,0,0.45)] transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2',
        )}
        aria-label="Open Ask MWS"
      >
        <MwsLogo variant="mark" onLight={false} className="h-9 w-9 rounded-full" alt="" />
        <span className="pr-0.5">Ask MWS</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            'flex h-[min(720px,88vh)] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white p-0 shadow-2xl',
            'sm:max-w-2xl',
          )}
        >
          <DialogHeader className="shrink-0 space-y-0 border-b border-neutral-100 bg-white px-5 pb-4 pt-5 text-left sm:px-6">
            <div className="flex items-start gap-3 pr-8">
              <MwsLogo variant="mark" className="mt-0.5 h-10 w-10 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-[16px] font-semibold tracking-tight text-neutral-950">
                  Ask MWS
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-[12.5px] leading-snug text-neutral-500">
                  Your AI assistant for market insights
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div
            ref={scrollerRef}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6"
          >
            {empty ? (
              <div className="flex flex-1 flex-col justify-center gap-5 pb-2">
                <div className="space-y-1.5 text-center">
                  <p className="text-[15px] font-semibold tracking-tight text-neutral-900">
                    How can I help?
                  </p>
                  <p className="mx-auto max-w-sm text-[12.5px] leading-relaxed text-neutral-500">
                    Ask about any MWS ticker, your holdings, or how the framework works.
                  </p>
                </div>

                <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-2.5">
                  {actions.map((a) => {
                    const Icon = a.icon;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        disabled={busy}
                        onClick={() => applyQuickAction(a)}
                        className={cn(
                          'flex flex-col items-start gap-2.5 rounded-2xl border border-neutral-200 bg-neutral-50/80 px-3.5 py-3.5 text-left',
                          'transition-all duration-150 hover:border-neutral-300 hover:bg-white hover:shadow-sm',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15',
                          'disabled:opacity-50',
                        )}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-neutral-800 shadow-sm ring-1 ring-neutral-200/80">
                          <Icon className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                        <span>
                          <span className="block text-[13px] font-semibold text-neutral-900">
                            {a.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">
                            {a.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
                {messages.map((m, i) => (
                  <div
                    key={`${m.role}-${i}`}
                    className={cn(
                      'flex gap-2.5',
                      m.role === 'user' ? 'justify-end' : 'justify-start',
                    )}
                  >
                    {m.role === 'assistant' && (
                      <MwsLogo
                        variant="mark"
                        className="mt-0.5 h-7 w-7 shrink-0 rounded-lg"
                        alt=""
                      />
                    )}
                    <div
                      className={cn(
                        'min-w-0 max-w-[88%]',
                        m.role === 'user'
                          ? 'rounded-2xl rounded-br-md bg-neutral-950 px-3.5 py-2.5 text-[13px] leading-[1.5] text-white sm:text-sm'
                          : 'rounded-2xl rounded-tl-md border border-neutral-100 bg-neutral-50 px-3.5 py-2.5',
                      )}
                    >
                      {m.role === 'assistant' ? (
                        <AssistantMarkdown content={m.content} />
                      ) : (
                        <span className="whitespace-pre-wrap">{m.content}</span>
                      )}
                    </div>
                  </div>
                ))}

                {busy && (
                  <div className="flex items-start gap-2.5">
                    <MwsLogo variant="mark" className="mt-0.5 h-7 w-7 shrink-0 rounded-lg" alt="" />
                    <div className="rounded-2xl border border-neutral-100 bg-neutral-50 px-3.5 py-2.5">
                      <ThinkingDots />
                    </div>
                  </div>
                )}

                {error && <p className="pl-9 text-[11px] text-amber-700">{error}</p>}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-neutral-100 bg-white p-3 sm:p-4 sm:px-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage(input);
              }}
              className="mx-auto w-full max-w-xl"
            >
              <div
                className={cn(
                  'flex items-end gap-2 rounded-[22px] border border-neutral-200 bg-neutral-50/80 pl-4 pr-1.5 py-1.5',
                  'shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow',
                  'focus-within:border-neutral-300 focus-within:bg-white focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.06)]',
                )}
              >
                <textarea
                  ref={inputRef}
                  rows={1}
                  className="max-h-30 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[13px] leading-snug text-neutral-900 outline-none placeholder:text-neutral-400 sm:text-sm"
                  placeholder="Ask about your holdings, tickers, or MWS data…"
                  value={input}
                  disabled={busy}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage(input);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  aria-label="Send"
                  className={cn(
                    'mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
                    input.trim() && !busy
                      ? 'bg-neutral-950 text-white hover:bg-neutral-800'
                      : 'bg-neutral-200 text-neutral-400',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/30',
                    'disabled:cursor-not-allowed',
                  )}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                  )}
                </button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
