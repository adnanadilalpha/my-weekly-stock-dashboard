'use server';

import { getAdminSupabase } from '@/lib/server/supabase-admin';
import { err, ok, withAdmin, type ActionResult } from './_shared';

export type FormulaSetting = {
  key: string;
  value: number;
  category: string;
  label: string;
  description: string | null;
  default_value: number;
  min_value: number | null;
  max_value: number | null;
  updated_at: string;
  updated_by: string | null;
};

export type FormulaHistoryRow = {
  id: number;
  key: string;
  old_value: number | null;
  new_value: number;
  changed_by: string;
  changed_at: string;
  note: string | null;
};

export type FormulaRatingTier = 'strong_bull' | 'bull' | 'neutral' | 'bear' | 'strong_bear';

export type FormulaRatingLabelRow = {
  tier: FormulaRatingTier;
  label: string;
  description: string;
  color_hex: string;
  updated_at: string;
  updated_by: string | null;
};

export type FormulaPerformanceStrength = 'Strong' | 'Mixed' | 'Weak';

export type FormulaPerformanceLabelRow = {
  strength: FormulaPerformanceStrength;
  label: string;
  description: string;
  updated_at: string;
  updated_by: string | null;
};

export type FormulaTrendOutlook = 'Extended' | 'Stable' | 'Cooling' | 'Reversing' | 'Firming' | 'Softening' | 'Warming';
export type FormulaTrendTimeframe = 'Weekly' | 'Daily';
export type FormulaPerformanceDistance = 'Close to Highs' | 'Medium distance to Highs' | 'Far from Highs';
export type FormulaBenchmarkRelation = 'Leading' | 'In line' | 'Lagging';

export type FormulaTrendTemplateRow = {
  tier: FormulaRatingTier;
  outlook: FormulaTrendOutlook;
  timeframe: FormulaTrendTimeframe;
  title: string;
  description: string;
  updated_at: string;
  updated_by: string | null;
};

export type FormulaPerformanceTemplateRow = {
  strength: FormulaPerformanceStrength;
  distance_to_highs: FormulaPerformanceDistance;
  benchmark_relation: FormulaBenchmarkRelation;
  label: string;
  description: string;
  updated_at: string;
  updated_by: string | null;
};

const RATING_TIERS: FormulaRatingTier[] = ['strong_bull', 'bull', 'neutral', 'bear', 'strong_bear'];

const DEFAULT_RATING_COPY: { tier: FormulaRatingTier; label: string; description: string; color_hex: string }[] = [
  { tier: 'strong_bull', label: 'Strong Uptrend', description: 'Momentum is strongly aligned to the upside with clear trend leadership.', color_hex: '#16a34a' },
  { tier: 'bull', label: 'Uptrend', description: 'Trend remains positive with constructive follow-through above key averages.', color_hex: '#22c55e' },
  { tier: 'neutral', label: 'Sideways', description: 'Mixed signals with no decisive directional edge.', color_hex: '#f59e0b' },
  { tier: 'bear', label: 'Downtrend', description: 'Bearish pressure is present with price below key moving averages.', color_hex: '#f97316' },
  { tier: 'strong_bear', label: 'Strong Downtrend', description: 'Heavy downside alignment with persistent bearish momentum.', color_hex: '#ef4444' },
];

const PERFORMANCE_STRENGTHS: FormulaPerformanceStrength[] = ['Strong', 'Mixed', 'Weak'];
const PERFORMANCE_DISTANCES: FormulaPerformanceDistance[] = ['Close to Highs', 'Medium distance to Highs', 'Far from Highs'];
const BENCHMARK_RELATIONS: FormulaBenchmarkRelation[] = ['Leading', 'In line', 'Lagging'];

