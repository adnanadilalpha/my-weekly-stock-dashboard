'use client';

import { CheckCheck, Inbox } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  listAdminNotificationsAction,
  markAdminNotificationReadAction,
  markAllAdminNotificationsReadAction,
  type AdminNotificationRow,
} from '../../_actions/notifications';
import { useAdmin } from '../../_lib/admin-context';

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function typeBadge(type: string) {
  const t = type.toLowerCase();
  if (t === 'user_joined') return 'bg-violet-500/15 text-violet-800 dark:text-violet-200';
  if (t === 'ticker_update_complete') return 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-100';
  if (t === 'api_run') return 'bg-sky-500/15 text-sky-900 dark:text-sky-100';
  return 'bg-muted text-muted-foreground';
}

export default function NotificationsPage() {
  const { getAccessToken } = useAdmin();
  const [items, setItems] = useState<AdminNotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const token = await getAccessToken();
      const res = await listAdminNotificationsAction(token, { limit: 100 });
      if (!res.ok) {
        setError(res.error);
        setItems([]);
        return;
      }
      setItems(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 25_000);
    return () => window.clearInterval(id);
  }, [load]);

  const onRowActivate = async (n: AdminNotificationRow) => {
    if (n.read_at) return;
    setBusy(true);
    try {
      const token = await getAccessToken();
      const res = await markAdminNotificationReadAction(token, { id: n.id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      window.dispatchEvent(new Event('mws-admin-notifications-dirty'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update.');
    } finally {
      setBusy(false);
    }
  };

  const markAll = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await markAllAdminNotificationsReadAction(token);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const now = new Date().toISOString();
      setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at ?? now })));
      window.dispatchEvent(new Event('mws-admin-notifications-dirty'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          New allowlist users appear here automatically. Ticker refresh summaries are sent once per finished session
          (when all chained batches are done), with updated/failed counts from the Edge job. Open a row to mark it read.
        </p>
        <button
          type="button"
          onClick={() => void markAll()}
          disabled={busy || loading || items.length === 0}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
        >
          <CheckCheck size={16} />
          Mark all read
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {!loading && items.length === 0 && (
        <div className="flex min-w-0 flex-col items-center justify-center rounded-2xl border border-border bg-card px-6 py-14 text-center shadow-sm md:px-8 md:py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
            <Inbox size={28} strokeWidth={1.5} aria-hidden />
          </div>
          <p className="mt-5 text-base font-semibold text-foreground">No notifications yet</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Apply migration <span className="font-mono text-foreground">20260425160000_admin_notifications</span>,
            then add a user or run the data pipeline — events will appear here.
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <ul className="flex min-w-0 flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {items.map((n) => {
            const unread = !n.read_at;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void onRowActivate(n)}
                  disabled={busy}
                  className={`flex w-full min-w-0 flex-col gap-1 px-4 py-4 text-left transition-colors sm:px-6 ${
                    unread ? 'bg-emerald-500/[0.04] hover:bg-muted/40' : 'hover:bg-muted/30'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${typeBadge(n.type)}`}
                    >
                      {n.type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatWhen(n.created_at)}</span>
                    {unread && (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-200">
                        New
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-foreground">{n.title}</span>
                  <span className="whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
