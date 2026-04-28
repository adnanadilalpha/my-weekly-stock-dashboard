/**
 * End-user ticker visibility: hide rows where is_active is explicitly false.
 * NULL is_active is treated as visible (legacy rows), matching admin "active" filter.
 */
export const USER_TICKER_ACTIVE_OR = 'is_active.eq.true,is_active.is.null';

export function rowVisibleToEndUser(row: unknown): boolean {
  if (row == null || typeof row !== 'object') return false;
  const v = (row as { is_active?: boolean | null }).is_active;
  if (v === false) return false;
  return true;
}
