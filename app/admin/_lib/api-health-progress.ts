/** Parsed `__progress__{...}` payload written by edge functions during long runs. */
export type ApiHealthProgressPayload = {
  type: 'progress';
  mode: 'collect' | 'import';
  phase: string;
  done: number;
  total: number;
  percent: number;
  /** Wall-clock ms (Date.now()) from the edge on each progress write; used to drop stale rows. */
  heartbeat_at?: number;
  updated?: number;
  failed?: number;
  imported?: number;
  skipped?: number;
  elapsedMs?: number;
  recent_failures?: string[];
};

/** If no heartbeat for this long, treat progress as abandoned (worker crash, dead chain, etc.). */
export const EDGE_PROGRESS_STALE_MS = 3 * 60 * 1000;

export function parseApiHealthProgressMessage(raw: string | null): ApiHealthProgressPayload | null {
  if (!raw) return null;
  const idx = raw.indexOf('__progress__');
  if (idx < 0) return null;
  try {
    const parsed = JSON.parse(raw.slice(idx + '__progress__'.length).trim()) as ApiHealthProgressPayload;
    if (parsed?.type !== 'progress') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Only the newest health-log row may carry an active `__progress__` payload.
 * Older rows sometimes keep a non-100% payload after a chain fails or the worker exits,
 * which would otherwise make the admin UI look "stuck" forever.
 *
 * Rows with `__progress__` and `duration_ms` set were a legacy "between batches" checkpoint;
 * that combination is never a live ticker loop (`updateRunProgress` keeps `duration_ms` null).
 */
export function pickActiveEdgeProgressRow<
  R extends { id: number; error_message: string | null; duration_ms?: number | null },
>(rows: R[]): (R & { progress: ApiHealthProgressPayload }) | null {
  if (!rows?.length) return null;
  const sorted = [...rows].sort((a, b) => b.id - a.id);
  const newest = sorted[0]!;
  const p = parseApiHealthProgressMessage(newest.error_message);
  if (!p || p.percent >= 100) return null;

  const now = Date.now();
  if (typeof p.heartbeat_at === 'number' && now - p.heartbeat_at > EDGE_PROGRESS_STALE_MS) {
    return null;
  }

  const dur = newest.duration_ms;
  if (dur != null && Number(dur) > 0) {
    return null;
  }

  return { ...newest, progress: p };
}
