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
  updated_at: string;
  updated_by: string | null;
};

const RATING_TIERS: FormulaRatingTier[] = ['strong_bull', 'bull', 'neutral', 'bear', 'strong_bear'];

const DEFAULT_RATING_COPY: { tier: FormulaRatingTier; label: string; description: string }[] = [
  { tier: 'strong_bull', label: 'Strong Bull', description: 'Positive momentum — trending above key EMAs and strong composite score.' },
  { tier: 'bull', label: 'Bull', description: 'Constructive bias — composite score in the upper mid range.' },
  { tier: 'neutral', label: 'Neutral', description: 'Balanced positioning — mixed signals across components.' },
  { tier: 'bear', label: 'Bear', description: 'Cautious bias — composite score in the lower mid range.' },
  { tier: 'strong_bear', label: 'Strong Bear', description: 'Defensive — weak composite score vs thresholds.' },
];

function validateKey(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (!/^[a-z0-9_]{2,64}$/.test(v)) return null;
  return v;
}
function validateNumber(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}

export async function listFormulaRatingLabelsAction(accessToken: string): Promise<ActionResult<FormulaRatingLabelRow[]>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('formula_rating_labels')
      .select('tier,label,description,updated_at,updated_by')
      .order('tier', { ascending: true });
    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('relation') || msg.includes('does not exist') || msg.includes('schema cache')) {
        const now = new Date(0).toISOString();
        return ok(
          DEFAULT_RATING_COPY.map((r) => ({
            tier: r.tier,
            label: r.label,
            description: r.description,
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
  input: { rows: { tier: FormulaRatingTier; label: string; description: string }[] }
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
      if (label.length < 1 || label.length > 80) return err(`Invalid label for ${raw.tier}.`, 'validation');
      if (description.length > 500) return err(`Description too long for ${raw.tier}.`, 'validation');

      const { error } = await admin
        .from('formula_rating_labels')
        .upsert(
          { tier: raw.tier, label, description, updated_at: now, updated_by: ctx.email },
          { onConflict: 'tier' }
        );
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
      const { error } = await admin
        .from('formula_rating_labels')
        .upsert(
          { tier: row.tier, label: row.label, description: row.description, updated_at: now, updated_by: ctx.email },
          { onConflict: 'tier' }
        );
      if (error) return err('Failed to reset rating labels.', 'db_error');
    }
    return ok({ saved: DEFAULT_RATING_COPY.length });
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
