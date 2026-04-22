import 'server-only';
import { AdminAuthError, requireAdmin, type AdminContext } from '@/lib/server/admin-guard';

export type ActionOk<T> = { ok: true; data: T };
export type ActionErr = { ok: false; error: string; code?: string };
export type ActionResult<T> = ActionOk<T> | ActionErr;

export function ok<T>(data: T): ActionOk<T> {
  return { ok: true, data };
}

export function err(message: string, code?: string): ActionErr {
  return { ok: false, error: message, code };
}

/**
 * Wraps an admin-gated operation. Verifies the access token maps to an Admin,
 * then calls the handler. On any auth failure, returns a safe generic error.
 */
export async function withAdmin<T>(
  accessToken: string | null | undefined,
  fn: (ctx: AdminContext) => Promise<ActionResult<T>>
): Promise<ActionResult<T>> {
  try {
    const ctx = await requireAdmin(accessToken);
    return await fn(ctx);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      // Don't leak which specific check failed.
      return err('Not authorized.', e.code);
    }
    const msg = e instanceof Error ? e.message : 'Unknown error.';
    return err(msg, 'internal');
  }
}
