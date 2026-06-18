import type { CSSProperties } from 'react';
import { DEFAULT_FORMULA_NUMBERS } from './queries/formula-display';
/**
 * Rating badge styles aligned with admin `FormulaManager` LEGEND + dark-mode contrast.
 * Trend outlook tier is encoded only on the dot (`trendOutlookDotClass`); pill shell is neutral.
 */

export type FormulaRatingTier = 'strong_bull' | 'bull' | 'neutral' | 'bear' | 'strong_bear';
export type FormulaRatingLabelLike = {
  tier: string;
  label: string;
  color_hex?: string | null;
};

const RATING_ORDER: FormulaRatingTier[] = ['strong_bull', 'bull', 'neutral', 'bear', 'strong_bear'];

function isTier(t: string): t is FormulaRatingTier {
  return (RATING_ORDER as string[]).includes(t);
}

/** Mirrors admin `LEGEND` + accessible borders and dark variants. */
export const RATING_TIER_BADGE_CLASS: Record<FormulaRatingTier, string> = {
  strong_bull:
    'border border-green-900/30 bg-green-800 text-white shadow-sm dark:border-green-700/50 dark:bg-green-950 dark:text-green-50',
  bull: 'border border-green-200/90 bg-green-100 text-green-950 dark:border-green-800 dark:bg-green-950/55 dark:text-green-100',
  neutral:
    'border border-amber-200/90 bg-amber-100 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100',
  bear: 'border border-orange-200/90 bg-orange-100 text-orange-950 dark:border-orange-800 dark:bg-orange-950/45 dark:text-orange-100',
  strong_bear:
    'border border-red-200/90 bg-red-100 text-red-950 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100',
};

export type TrendOutlookKind = 'Extended' | 'Stable' | 'Weak';

/** Outlook keys used in `formula_trend_templates` + Formula Manager matrix (matches DB check constraint). */
export type TrendTemplateOutlookKey =
  | 'Extended'
  | 'Stable'
  | 'Cooling'
  | 'Reversing'
  | 'Firming'
  | 'Softening'
  | 'Warming';

export type TrendThresholdInfo = {
  extended_threshold: number;
  score_weak: number;
};

/** Numeric thresholds for mapping trend score → rating tier (same bands as ticker page / edge `ratingLabel`). */
export type TrendScoreTierThresholds = {
  score_strong: number;
  score_mixed_high: number;
  score_mixed_low: number;
  score_weak: number;
};

export function ratingTierFromTrendScore(
  score: number | null | undefined,
  n: TrendScoreTierThresholds,
): FormulaRatingTier | null {
  const v = typeof score === 'number' && Number.isFinite(score) ? score : null;
  if (v === null) return null;
  if (v > n.score_strong) return 'strong_bull';
  if (v > n.score_mixed_high) return 'bull';
  if (v > n.score_mixed_low) return 'neutral';
  if (v > n.score_weak) return 'bear';
  return 'strong_bear';
}

/**
 * Same ladder as edge `trendOutlook` in `supabase/functions/_stock_impl/mod.ts`
 * (trend score vs `extended_threshold` and `score_weak` from formula settings).
 * Invalid thresholds (e.g. extended ≤ weak) are ignored so misconfigured DB values do not mark every ticker Extended.
 */
export function outlookTierFromTrendScore(score: number, t: TrendThresholdInfo): TrendOutlookKind {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'Weak';
  let ext = t.extended_threshold;
  let weak = t.score_weak;
  if (!Number.isFinite(ext) || !Number.isFinite(weak) || ext <= weak) {
    ext = DEFAULT_FORMULA_NUMBERS.extended_threshold;
    weak = DEFAULT_FORMULA_NUMBERS.score_weak;
  }
  if (n >= ext) return 'Extended';
  if (n >= weak) return 'Stable';
  return 'Weak';
}

/**
 * Maps base outlook + rating tier to the matrix outlook key — mirrors edge
 * `trendTemplateOutlookKey` in `supabase/functions/_stock_impl/mod.ts`.
 * `neutral` has no `Extended` row in `formula_trend_templates`; treat as Stable before other branches.
 */
export function trendTemplateOutlookKeyFromTier(
  ratingTier: FormulaRatingTier | null,
  baseOutlook: TrendOutlookKind,
): TrendTemplateOutlookKey | 'Weak' {
  if (ratingTier === 'neutral' && baseOutlook === 'Extended') return 'Stable';
  if (baseOutlook === 'Extended') return 'Extended';
  if (baseOutlook === 'Stable') return 'Stable';
  if (!ratingTier) return 'Weak';
  if (ratingTier === 'neutral') return 'Softening';
  if (ratingTier === 'bear' || ratingTier === 'strong_bear') return 'Reversing';
  return 'Cooling';
}

/** Pill label shown to users (e.g. "Cooling", "Extended"). */
export function formatFormulaTrendOutlookLabel(key: TrendTemplateOutlookKey | 'Weak'): string {
  return key;
}

