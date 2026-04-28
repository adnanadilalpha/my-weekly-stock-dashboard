'use server';

import { AdminAuthError, requireAdmin } from '@/lib/server/admin-guard';
import { err, ok, type ActionResult } from './_shared';

export type AdminWhoAmI = { email: string; userId: string };

export async function whoAmIAction(accessToken: string): Promise<ActionResult<AdminWhoAmI>> {
  try {
    const ctx = await requireAdmin(accessToken);
    return ok({ email: ctx.email, userId: ctx.userId });
  } catch (e) {
    if (e instanceof AdminAuthError) return err('Not authorized.', e.code);
    return err('Unknown error.', 'internal');
  }
}