const DEFAULT_PERFORMANCE_COPY: FormulaPerformanceLabelRow[] = [
  {
    strength: 'Strong',
    label: 'Strong performer',
    description: 'This ticker is currently showing strong performance and is close to highs.',
    updated_at: new Date(0).toISOString(),
    updated_by: null,
  },
  {
    strength: 'Mixed',
    label: 'Mixed performer',
    description: 'This ticker is currently showing mixed performance and is far below highs.',
    updated_at: new Date(0).toISOString(),
    updated_by: null,
  },
  {
    strength: 'Weak',
    label: 'Weak performer',
    description: 'This ticker is currently showing weak performance and is far below highs.',
    updated_at: new Date(0).toISOString(),
    updated_by: null,
  },
];

const DEFAULT_TREND_TEMPLATE_MATRIX: {
  tier: FormulaRatingTier;
  outlook: FormulaTrendOutlook;
  title: string;
  description: string;
}[] = [
  { tier: 'strong_bull', outlook: 'Extended', title: 'Strong Uptrend', description: 'Momentum is undoubtedly aligned to the upside, with price well above both EMAs. The trend is powerful but stretched, showing signs of short-term overextension. A brief pause or pullback would be typical before trend continuation.' },
  { tier: 'strong_bull', outlook: 'Stable', title: 'Strong Uptrend', description: 'Momentum signals are fully aligned to the upside, with price trading above both EMAs. Price action is healthy, confirming trend strength with limited signs of exhaustion. Continuation is the base case as long as price holds above the 9-day EMA, which serves as the short-term anchor.' },
  { tier: 'strong_bull', outlook: 'Cooling', title: 'Strong Uptrend', description: 'The broader trend remains bullish, with price still above the medium-term EMAs. Momentum has cooled as price slipped below or close to the 9-day EMA. A test of the 21-day EMA could be in play and will be a key level for bulls to defend to maintain trend structure.' },
  { tier: 'strong_bull', outlook: 'Reversing', title: 'Strong Uptrend', description: 'The broader uptrend has weakened materially, with price breaking below the 21-day EMA. Momentum is shifting to the downside, and buyers are losing control. A confirmed reversal would occur if the 9-day EMA crosses below the 21-day EMA.' },
  { tier: 'bull', outlook: 'Extended', title: 'Uptrend', description: 'Momentum is firmly positive, with price well above both EMAs. The trend has run hot in recently, showing signs of short-term overextension. A period of consolidation or sideways movement would be healthy to let averages catch up and sustain the uptrend.' },
  { tier: 'bull', outlook: 'Stable', title: 'Uptrend', description: 'The uptrend is intact, with price holding above key EMAs. Momentum is steady, showing balanced strength without signs of excess. As long as price stays above the 9-day EMA, the trend should continue gradually higher.' },
  { tier: 'bull', outlook: 'Cooling', title: 'Uptrend', description: 'The uptrend remains mostly positive, but momentum has slowed down recently. Price has slipped below the 9-day EMA and needs to reclaim it to avoid deeper consolidation. Failure to do so would likely trigger a test of the 21-day EMA, a key trend line for bulls to defend.' },
  { tier: 'bull', outlook: 'Reversing', title: 'Uptrend', description: 'The broader uptrend has weakened materially, with price breaking below the 21-day EMA. Momentum is shifting to the downside, and buyers are losing control. A confirmed reversal would occur if the 9-day EMA crosses below the 21-day EMA.' },
  { tier: 'neutral', outlook: 'Firming', title: 'Sideways', description: 'The broader trend is mixed, but momentum is slighlty tilting to the upside. Price is holding above the 21-day EMA, suggesting buyers are in modest control. A sustained move above recent highs could confirm a new upward phase.' },
  { tier: 'neutral', outlook: 'Stable', title: 'Sideways', description: 'Momentum signals are mixed, with price action lacking clear direction. A decisive and sustain move above or below the 21-day EMA would be a first indication on how this get resolved. Patience is important here to avoid being trapped in a fake move.' },
  { tier: 'neutral', outlook: 'Softening', title: 'Sideways', description: 'Momentum is mixed, but signals are somewhat weakening. Price has slipped below the 21-day EMA, giving a slight downside bias. Further weakness below recent lows would confirm the downtrend direction.' },
  { tier: 'bear', outlook: 'Extended', title: 'Downtrend', description: 'Momentum is bearish, though price has fallen too far, too fast. Conditions are stretched, increasing the odds of a short-term bounce or consolidation. Any recovery should be viewed as temporary unless price reclaims both EMAs.' },
  { tier: 'bear', outlook: 'Stable', title: 'Downtrend', description: 'The trend is bearish, with price below both EMAs. Momentum is steady on the downside, showing balanced weakness. Continuation lower remains likely unless price reclaims the 9-day EMA.' },
  { tier: 'bear', outlook: 'Warming', title: 'Downtrend', description: 'The broader downtrend remains, but momentum is improving modestly. Price is testing or slightly above the 9-day EMA. Holding above that level could open the door for a run towards the 21-day EMA, usually the real test for bulls.' },
  { tier: 'bear', outlook: 'Reversing', title: 'Downtrend', description: 'The downtrend is losing steam, with price reclaiming the 21-day EMA. Momentum is attempting to turn positive, hinting at an early trend shift. A confirmed reversal would occur if the 9-day EMA crosses back above the 21-day EMA.' },
  { tier: 'strong_bear', outlook: 'Extended', title: 'Strong Downtrend', description: 'Momentum is largely negative, but the move has become stretched. Price is trading well below both EMAs, suggesting downside exhaustion may be near. A short-term rebound or consolidation would be typical before a potential other leg down.' },
  { tier: 'strong_bear', outlook: 'Stable', title: 'Strong Downtrend', description: 'Momentum signals arealigned to the downside, with price trading well below both EMAs. The trend is stable, showing no signs of exhaustion yet. Continuation lower is likely as long as price stays below the 9-day EMA.' },
  { tier: 'strong_bear', outlook: 'Warming', title: 'Strong Downtrend', description: 'The dominant downtrend is intact, but momentum is improving. Price has reclaimed the 9-day EMA, and a sustained recovery above that level could trigger a broader rebound phase.' },
  { tier: 'strong_bear', outlook: 'Reversing', title: 'Strong Downtrend', description: 'The downtrend is losing steam, with price reclaiming the 21-day EMA. Momentum is attempting to turn positive, hinting at an early trend shift. A confirmed reversal would occur if the 9-day EMA crosses back above the 21-day EMA.' },
];

