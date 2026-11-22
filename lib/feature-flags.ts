/** Client + server safe feature flags (NEXT_PUBLIC_*). */

export function envFlagTrue(name: string): boolean {
  return (process.env[name] ?? '').toLowerCase().trim() === 'true';
}

/**
 * Admin-managed Current Week + Track Record (momentum_* tables).
 * Staging: true. Production: false until cutover after client approval.
 */
export const isMomentumV2 = envFlagTrue('NEXT_PUBLIC_MOMENTUM_V2');
