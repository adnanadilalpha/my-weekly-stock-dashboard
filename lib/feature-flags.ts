/** Client + server safe feature flags (NEXT_PUBLIC_*). */

/**
 * Next.js only inlines NEXT_PUBLIC_* when accessed as a static property
 * (process.env.NEXT_PUBLIC_FOO). Dynamic process.env[name] is undefined in
 * the client bundle and silently disables the flag.
 */
function publicFlagTrue(value: string | undefined): boolean {
  return (value ?? '').toLowerCase().trim() === 'true';
}

/**
 * Admin-managed Current Week + Track Record (momentum_* tables).
 * Staging: true. Production: false until cutover after client approval.
 */
export const isMomentumV2 = publicFlagTrue(process.env.NEXT_PUBLIC_MOMENTUM_V2);