const DEFAULT_TREND_TEMPLATES: FormulaTrendTemplateRow[] = DEFAULT_TREND_TEMPLATE_MATRIX.flatMap((row) =>
  (['Weekly', 'Daily'] as const).map((timeframe) => ({
    ...row,
    timeframe,
    updated_at: new Date(0).toISOString(),
    updated_by: null,
  }))
);

const DEFAULT_PERFORMANCE_TEMPLATES: FormulaPerformanceTemplateRow[] = PERFORMANCE_STRENGTHS.flatMap((strength) =>
  PERFORMANCE_DISTANCES.flatMap((distance_to_highs) =>
    BENCHMARK_RELATIONS.map((benchmark_relation) => ({
      strength,
      distance_to_highs,
      benchmark_relation,
      label:
        strength === 'Strong' ? 'Strong performer' : strength === 'Mixed' ? 'Mixed performer' : 'Weak performer',
      description: `${strength} performer currently ${benchmark_relation.toLowerCase()} benchmarks and ${distance_to_highs.toLowerCase()}.`,
      updated_at: new Date(0).toISOString(),
      updated_by: null,
    }))
  )
);

function validateKey(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (!/^[a-z0-9_]{2,64}$/.test(v)) return null;
  return v;
}
function validateNumber(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}

function normalizeHexColor(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

function normalizePerformanceStrength(v: unknown): FormulaPerformanceStrength | null {
  if (v === 'Strong' || v === 'Mixed' || v === 'Weak') return v;
  return null;
}

export async function listFormulaRatingLabelsAction(accessToken: string): Promise<ActionResult<FormulaRatingLabelRow[]>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    let { data, error } = await admin
      .from('formula_rating_labels')
      .select('tier,label,description,color_hex,updated_at,updated_by')
      .order('tier', { ascending: true });
    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      // Backward compatibility: DB may not have color_hex yet.
      if (msg.includes('color_hex') && msg.includes('column')) {
        const legacy = await admin
          .from('formula_rating_labels')
          .select('tier,label,description,updated_at,updated_by')
          .order('tier', { ascending: true });
        if (!legacy.error) {
          data = (legacy.data ?? []).map((r) => {
            const fallback = DEFAULT_RATING_COPY.find((d) => d.tier === r.tier)?.color_hex ?? '#22c55e';
            return { ...r, color_hex: fallback };
          });
          error = null;
        }
      }
    }
    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('relation') || msg.includes('does not exist') || msg.includes('schema cache')) {
        const now = new Date(0).toISOString();
        return ok(
          DEFAULT_RATING_COPY.map((r) => ({
            tier: r.tier,
            label: r.label,
            description: r.description,
            color_hex: r.color_hex,
            updated_at: now,
            updated_by: null,
          }))
        );
      }
      return err('Failed to load rating labels.', 'db_error');
    }
    const rows = (data ?? []) as FormulaRatingLabelRow[];
    if (rows.length === 0) {
      const now = new Date(0).toISOString();
      return ok(
        DEFAULT_RATING_COPY.map((r) => ({
          tier: r.tier,
          label: r.label,
          description: r.description,
          color_hex: r.color_hex,
          updated_at: now,
          updated_by: null,
        }))
      );
    }
    const byTier = new Map(rows.map((r) => [r.tier, r]));
    const ordered: FormulaRatingLabelRow[] = [];
    const fallbackAt = new Date(0).toISOString();
    for (const t of RATING_TIERS) {
      const r = byTier.get(t);
      if (r) ordered.push(r);
      else {
        const d = DEFAULT_RATING_COPY.find((x) => x.tier === t)!;
        ordered.push({
          tier: t,
          label: d.label,
          description: d.description,
          color_hex: d.color_hex,
          updated_at: fallbackAt,
          updated_by: null,
        });
      }
    }
    return ok(ordered);
  });
}

