'use client';

import {
  Clock,
  History,
  Hash,
  Minus,
  PencilLine,
  Plus,
  Save,
  SlidersHorizontal,
  Tag,
  TrendingUp,
  Undo2,
  Waves,
  Eye,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listFormulaHistoryAction,
  listFormulaRatingLabelsAction,
  listFormulaSettingsAction,
  resetFormulaRatingLabelsAction,
  resetFormulaSettingsAction,
  updateFormulaSettingsAction,
  upsertFormulaRatingLabelsAction,
  type FormulaHistoryRow,
  type FormulaRatingLabelRow,
  type FormulaRatingTier,
  type FormulaSetting,
} from '../../_actions/formulas';
import { useAdmin } from '../../_lib/admin-context';

type CategoryKey = FormulaSetting['category'];
type NavCategory = CategoryKey | 'rating_labels';

const RATING_ORDER: FormulaRatingTier[] = ['strong_bull', 'bull', 'neutral', 'bear', 'strong_bear'];

const NAV_META: {
  id: NavCategory;
  title: string;
  subtitle: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  countKey: 'rating' | 'category';
}[] = [
  {
    id: 'rating_labels',
    title: 'Rating Labels',
    subtitle: 'Customize label text, thresholds, and colors.',
    icon: Tag,
    countKey: 'rating',
  },
  {
    id: 'scoring_weights',
    title: 'Scoring Weights',
    subtitle: 'SUMPRODUCT weights for 5 components',
    icon: SlidersHorizontal,
    countKey: 'category',
  },
  {
    id: 'return_thresholds',
    title: 'Return Thresholds',
    subtitle: '1M, 3M and vs 1Y High return cutoffs',
    icon: TrendingUp,
    countKey: 'category',
  },
  {
    id: 'ema_periods',
    title: 'EMA Periods',
    subtitle: 'EMA periods for weekly and daily calculations',
    icon: Waves,
    countKey: 'category',
  },
  {
    id: 'score_breakpoints',
    title: 'Score Breakpoints',
    subtitle: 'Rating tier thresholds',
    icon: Eye,
    countKey: 'category',
  },
  {
    id: 'formula_constants',
    title: 'Formula Constants',
    subtitle: 'Core formula parameters and divisors',
    icon: Hash,
    countKey: 'category',
  },
];

const LEGEND: { tier: FormulaRatingTier; label: string; className: string }[] = [
  { tier: 'strong_bull', label: 'Strong Bull', className: 'bg-green-800 text-white' },
  { tier: 'bull', label: 'Bull', className: 'bg-green-100 text-green-900' },
  { tier: 'neutral', label: 'Neutral', className: 'bg-amber-100 text-amber-900' },
  { tier: 'bear', label: 'Bear', className: 'bg-orange-100 text-orange-900' },
  { tier: 'strong_bear', label: 'Strong Bear', className: 'bg-red-100 text-red-800' },
];

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function scoreRuleText(
  tier: FormulaRatingTier,
  p: { score_strong: number; score_mixed_high: number; score_mixed_low: number; score_weak: number }
): string {
  switch (tier) {
    case 'strong_bull':
      return `≥ ${p.score_strong}`;
    case 'bull':
      return `≥ ${p.score_mixed_high}`;
    case 'neutral':
      return `≥ ${p.score_mixed_low}`;
    case 'bear':
      return `≥ ${p.score_weak}`;
    case 'strong_bear':
      return `< ${p.score_weak}`;
    default:
      return '—';
  }
}

function readScoreParams(drafts: Record<string, string>, settings: FormulaSetting[]) {
  const val = (key: string, fallback: number) => {
    const d = drafts[key];
    if (d !== undefined) {
      const n = Number(d);
      if (Number.isFinite(n)) return n;
    }
    const s = settings.find((x) => x.key === key);
    return s ? Number(s.value) : fallback;
  };
  return {
    score_strong: val('score_strong', 3.9),
    score_mixed_high: val('score_mixed_high', 2.7),
    score_mixed_low: val('score_mixed_low', 1.8),
    score_weak: val('score_weak', 0.9),
  };
}

