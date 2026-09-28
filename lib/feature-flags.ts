/**
 * Feature flags — default OFF so live prod keeps the current UX until enabled.
 * IMPORTANT: Next.js only inlines NEXT_PUBLIC_* when accessed as literal keys
 * (process.env.NEXT_PUBLIC_FOO). Dynamic process.env[name] always returns undefined.
 */

function parse(raw: string | undefined, defaultOn = false): boolean {
  const v = (raw ?? '').split('#')[0].toLowerCase().trim();
  if (v === 'true' || v === '1' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'off') return false;
  return defaultOn;
}

export const featureFlags = {
  /** Always-on: presents packaged MWS narratives in a friendlier layout. */
  brief: parse(process.env.NEXT_PUBLIC_FEATURE_BRIEF, true),
  /**
   * On-demand Relative Strength chart (picker + scatter).
   * Reads RELATIVE_STRENGTH, falls back to legacy SECTOR_ROTATION.
   */
  relativeStrength: parse(
    process.env.NEXT_PUBLIC_FEATURE_RELATIVE_STRENGTH ||
      process.env.NEXT_PUBLIC_FEATURE_SECTOR_ROTATION,
    false,
  ),
  myPortfolios: parse(process.env.NEXT_PUBLIC_FEATURE_MY_PORTFOLIOS, false),
  /**
   * Cloud chat — also requires a server-side model backend:
   * GOOGLE_STUDIO_AI_API_KEY (testing) and/or MODAL_CHAT_URL (own model).
   */
  aiChat: parse(process.env.NEXT_PUBLIC_FEATURE_AI_CHAT, false),
} as const;

export type FeatureFlagKey = keyof typeof featureFlags;