export async function upsertFormulaRatingLabelsAction(
  accessToken: string,
  input: { rows: { tier: FormulaRatingTier; label: string; description: string; color_hex: string }[] }
): Promise<ActionResult<{ saved: number }>> {
  return withAdmin(accessToken, async (ctx) => {
    if (!Array.isArray(input?.rows) || input.rows.length === 0) return err('No rows provided.', 'validation');
    if (input.rows.length > 10) return err('Too many rows.', 'validation');

    const admin = getAdminSupabase();
    const now = new Date().toISOString();

    for (const raw of input.rows) {
      if (!RATING_TIERS.includes(raw.tier)) return err('Invalid tier.', 'validation');
      const label = typeof raw.label === 'string' ? raw.label.trim() : '';
      const description = typeof raw.description === 'string' ? raw.description.trim() : '';
      const colorHex = normalizeHexColor(raw.color_hex);
      if (label.length < 1 || label.length > 80) return err(`Invalid label for ${raw.tier}.`, 'validation');
      if (description.length > 500) return err(`Description too long for ${raw.tier}.`, 'validation');
      if (!colorHex) return err(`Invalid color for ${raw.tier}. Use #RRGGBB format.`, 'validation');

      let { error } = await admin
        .from('formula_rating_labels')
        .upsert(
          { tier: raw.tier, label, description, color_hex: colorHex, updated_at: now, updated_by: ctx.email },
          { onConflict: 'tier' }
        );
      if (error) {
        const msg = (error.message ?? '').toLowerCase();
        // Backward compatibility: allow saves before color_hex migration is applied.
        if (msg.includes('color_hex') && msg.includes('column')) {
          const legacy = await admin
            .from('formula_rating_labels')
            .upsert(
              { tier: raw.tier, label, description, updated_at: now, updated_by: ctx.email },
              { onConflict: 'tier' }
            );
          error = legacy.error;
        }
      }
      if (error) return err('Failed to save rating labels.', 'db_error');
    }

    return ok({ saved: input.rows.length });
  });
}

