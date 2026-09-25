import type { MwsBriefOutput } from './types';
import { BRIEF_ENGINE_VERSION } from './types';

/** Format a stored decimal as display percent with one decimal (0.123 → "+12.3%"). */
export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'not available';
  }
  const pct = value * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export function missingBrief(
  composerId: MwsBriefOutput['composerId'],
  title: string,
  sourceFields: string[],
): MwsBriefOutput {
  return {
    version: BRIEF_ENGINE_VERSION,
    composerId,
    title,
    body: 'MWS data for this explanation is not available yet.',
    bullets: ['Required fields are missing or null in the current MWS row.'],
    disclaimer: 'MWS Brief explains stored MWS state only. It does not give trading advice.',
    sourceFields,
  };
}

export function withDisclaimer(out: Omit<MwsBriefOutput, 'disclaimer' | 'version'> & { disclaimer?: string }): MwsBriefOutput {
  return {
    version: BRIEF_ENGINE_VERSION,
    disclaimer: out.disclaimer ?? 'MWS Brief explains stored MWS state only. It does not give trading advice.',
    ...out,
  };
}