/** Neutral shell for outlook text; tier is shown only via `trendOutlookDotClass`. */
export const TREND_OUTLOOK_PILL_CLASS =
  'inline-flex items-center gap-1.5 text-xs font-medium text-foreground';

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function matchRatingTierFromLabels(rating: string, rows: FormulaRatingLabelLike[]): FormulaRatingTier | null {
  const r = norm(rating);
  for (const row of rows) {
    if (!row?.label) continue;
    if (norm(row.label) === r && isTier(row.tier)) return row.tier;
  }
  return null;
}

/** Legacy sheet-style labels (e.g. Strong Uptrend) → closest admin tier for coloring. */
export function inferLegacyUptrendRatingTier(rating: string): FormulaRatingTier | null {
  const s = norm(rating);
  if (!s || s === 'n/a') return null;
  if (s.includes('strong') && (s.includes('up') || s.includes('bull'))) return 'strong_bull';
  if (s.includes('up') || /\bbull\b/.test(s)) return 'bull';
  if (s.includes('side') || s.includes('neutral') || s.includes('flat') || s.includes('sideways')) return 'neutral';
  if (s.includes('strong') && (s.includes('down') || s.includes('bear'))) return 'strong_bear';
  if (s.includes('down') || /\bbear\b/.test(s)) return 'bear';
  return null;
}

export function resolveRatingTier(rating: string, rows: FormulaRatingLabelLike[]): FormulaRatingTier | null {
  if (!rating || rating === 'N/A') return null;
  return matchRatingTierFromLabels(rating, rows) ?? inferLegacyUptrendRatingTier(rating);
}

export function ratingBadgeClassName(rating: string, rows: FormulaRatingLabelLike[]): string {
  const tier = resolveRatingTier(rating, rows);
  if (tier) return RATING_TIER_BADGE_CLASS[tier];
  return 'border border-border bg-muted text-muted-foreground';
}

function normalizeHexColor(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

function textColorForHex(hex: string): string {
  const cleaned = hex.slice(1);
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > 155 ? '#111827' : '#f8fafc';
}

export function ratingBadgeInlineStyle(rating: string, rows: FormulaRatingLabelLike[]): CSSProperties | undefined {
  const tier = resolveRatingTier(rating, rows);
  if (!tier) return undefined;
  const row = rows.find((r) => r.tier === tier);
  const color = normalizeHexColor(row?.color_hex);
  if (!color) return undefined;
  return { backgroundColor: color, color: textColorForHex(color), borderColor: color };
}

export function normalizeTrendOutlook(outlook: string): TrendOutlookKind | 'other' {
  const s = outlook.trim();
  if (/^extended$/i.test(s) || /\bextended\b/i.test(s)) return 'Extended';
  if (/^stable$/i.test(s) || /\bstable\b/i.test(s)) return 'Stable';
  if (/^weak$/i.test(s) || /\bweak\b/i.test(s)) return 'Weak';
  return 'other';
}

/** Parses pill text for dot styling; covers Formula Manager template outlook keys. */
export type TrendOutlookPillVisual =
  | TrendOutlookKind
  | 'Cooling'
  | 'Reversing'
  | 'Firming'
  | 'Softening'
  | 'Warming';

export function outlookPillVisualFromLabel(outlook: string): TrendOutlookPillVisual | 'other' {
  const s = outlook.toLowerCase();
  if (/\breversing\b/i.test(s)) return 'Reversing';
  if (/\bcooling\b/i.test(s)) return 'Cooling';
  if (/\bsoftening\b/i.test(s)) return 'Softening';
  if (/\bfirming\b/i.test(s)) return 'Firming';
  if (/\bwarming\b/i.test(s)) return 'Warming';
  if (/\bextended\b/i.test(s)) return 'Extended';
  if (/\bstable\b/i.test(s)) return 'Stable';
  if (/\bweak\b/i.test(s)) return 'Weak';
  return 'other';
}

/** Filled dot — encodes Formula Manager outlook tier (matrix keys + legacy Weak). */
export function trendOutlookDotClass(outlook: string): string {
  const v = outlookPillVisualFromLabel(outlook);
  const base = 'inline-block h-2 w-2 shrink-0 rounded-full border-0 ring-0 shadow-none outline-none';
  switch (v) {
    case 'Extended':
      return `${base} bg-amber-500 dark:bg-amber-400`;
    case 'Cooling':
      return `${base} bg-orange-600 dark:bg-orange-300`;
    case 'Stable':
      return `${base} bg-green-600 dark:bg-green-300`;
    case 'Firming':
      return `${base} bg-emerald-600 dark:bg-emerald-500`;
    case 'Softening':
      return `${base} bg-amber-800 dark:bg-amber-300`;
    case 'Warming':
      return `${base} bg-cyan-700 dark:bg-cyan-300`;
    case 'Reversing':
    case 'Weak':
      return `${base} bg-rose-500 dark:bg-rose-400`;
    default:
      return `${base} bg-muted-foreground/45`;
  }
}

export function trendOutlookAriaLabel(outlook: string, score: number, t: TrendThresholdInfo): string {
  const o = outlook.trim() || 'unknown';
  return `Trend signal ${o}. Trend score ${score.toFixed(2)} out of 5. Base ladder: weak below ${t.score_weak}; stable from ${t.score_weak} to below ${t.extended_threshold}; extended at or above ${t.extended_threshold}. Weak base maps to Cooling, Softening, or Reversing by rating tier per Formula Manager trend templates.`;
}