export async function resetFormulaRatingLabelsAction(accessToken: string): Promise<ActionResult<{ saved: number }>> {
  return withAdmin(accessToken, async (ctx) => {
    const admin = getAdminSupabase();
    const now = new Date().toISOString();
    for (const row of DEFAULT_RATING_COPY) {
      let { error } = await admin
        .from('formula_rating_labels')
        .upsert(
          {
            tier: row.tier,
            label: row.label,
            description: row.description,
            color_hex: row.color_hex,
            updated_at: now,
            updated_by: ctx.email,
          },
          { onConflict: 'tier' }
        );
      if (error) {
        const msg = (error.message ?? '').toLowerCase();
        if (msg.includes('color_hex') && msg.includes('column')) {
          const legacy = await admin
            .from('formula_rating_labels')
            .upsert(
              { tier: row.tier, label: row.label, description: row.description, updated_at: now, updated_by: ctx.email },
              { onConflict: 'tier' }
            );
          error = legacy.error;
        }
      }
      if (error) return err('Failed to reset rating labels.', 'db_error');
    }
    return ok({ saved: DEFAULT_RATING_COPY.length });
  });
}

export async function listFormulaPerformanceLabelsAction(
  accessToken: string
): Promise<ActionResult<FormulaPerformanceLabelRow[]>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('formula_performance_labels')
      .select('strength,label,description,updated_at,updated_by')
      .order('strength', { ascending: true });
    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('relation') || msg.includes('does not exist') || msg.includes('schema cache')) {
        return ok(DEFAULT_PERFORMANCE_COPY);
      }
      return err('Failed to load performance labels.', 'db_error');
    }
    const rows = (data ?? []) as FormulaPerformanceLabelRow[];
    if (rows.length === 0) return ok(DEFAULT_PERFORMANCE_COPY);
    const byStrength = new Map(rows.map((r) => [r.strength, r]));
    const out: FormulaPerformanceLabelRow[] = [];
    for (const strength of PERFORMANCE_STRENGTHS) {
      out.push(byStrength.get(strength) ?? DEFAULT_PERFORMANCE_COPY.find((x) => x.strength === strength)!);
    }
    return ok(out);
  });
}

export async function upsertFormulaPerformanceLabelsAction(
  accessToken: string,
  input: { rows: { strength: FormulaPerformanceStrength; label: string; description: string }[] }
): Promise<ActionResult<{ saved: number }>> {
  return withAdmin(accessToken, async (ctx) => {
    if (!Array.isArray(input?.rows) || input.rows.length === 0) return err('No rows provided.', 'validation');
    if (input.rows.length > 10) return err('Too many rows.', 'validation');
    const admin = getAdminSupabase();
    const now = new Date().toISOString();

    for (const raw of input.rows) {
      const strength = normalizePerformanceStrength(raw.strength);
      if (!strength) return err('Invalid performance strength.', 'validation');
      const label = typeof raw.label === 'string' ? raw.label.trim() : '';
      const description = typeof raw.description === 'string' ? raw.description.trim() : '';
      if (label.length < 1 || label.length > 80) return err(`Invalid label for ${strength}.`, 'validation');
      if (description.length < 1 || description.length > 500) return err(`Invalid description for ${strength}.`, 'validation');

      const { error } = await admin
        .from('formula_performance_labels')
        .upsert(
          { strength, label, description, updated_at: now, updated_by: ctx.email },
          { onConflict: 'strength' }
        );
      if (error) return err('Failed to save performance labels.', 'db_error');
    }

    return ok({ saved: input.rows.length });
  });
}

export async function resetFormulaPerformanceLabelsAction(accessToken: string): Promise<ActionResult<{ saved: number }>> {
  return withAdmin(accessToken, async (ctx) => {
    const admin = getAdminSupabase();
    const now = new Date().toISOString();
    for (const row of DEFAULT_PERFORMANCE_COPY) {
      const { error } = await admin
        .from('formula_performance_labels')
        .upsert(
          { strength: row.strength, label: row.label, description: row.description, updated_at: now, updated_by: ctx.email },
          { onConflict: 'strength' }
        );
      if (error) return err('Failed to reset performance labels.', 'db_error');
    }
    return ok({ saved: DEFAULT_PERFORMANCE_COPY.length });
  });
}

