'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { featureFlags } from '@/lib/feature-flags';
import { supabase } from '@/lib/supabase-client';
import { useActivity } from '@/lib/activity/ActivityProvider';
import type { ChatContextRef } from '@/lib/intelligence/chat/context';
import { Button } from '@/app/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/app/components/ui/sheet';
import { cn } from '@/app/components/ui/utils';

type ChatBubble = { role: 'user' | 'assistant'; content: string };

function suggestionPrompts(ref?: ChatContextRef): string[] {
  const t = ref?.ticker?.toUpperCase();
  if (t) {
    return [
      `What is ${t}'s Daily Rating and Outlook?`,
      `Explain ${t}'s performance strength`,
      `How does Weekly compare to Daily for ${t}?`,
    ];
  }
  if (ref?.userPortfolioId) {
    return [
      'Summarize MWS state for my holdings',
      'Which holding has the strongest Daily Rating?',
      'Explain NVDA Daily vs Weekly',
    ];
  }
  return [
    'What does Strong Uptrend mean?',
    'How is Trend Score different from Rating?',
    'Explain Performance strength vs Rating',
  ];
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h1: ({ children }) => (
          <h3 className="mb-1.5 mt-2 text-sm font-semibold first:mt-0">{children}</h3>
        ),
        h2: ({ children }) => (
          <h3 className="mb-1.5 mt-2 text-sm font-semibold first:mt-0">{children}</h3>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1.5 mt-2 text-sm font-semibold first:mt-0">{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h4>
        ),
        hr: () => <hr className="my-2 border-border" />,
        a: ({ href, children }) => (
          <a href={href} className="underline underline-offset-2" target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="rounded bg-muted px-1 py-0.5 text-[12px]">{children}</code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
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

  const suggestions = useMemo(() => suggestionPrompts(contextRef), [contextRef]);

  useEffect(() => {
    if (!open) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 180);
      return () => window.clearTimeout(t);
    }
  }, [open]);

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

  if (!featureFlags.aiChat) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-md transition-colors hover:bg-muted/60"
        aria-label="Open MWS Intelligence"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <span className="hidden sm:inline">Ask MWS</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="pr-8 text-base font-semibold">MWS Intelligence</SheetTitle>
          </SheetHeader>

          <div ref={scrollerRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
            {messages.length === 0 && (
              <div className="flex flex-col gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy}
                    onClick={() => void sendMessage(s)}
                    className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={cn(
                  'max-w-[92%] rounded-2xl px-3.5 py-2.5',
                  m.role === 'user'
                    ? 'ml-auto whitespace-pre-wrap bg-foreground text-background leading-relaxed'
                    : 'mr-auto border border-border/80 bg-muted/50 text-foreground',
                )}
              >
                {m.role === 'assistant' ? (
                  <AssistantMarkdown content={m.content} />
                ) : (
                  m.content
                )}
              </div>
            ))}

            {busy && (
              <div className="mr-auto inline-flex items-center gap-2 rounded-2xl border border-border/80 bg-muted/50 px-3.5 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking…
              </div>
            )}

            {error && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">{error}</p>
            )}
          </div>

          <div className="border-t border-border bg-background p-3">
            <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-2.5 py-2 focus-within:ring-2 focus-within:ring-ring/40">
              <textarea
                ref={inputRef}
                rows={1}
                className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Ask about a ticker or your holdings…"
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
              <Button
                type="button"
                size="icon"
                className="shrink-0"
                disabled={busy || !input.trim()}
                onClick={() => void sendMessage(input)}
                aria-label="Send"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
