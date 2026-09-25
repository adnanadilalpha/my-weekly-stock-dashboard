'use client';

import { useCallback, useState } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { featureFlags } from '@/lib/feature-flags';
import { supabase } from '@/lib/supabase-client';
import { useActivity } from '@/lib/activity/ActivityProvider';
import type { ChatContextRef } from '@/lib/intelligence/chat/context';

export function ChatDrawer({ contextRef }: { contextRef?: ChatContextRef }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activity = useActivity();

  const send = useCallback(async () => {
    const message = input.trim();
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
          content: 'Chat failed. Use MWS Brief on the page for explanations.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, [activity, busy, contextRef, input, sessionId]);

  if (!featureFlags.aiChat) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-800 shadow-lg hover:bg-neutral-50"
        aria-label="Open MWS Chat"
      >
        <MessageCircle className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-neutral-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-neutral-900">MWS Chat</div>
              {contextRef?.ticker && (
                <div className="text-xs text-neutral-500">Context: {contextRef.ticker}</div>
              )}
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat">
              <X className="h-5 w-5 text-neutral-500" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {messages.length === 0 && (
              <p className="text-neutral-500">
                Ask about MWS Ratings, Outlook, or performance for the current context. No trading advice.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`rounded-lg px-3 py-2 ${
                  m.role === 'user' ? 'ml-8 bg-neutral-900 text-white' : 'mr-8 bg-neutral-100 text-neutral-800'
                }`}
              >
                {m.content}
              </div>
            ))}
            {error && <p className="text-xs text-amber-700">Status: {error}</p>}
          </div>

          <div className="flex gap-2 border-t border-neutral-200 p-3">
            <input
              className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              placeholder="Ask about MWS state…"
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void send();
              }}
            />
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-neutral-900 px-3 text-white disabled:opacity-50"
              disabled={busy || !input.trim()}
              onClick={() => void send()}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