export async function listFormulaTrendTemplatesAction(
  accessToken: string
): Promise<ActionResult<FormulaTrendTemplateRow[]>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    let { data, error } = await admin
      .from('formula_trend_templates')
      .select('tier,outlook,timeframe,title,description,updated_at,updated_by')
      .order('tier', { ascending: true })
      .order('outlook', { ascending: true })
      .order('timeframe', { ascending: true });
    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('title') && msg.includes('column')) {
        const legacy = await admin
          .from('formula_trend_templates')
          .select('tier,outlook,timeframe,description,updated_at,updated_by')
          .order('tier', { ascending: true })
          .order('outlook', { ascending: true })
          .order('timeframe', { ascending: true });
        if (!legacy.error) {
          const titleByKey = new Map(
            DEFAULT_TREND_TEMPLATES.map((r) => [`${r.tier}|${r.outlook}|${r.timeframe}`, r.title])
          );
          data = (legacy.data ?? []).map((r) => ({
            ...r,
            title: titleByKey.get(`${r.tier}|${r.outlook}|${r.timeframe}`) ?? String(r.tier),
          }));
          error = null;
        }
      }
    }
    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('relation') || msg.includes('does not exist') || msg.includes('schema cache')) {
        return ok(DEFAULT_TREND_TEMPLATES);
      }
      return err('Failed to load trend templates.', 'db_error');
    }
    const titleByKey = new Map(
      DEFAULT_TREND_TEMPLATES.map((r) => [`${r.tier}|${r.outlook}|${r.timeframe}`, r.title])
    );
    const rows = ((data ?? []) as FormulaTrendTemplateRow[]).map((row) => ({
      ...row,
      title:
        typeof row.title === 'string' && row.title.trim()
          ? row.title.trim()
          : titleByKey.get(`${row.tier}|${row.outlook}|${row.timeframe}`) ?? String(row.tier),
    }));
    if (rows.length === 0) return ok(DEFAULT_TREND_TEMPLATES);
    return ok(rows);
  });
}

export async function upsertFormulaTrendTemplatesAction(
  accessToken: string,
  input: { rows: { tier: FormulaRatingTier; outlook: FormulaTrendOutlook; weekly_title: string; daily_title: string; weekly: string; daily: string }[] }
): Promise<ActionResult<{ saved: number }>> {
  return withAdmin(accessToken, async (ctx) => {
    if (!Array.isArray(input?.rows) || input.rows.length === 0) return err('No rows provided.', 'validation');
    const admin = getAdminSupabase();
    const now = new Date().toISOString();
    let saved = 0;
    for (const raw of input.rows) {
      const weeklyTitle = typeof raw.weekly_title === 'string' ? raw.weekly_title.trim() : '';
      const dailyTitle = typeof raw.daily_title === 'string' ? raw.daily_title.trim() : '';
      const weekly = typeof raw.weekly === 'string' ? raw.weekly.trim() : '';
      const daily = typeof raw.daily === 'string' ? raw.daily.trim() : '';
      if (!weeklyTitle || !dailyTitle) return err('Weekly and daily titles are required.', 'validation');
      if (!weekly || !daily) return err('Weekly and daily descriptions are required.', 'validation');
      if (weeklyTitle.length > 120 || dailyTitle.length > 120) return err('Trend template title is too long.', 'validation');
      for (const [timeframe, title, description] of [['Weekly', weeklyTitle, weekly], ['Daily', dailyTitle, daily]] as const) {
        const { error } = await admin
          .from('formula_trend_templates')
          .upsert(
            { tier: raw.tier, outlook: raw.outlook, timeframe, title, description, updated_at: now, updated_by: ctx.email },
            { onConflict: 'tier,outlook,timeframe' }
          );
        if (error) return err('Failed to save trend templates.', 'db_error');
        saved += 1;
      }
    }
    return ok({ saved });
  });
}

