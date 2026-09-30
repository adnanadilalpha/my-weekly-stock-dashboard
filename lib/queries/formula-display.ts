import { supabase } from '../supabase-client';

export type FormulaRatingLabelRow = {
  tier: string;
  label: string;
  description: string;
  color_hex: string;
};

export type FormulaPerformanceLabelRow = {
  strength: 'Strong' | 'Mixed' | 'Weak';
  label: string;
  description: string;
};

export type FormulaTrendTemplateRow = {
  tier: 'strong_bull' | 'bull' | 'neutral' | 'bear' | 'strong_bear';
  outlook: 'Extended' | 'Stable' | 'Cooling' | 'Reversing' | 'Firming' | 'Softening' | 'Warming';
  timeframe: 'Weekly' | 'Daily';
  title?: string;
  description: string;
};

const NUMERIC_KEYS = [
  'extended_threshold',
  'score_weak',
  'score_strong',
  'score_mixed_high',
  'score_mixed_low',
] as const;

export type FormulaNumericKey = (typeof NUMERIC_KEYS)[number];

/** Defaults mirror admin `FormulaManager` score helpers when DB row missing. */
export const DEFAULT_FORMULA_NUMBERS: Record<FormulaNumericKey, number> = {
  score_strong: 3.9,
  score_mixed_high: 2.7,
  score_mixed_low: 1.6,
  score_weak: 0.9,
  /** Price-vs-short-EMA fraction for Extended outlook (0.05 = 5%). */
  extended_threshold: 0.05,
};

export async function fetchFormulaRatingLabels(): Promise<FormulaRatingLabelRow[]> {
  try {
    const withColor = await supabase
      .from('formula_rating_labels')
      .select('tier,label,description,color_hex')
      .order('tier');
    if (!withColor.error && withColor.data?.length) return withColor.data as FormulaRatingLabelRow[];

    // Backward compatibility when DB has not yet applied the color migration.
    const legacy = await supabase.from('formula_rating_labels').select('tier,label,description').order('tier');
    if (legacy.error || !legacy.data?.length) return [];
    return (legacy.data as { tier: string; label: string; description: string }[]).map((r) => ({
      ...r,
      color_hex: '#22c55e',
    }));
  } catch {
    return [];
  }
}

export async function fetchFormulaPerformanceLabels(): Promise<FormulaPerformanceLabelRow[]> {
  try {
    const { data, error } = await supabase
      .from('formula_performance_labels')
      .select('strength,label,description')
      .order('strength');
    if (error || !data?.length) return [];
    return data as FormulaPerformanceLabelRow[];
  } catch {
    return [];
  }
}

export async function fetchFormulaTrendTemplates(): Promise<FormulaTrendTemplateRow[]> {
  try {
    const withTitle = await supabase
      .from('formula_trend_templates')
      .select('tier,outlook,timeframe,title,description');
    if (!withTitle.error && withTitle.data?.length) return withTitle.data as FormulaTrendTemplateRow[];

    // Backward compatibility before title column exists.
    const legacy = await supabase
      .from('formula_trend_templates')
      .select('tier,outlook,timeframe,description');
    if (legacy.error || !legacy.data?.length) return [];
    return (legacy.data as Omit<FormulaTrendTemplateRow, 'title'>[]).map((r) => ({ ...r, title: undefined }));
  } catch {
    return [];
  }
}

export async function fetchFormulaNumericSettings(
  keys: FormulaNumericKey[] = [...NUMERIC_KEYS],
): Promise<Partial<Record<FormulaNumericKey, number>>> {
  try {
    const { data, error } = await supabase.from('formula_settings').select('key,value').in('key', keys);
    if (error || !data) return {};
    const out: Partial<Record<FormulaNumericKey, number>> = {};
    for (const row of data as { key: string; value: number }[]) {
      const k = row.key as FormulaNumericKey;
      if (NUMERIC_KEYS.includes(k)) {
        const n = Number(row.value);
        if (Number.isFinite(n)) out[k] = n;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function mergeFormulaDefaults(
  partial: Partial<Record<FormulaNumericKey, number>>,
): Record<FormulaNumericKey, number> {
  const merged = { ...DEFAULT_FORMULA_NUMBERS, ...partial };
  // `extended_threshold` is a price-vs-EMA fraction (e.g. 0.05 = +5%), not a trend-score cutoff.
  if (!Number.isFinite(merged.extended_threshold) || merged.extended_threshold <= 0) {
    merged.extended_threshold = DEFAULT_FORMULA_NUMBERS.extended_threshold;
  } else if (merged.extended_threshold > 1) {
    // Legacy misconfig treated this as a score (≥ ~4). Clamp to the price-fraction default.
    merged.extended_threshold = DEFAULT_FORMULA_NUMBERS.extended_threshold;
  }
  if (!Number.isFinite(merged.score_weak) || merged.score_weak < 0) {
    merged.score_weak = DEFAULT_FORMULA_NUMBERS.score_weak;
  }
  return merged;
}