export default function FormulaManager() {
  const { getAccessToken } = useAdmin();
  const [settings, setSettings] = useState<FormulaSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [ratingRows, setRatingRows] = useState<FormulaRatingLabelRow[]>([]);
  const [ratingEditTier, setRatingEditTier] = useState<FormulaRatingTier | null>(null);
  const [ratingModalLabel, setRatingModalLabel] = useState('');
  const [ratingModalDescription, setRatingModalDescription] = useState('');
  const [ratingModalError, setRatingModalError] = useState<string | null>(null);
  const [ratingModalSaving, setRatingModalSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<NavCategory>('rating_labels');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<FormulaHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const [fRes, rRes] = await Promise.all([listFormulaSettingsAction(token), listFormulaRatingLabelsAction(token)]);
      if (fRes.ok) {
        setSettings(fRes.data);
        const map: Record<string, string> = {};
        for (const s of fRes.data) map[s.key] = String(s.value);
        setDrafts(map);
      } else {
        setError(fRes.error);
      }
      if (rRes.ok) setRatingRows(rRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const byCategory = useMemo(() => {
    const map = new Map<CategoryKey, FormulaSetting[]>();
    for (const s of settings) {
      const arr = map.get(s.category as CategoryKey) ?? [];
      arr.push(s);
      map.set(s.category as CategoryKey, arr);
    }
    return map;
  }, [settings]);

  const changedKeys = useMemo(() => {
    const keys: string[] = [];
    for (const s of settings) {
      const draft = drafts[s.key];
      if (draft === undefined) continue;
      const num = Number(draft);
      if (Number.isFinite(num) && num !== Number(s.value)) keys.push(s.key);
    }
    return keys;
  }, [settings, drafts]);

  const activeSettings = byCategory.get(activeNav as CategoryKey) ?? [];
  const scoreParams = useMemo(() => readScoreParams(drafts, settings), [drafts, settings]);

  const onSave = async () => {
    setError(null);
    setFlash(null);
    setSaving(true);
    try {
      const token = await getAccessToken();
      const changes = changedKeys
        .map((k) => ({ key: k, value: Number(drafts[k]) }))
        .filter((c) => Number.isFinite(c.value));
      if (changes.length === 0) {
        setFlash('No changes to save.');
        return;
      }
      const res = await updateFormulaSettingsAction(token, { changes });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFlash(`Saved ${res.data.updated} change${res.data.updated === 1 ? '' : 's'}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    setError(null);
    setFlash(null);
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (activeNav === 'rating_labels') {
        if (!confirm('Reset rating labels and descriptions to defaults?')) return;
        const res = await resetFormulaRatingLabelsAction(token);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setFlash('Rating labels reset to defaults.');
        await load();
        return;
      }
      if (!confirm('Reset all numeric parameters to their default values?')) return;
      const res = await resetFormulaSettingsAction(token);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFlash(`Reset ${res.data.reset} parameter${res.data.reset === 1 ? '' : 's'}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async () => {
    setShowHistory(true);
    setHistoryLoading(true);
    try {
      const token = await getAccessToken();
      const res = await listFormulaHistoryAction(token, { limit: 100 });
      if (res.ok) setHistory(res.data);
    } finally {
      setHistoryLoading(false);
    }
  };

  const navCount = (id: NavCategory) => {
    if (id === 'rating_labels') return 5;
    return byCategory.get(id as CategoryKey)?.length ?? 0;
  };

  const canSave = activeNav !== 'rating_labels' && changedKeys.length > 0;

  const openRatingEditModal = (tier: FormulaRatingTier) => {
    const row = ratingRows.find((r) => r.tier === tier);
    setRatingModalError(null);
    setRatingEditTier(tier);
    setRatingModalLabel(row?.label ?? '');
    setRatingModalDescription(row?.description ?? '');
  };

  const closeRatingEditModal = () => {
    setRatingEditTier(null);
    setRatingModalError(null);
    setRatingModalSaving(false);
  };

  const saveRatingEditModal = async () => {
    if (!ratingEditTier) return;
    const label = ratingModalLabel.trim();
    const description = ratingModalDescription.trim();
    if (label.length < 1 || label.length > 80) {
      setRatingModalError('Label must be 1–80 characters.');
      return;
    }
    if (description.length > 500) {
      setRatingModalError('Description must be at most 500 characters.');
      return;
    }
    setRatingModalError(null);
    setRatingModalSaving(true);
    try {
      const token = await getAccessToken();
      const res = await upsertFormulaRatingLabelsAction(token, {
        rows: [{ tier: ratingEditTier, label, description }],
      });
      if (!res.ok) {
        setRatingModalError(res.error);
        return;
      }
      await load();
      setFlash('Rating label saved.');
      closeRatingEditModal();
    } catch (e) {
      setRatingModalError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setRatingModalSaving(false);
    }
  };

  const bumpWeight = (key: string, delta: number) => {
    const s = settings.find((x) => x.key === key);
    if (!s) return;
    const cur = Number(drafts[key] ?? s.value);
    const next = Math.round((cur + delta) * 100) / 100;
    const min = s.min_value != null ? Number(s.min_value) : -Infinity;
    const max = s.max_value != null ? Number(s.max_value) : Infinity;
    const clamped = Math.min(max, Math.max(min, next));
    setDrafts((d) => ({ ...d, [key]: String(clamped) }));
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <p className="admin-text-muted min-w-0 flex-1 text-sm md:max-w-2xl">
          {activeNav === 'rating_labels'
            ? 'Edit a tier from the table — changes save from the edit dialog.'
            : changedKeys.length === 0
              ? 'No unsaved changes.'
              : `${changedKeys.length} unsaved numeric change${changedKeys.length === 1 ? '' : 's'}.`}
        </p>
        <button
          type="button"
          onClick={openHistory}
          className="admin-border admin-text-muted inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
        >
          <History size={16} />
          History
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {flash && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{flash}</div>}

      <div className="grid min-h-0 min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col gap-3">
          {NAV_META.map((m) => {
            const Icon = m.icon;
            const isActive = activeNav === m.id;
            const count = navCount(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveNav(m.id)}
                className={`w-full rounded-xl border px-4 py-4 text-left transition-colors ${
                  isActive ? 'border-green-700 bg-green-700/5' : 'admin-border bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon size={18} className={isActive ? 'text-green-700' : 'admin-text-muted'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="admin-text-main text-sm font-semibold">{m.title}</p>
                      <span className="shrink-0 text-xs text-slate-400">{count}</span>
                    </div>
                    <p className="admin-text-muted mt-1 text-xs">{m.subtitle}</p>
                  </div>
                </div>
              </button>
            );
          })}
          <div className="admin-border rounded-xl border bg-white px-4 py-4">
            <p className="admin-text-main mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Label colors</p>
            <div className="flex flex-wrap gap-2">
              {LEGEND.map((x) => (
                <span key={x.tier} className={`rounded-md px-2 py-1 text-xs font-medium ${x.className}`}>
                  {x.label}
                </span>
              ))}
            </div>
          </div>
        </aside>

        <section className="admin-card min-h-0 min-w-0 rounded-2xl p-6 shadow-sm">
          <h3 className="admin-text-main text-xl font-semibold">{NAV_META.find((n) => n.id === activeNav)?.title}</h3>

          {loading && <p className="admin-text-muted mt-4 text-sm">Loading…</p>}

          {!loading && activeNav === 'rating_labels' && (
            <div className="mt-4 min-w-0 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="admin-navy text-left text-xs font-semibold uppercase tracking-wide text-white/90">
                  <tr>
                    <th className="px-4 py-3">Score rule</th>
                    <th className="px-4 py-3">Label</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {RATING_ORDER.map((tier) => {
                    const row = ratingRows.find((r) => r.tier === tier);
                    const pill = LEGEND.find((l) => l.tier === tier);
                    const labelText = row?.label?.trim() || '—';
                    const desc = row?.description ?? '';
                    return (
                      <tr key={tier} className="admin-border-soft border-t">
                        <td className="px-4 py-4 font-mono text-sm font-semibold text-gray-900">
                          {scoreRuleText(tier, scoreParams)}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${pill?.className ?? ''}`}>
                            {labelText}
                          </span>
                        </td>
                        <td className="admin-text-muted max-w-md px-4 py-4">
                          <p className="line-clamp-2" title={desc}>
                            {desc || '—'}
                          </p>
                        </td>
                        <td className="admin-text-muted px-4 py-4 text-xs">
                          {row?.updated_at ? formatDateTime(row.updated_at) : '—'}
                          {row?.updated_by && <div className="mt-1">{row.updated_by}</div>}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => openRatingEditModal(tier)}
                            className="admin-border inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-slate-50"
                          >
                            <PencilLine size={14} />
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && activeNav === 'scoring_weights' && (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-green-200 bg-green-700/5 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-800">Current formula</p>
                <p className="mt-2 font-mono text-sm text-green-900 md:text-base">
                  SUMPRODUCT( weights[], component_scores[] ) ÷ 3 × 5
                </p>
              </div>
              <h4 className="admin-text-main text-base font-semibold">Component weights</h4>
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="admin-navy text-left text-xs font-semibold uppercase tracking-wide text-white/90">
                    <tr>
                      <th className="px-4 py-3">Component</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3 text-right">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSettings.map((s) => {
                      const draft = drafts[s.key] ?? String(s.value);
                      return (
                        <tr key={s.key} className="admin-border-soft border-t">
                          <td className="px-4 py-4">
                            <div className="font-semibold text-gray-900">{s.label}</div>
                            <div className="admin-text-muted font-mono text-xs">{s.key}</div>
                          </td>
                          <td className="admin-text-muted max-w-md px-4 py-4">{s.description}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                className="admin-border flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-slate-50"
                                onClick={() => bumpWeight(s.key, -0.1)}
                              >
                                <Minus size={16} />
                              </button>
                              <input
                                value={draft}
                                onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                                className="admin-border h-10 w-24 rounded-lg border px-2 text-center font-mono text-sm"
                                inputMode="decimal"
                              />
                              <button
                                type="button"
                                className="admin-border flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-slate-50"
                                onClick={() => bumpWeight(s.key, 0.1)}
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && activeNav !== 'rating_labels' && activeNav !== 'scoring_weights' && (
            <div className="mt-4 min-w-0 overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="admin-navy text-left text-xs font-semibold uppercase tracking-wide text-white/90">
                  <tr>
                    <th className="px-4 py-4">Parameter</th>
                    <th className="px-4 py-4">Description</th>
                    <th className="px-4 py-4">Default</th>
                    <th className="px-4 py-4">Value</th>
                    <th className="px-4 py-4">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSettings.map((s) => {
                    const draft = drafts[s.key] ?? String(s.value);
                    const draftNum = Number(draft);
                    const invalid =
                      draft !== '' && !Number.isFinite(draftNum)
                        ? 'Invalid number'
                        : s.min_value !== null && draftNum < Number(s.min_value)
                          ? `Min ${s.min_value}`
                          : s.max_value !== null && draftNum > Number(s.max_value)
                            ? `Max ${s.max_value}`
                            : null;
                    const changed = Number.isFinite(draftNum) && draftNum !== Number(s.value);
                    return (
                      <tr key={s.key} className="admin-border-soft border-t text-sm">
                        <td className="admin-text-main px-4 py-4">
                          <div className="font-semibold">{s.label}</div>
                          <div className="admin-text-muted font-mono text-xs">{s.key}</div>
                        </td>
                        <td className="admin-text-muted px-4 py-4">{s.description}</td>
                        <td className="admin-text-muted px-4 py-4 font-mono text-xs">{String(s.default_value)}</td>
                        <td className="px-4 py-4">
                          <input
                            className={`admin-border h-10 w-28 rounded-lg border px-3 text-sm ${
                              invalid ? 'border-red-400' : changed ? 'border-green-600' : ''
                            }`}
                            value={draft}
                            onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                            inputMode="decimal"
                          />
                          {invalid && <div className="mt-2 text-xs text-red-600">{invalid}</div>}
                        </td>
                        <td className="admin-text-muted px-4 py-4 text-xs">
                          <div>{formatDateTime(s.updated_at)}</div>
                          {s.updated_by && <div>{s.updated_by}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {activeNav !== 'rating_labels' && (
              <button
                type="button"
                onClick={onSave}
                disabled={saving || !canSave}
                className="admin-green-bg inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            )}
            <button
              type="button"
              onClick={onReset}
              disabled={saving}
              className="admin-border admin-text-muted inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Undo2 size={16} />
              Reset to Default
            </button>
            <p className="flex w-full items-center gap-2 text-xs text-amber-800 lg:ml-auto lg:w-auto">
              <span aria-hidden>⚠️</span>
              Changes apply to live calculations on the next Edge Function run.
            </p>
          </div>
        </section>
      </div>

      {ratingEditTier && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rating-edit-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="admin-border flex items-center justify-between border-b px-6 py-4">
              <h4 id="rating-edit-title" className="admin-text-main text-base font-semibold">
                Edit rating label — {LEGEND.find((l) => l.tier === ratingEditTier)?.label ?? ratingEditTier}
              </h4>
              <button
                type="button"
                onClick={closeRatingEditModal}
                disabled={ratingModalSaving}
                className="admin-text-muted rounded-lg px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Close
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              {ratingModalError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{ratingModalError}</div>
              )}
              <div>
                <label htmlFor="rating-modal-label" className="admin-text-main mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Label
                </label>
                <input
                  id="rating-modal-label"
                  value={ratingModalLabel}
                  onChange={(e) => setRatingModalLabel(e.target.value)}
                  maxLength={100}
                  className="admin-border mt-1 block w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Display label"
                />
                <p className="admin-text-muted mt-1 text-xs">1–80 characters (saved trimmed).</p>
              </div>
              <div>
                <label
                  htmlFor="rating-modal-desc"
                  className="admin-text-main mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Description
                </label>
                <textarea
                  id="rating-modal-desc"
                  value={ratingModalDescription}
                  onChange={(e) => setRatingModalDescription(e.target.value)}
                  rows={4}
                  maxLength={520}
                  className="admin-border mt-1 block w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Short explanation shown in admin / reports"
                />
                <p className="admin-text-muted mt-1 text-xs">Up to 500 characters (saved trimmed).</p>
              </div>
            </div>
            <div className="admin-border flex flex-wrap justify-end gap-2 border-t px-6 py-4">
              <button
                type="button"
                onClick={closeRatingEditModal}
                disabled={ratingModalSaving}
                className="admin-border admin-text-muted rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveRatingEditModal}
                disabled={ratingModalSaving}
                className="admin-green-bg inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Save size={16} />
                {ratingModalSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="admin-border flex items-center justify-between border-b px-6 py-4">
              <div className="flex items-center gap-3">
                <Clock size={16} className="admin-text-muted" />
                <h4 className="admin-text-main text-base font-semibold">Formula Change History</h4>
              </div>
              <button type="button" onClick={() => setShowHistory(false)} className="admin-text-muted rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
                Close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {historyLoading && <p className="admin-text-muted p-6 text-sm">Loading…</p>}
              {!historyLoading && history.length === 0 && <p className="admin-text-muted p-6 text-sm">No changes yet.</p>}
              {!historyLoading && history.length > 0 && (
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-6 py-3">When</th>
                      <th className="px-6 py-3">Who</th>
                      <th className="px-6 py-3">Parameter</th>
                      <th className="px-6 py-3">Old → New</th>
                      <th className="px-6 py-3">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="admin-border-soft border-t text-sm">
                        <td className="admin-text-muted px-6 py-4">{formatDateTime(h.changed_at)}</td>
                        <td className="admin-text-muted px-6 py-4">{h.changed_by}</td>
                        <td className="admin-text-main px-6 py-4 font-mono text-xs">{h.key}</td>
                        <td className="admin-text-main px-6 py-4 font-mono text-xs">
                          {h.old_value === null ? '—' : String(h.old_value)} → {String(h.new_value)}
                        </td>
                        <td className="admin-text-muted px-6 py-4">{h.note ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