export async function resetFormulaTrendTemplatesAction(accessToken: string): Promise<ActionResult<{ saved: number }>> {
  return withAdmin(accessToken, async (ctx) => {
    const admin = getAdminSupabase();
    const now = new Date().toISOString();
    for (const row of DEFAULT_TREND_TEMPLATES) {
      const { error } = await admin
        .from('formula_trend_templates')
        .upsert(
          { ...row, updated_at: now, updated_by: ctx.email },
          { onConflict: 'tier,outlook,timeframe' }
        );
      if (error) return err('Failed to reset trend templates.', 'db_error');
    }
    return ok({ saved: DEFAULT_TREND_TEMPLATES.length });
  });
}

export async function listFormulaPerformanceTemplatesAction(
  accessToken: string
): Promise<ActionResult<FormulaPerformanceTemplateRow[]>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('formula_performance_templates')
      .select('strength,distance_to_highs,benchmark_relation,label,description,updated_at,updated_by')
      .order('strength', { ascending: true })
      .order('distance_to_highs', { ascending: true })
      .order('benchmark_relation', { ascending: true });
    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('relation') || msg.includes('does not exist') || msg.includes('schema cache')) {
        return ok(DEFAULT_PERFORMANCE_TEMPLATES);
      }
      return err('Failed to load performance templates.', 'db_error');
    }
    const rows = (data ?? []) as FormulaPerformanceTemplateRow[];
    if (rows.length === 0) return ok(DEFAULT_PERFORMANCE_TEMPLATES);
    return ok(rows);
  });
}

export async function upsertFormulaPerformanceTemplatesAction(
  accessToken: string,
  input: { rows: { strength: FormulaPerformanceStrength; distance_to_highs: FormulaPerformanceDistance; benchmark_relation: FormulaBenchmarkRelation; label: string; description: string }[] }
): Promise<ActionResult<{ saved: number }>> {
  return withAdmin(accessToken, async (ctx) => {
    if (!Array.isArray(input?.rows) || input.rows.length === 0) return err('No rows provided.', 'validation');
    const admin = getAdminSupabase();
    const now = new Date().toISOString();
    for (const raw of input.rows) {
      const label = typeof raw.label === 'string' ? raw.label.trim() : '';
      const description = typeof raw.description === 'string' ? raw.description.trim() : '';
      if (!label || !description) return err('Label and description are required.', 'validation');
      const { error } = await admin
        .from('formula_performance_templates')
        .upsert(
          { ...raw, label, description, updated_at: now, updated_by: ctx.email },
          { onConflict: 'strength,distance_to_highs,benchmark_relation' }
        );
      if (error) return err('Failed to save performance templates.', 'db_error');
    }
    return ok({ saved: input.rows.length });
  });
}

export async function resetFormulaPerformanceTemplatesAction(accessToken: string): Promise<ActionResult<{ saved: number }>> {
  return withAdmin(accessToken, async (ctx) => {
    const admin = getAdminSupabase();
    const now = new Date().toISOString();
    for (const row of DEFAULT_PERFORMANCE_TEMPLATES) {
      const { error } = await admin
        .from('formula_performance_templates')
        .upsert(
          { ...row, updated_at: now, updated_by: ctx.email },
          { onConflict: 'strength,distance_to_highs,benchmark_relation' }
        );
      if (error) return err('Failed to reset performance templates.', 'db_error');
    }
    return ok({ saved: DEFAULT_PERFORMANCE_TEMPLATES.length });
  });
}

export async function listFormulaSettingsAction(accessToken: string): Promise<ActionResult<FormulaSetting[]>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('formula_settings')
      .select('*')
      .order('category', { ascending: true })
      .order('key', { ascending: true });
    if (error) return err('Failed to load formula settings.', 'db_error');
    return ok((data ?? []) as FormulaSetting[]);
  });
}

export async function listFormulaHistoryAction(
  accessToken: string,
  input?: { limit?: number }
): Promise<ActionResult<FormulaHistoryRow[]>> {
  return withAdmin(accessToken, async () => {
    const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('formula_history')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(limit);
    if (error) return err('Failed to load history.', 'db_error');
    return ok((data ?? []) as FormulaHistoryRow[]);
  });
}

export async function updateFormulaSettingsAction(
  accessToken: string,
  input: { changes: { key: string; value: number }[]; note?: string }
): Promise<ActionResult<{ updated: number }>> {
  return withAdmin(accessToken, async (ctx) => {
    if (!Array.isArray(input?.changes) || input.changes.length === 0) {
      return err('No changes provided.', 'validation');
    }
    if (input.changes.length > 50) return err('Too many changes in one request.', 'validation');

    const admin = getAdminSupabase();

    // Load current settings to validate bounds and build history.
    const { data: current, error: loadErr } = await admin
      .from('formula_settings')
      .select('key, value, min_value, max_value');
    if (loadErr) return err('Failed to load current settings.', 'db_error');
    const currentMap = new Map<string, { value: number; min_value: number | null; max_value: number | null }>();
    for (const row of current ?? []) {
      currentMap.set(row.key, { value: Number(row.value), min_value: row.min_value, max_value: row.max_value });
    }

    type Prepared = { key: string; old_value: number; new_value: number };
    const prepared: Prepared[] = [];

    for (const raw of input.changes) {
      const key = validateKey(raw?.key);
      const value = validateNumber(raw?.value);
      if (!key || value === null) return err(`Invalid change for ${String(raw?.key)}.`, 'validation');
      const existing = currentMap.get(key);
      if (!existing) return err(`Unknown setting: ${key}.`, 'validation');
      if (existing.min_value !== null && value < Number(existing.min_value)) {
        return err(`Value for ${key} below minimum (${existing.min_value}).`, 'validation');
      }
      if (existing.max_value !== null && value > Number(existing.max_value)) {
        return err(`Value for ${key} above maximum (${existing.max_value}).`, 'validation');
      }
      if (value === existing.value) continue; // no-op
      prepared.push({ key, old_value: existing.value, new_value: value });
    }

    if (prepared.length === 0) return ok({ updated: 0 });

    const now = new Date().toISOString();
    for (const p of prepared) {
      const { error: upErr } = await admin
        .from('formula_settings')
        .update({ value: p.new_value, updated_at: now, updated_by: ctx.email })
        .eq('key', p.key);
      if (upErr) return err(`Failed to update ${p.key}.`, 'db_error');
    }

    const historyRows = prepared.map((p) => ({
      key: p.key,
      old_value: p.old_value,
      new_value: p.new_value,
      changed_by: ctx.email,
      note: typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 500) : null,
    }));
    const { error: histErr } = await admin.from('formula_history').insert(historyRows);
    if (histErr) return err('Updates saved but audit log insert failed.', 'audit_error');

    return ok({ updated: prepared.length });
  });
}

export async function resetFormulaSettingsAction(accessToken: string): Promise<ActionResult<{ reset: number }>> {
  return withAdmin(accessToken, async (ctx) => {
    const admin = getAdminSupabase();
    const { data: rows, error: loadErr } = await admin
      .from('formula_settings')
      .select('key, value, default_value');
    if (loadErr) return err('Failed to load settings.', 'db_error');

    const needReset = (rows ?? []).filter((r) => Number(r.value) !== Number(r.default_value));
    if (needReset.length === 0) return ok({ reset: 0 });

    const now = new Date().toISOString();
    for (const r of needReset) {
      const { error: upErr } = await admin
        .from('formula_settings')
        .update({ value: r.default_value, updated_at: now, updated_by: ctx.email })
        .eq('key', r.key);
      if (upErr) return err(`Failed to reset ${r.key}.`, 'db_error');
    }

    const historyRows = needReset.map((r) => ({
      key: r.key,
      old_value: r.value,
      new_value: r.default_value,
      changed_by: ctx.email,
      note: 'reset_to_default',
    }));
    await admin.from('formula_history').insert(historyRows);

    return ok({ reset: needReset.length });
  });
}
