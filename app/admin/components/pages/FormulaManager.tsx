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
  listFormulaPerformanceTemplatesAction,
  listFormulaRatingLabelsAction,
  listFormulaSettingsAction,
  listFormulaTrendTemplatesAction,
  resetFormulaPerformanceTemplatesAction,
  resetFormulaRatingLabelsAction,
  resetFormulaSettingsAction,
  resetFormulaTrendTemplatesAction,
  updateFormulaSettingsAction,
  upsertFormulaPerformanceTemplatesAction,
  upsertFormulaRatingLabelsAction,
  upsertFormulaTrendTemplatesAction,
  type FormulaBenchmarkRelation,
  type FormulaHistoryRow,
  type FormulaPerformanceDistance,
  type FormulaPerformanceTemplateRow,
  type FormulaRatingLabelRow,
  type FormulaRatingTier,
  type FormulaSetting,
  type FormulaTrendOutlook,
  type FormulaTrendTemplateRow,
} from '../../_actions/formulas';
import { useAdmin } from '../../_lib/admin-context';

type CategoryKey = FormulaSetting['category'];
type NavCategory = CategoryKey | 'rating_labels';
type RatingSubtab = 'chart_trend' | 'performance';

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

const LEGEND: { tier: FormulaRatingTier; label: string; defaultColor: string }[] = [
  { tier: 'strong_bull', label: 'Strong Bull', defaultColor: '#16a34a' },
  { tier: 'bull', label: 'Bull', defaultColor: '#22c55e' },
  { tier: 'neutral', label: 'Neutral', defaultColor: '#f59e0b' },
  { tier: 'bear', label: 'Bear', defaultColor: '#f97316' },
  { tier: 'strong_bear', label: 'Strong Bear', defaultColor: '#ef4444' },
];

const SCORE_KEY_BY_TIER: Record<FormulaRatingTier, 'score_strong' | 'score_mixed_high' | 'score_mixed_low' | 'score_weak'> = {
  strong_bull: 'score_strong',
  bull: 'score_mixed_high',
  neutral: 'score_mixed_low',
  bear: 'score_weak',
  strong_bear: 'score_weak',
};

const FIELD_STYLE =
  'block rounded-lg border border-input bg-input-background px-3 py-2 text-sm text-foreground shadow-sm outline-none ring-offset-background transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30 dark:scheme-dark';

function normalizeHexColor(input: string, fallback: string): string {
  const val = input.trim();
  return /^#[0-9a-fA-F]{6}$/.test(val) ? val.toLowerCase() : fallback;
}

function textColorForHex(hex: string): string {
  const cleaned = normalizeHexColor(hex, '#6b7280').slice(1);
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > 155 ? '#111827' : '#f8fafc';
}

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
    score_mixed_low: val('score_mixed_low', 1.6),
    score_weak: val('score_weak', 0.9),
  };
}

export default function FormulaManager() {
  const { getAccessToken } = useAdmin();
  const [settings, setSettings] = useState<FormulaSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [ratingRows, setRatingRows] = useState<FormulaRatingLabelRow[]>([]);
  const [trendTemplates, setTrendTemplates] = useState<FormulaTrendTemplateRow[]>([]);
  const [performanceRows, setPerformanceRows] = useState<FormulaPerformanceTemplateRow[]>([]);
  const [ratingSubtab, setRatingSubtab] = useState<RatingSubtab>('chart_trend');
  const [ratingEditTier, setRatingEditTier] = useState<FormulaRatingTier | null>(null);
  const [ratingModalLabel, setRatingModalLabel] = useState('');
  const [ratingModalDescription, setRatingModalDescription] = useState('');
  const [ratingModalColor, setRatingModalColor] = useState('#22c55e');
  const [ratingModalThreshold, setRatingModalThreshold] = useState('');
  const [ratingModalError, setRatingModalError] = useState<string | null>(null);
  const [ratingModalSaving, setRatingModalSaving] = useState(false);
  const [trendEditKey, setTrendEditKey] = useState<{ tier: FormulaRatingTier; outlook: FormulaTrendOutlook } | null>(null);
  const [trendModalWeeklyTitle, setTrendModalWeeklyTitle] = useState('');
  const [trendModalDailyTitle, setTrendModalDailyTitle] = useState('');
  const [trendModalWeekly, setTrendModalWeekly] = useState('');
  const [trendModalDaily, setTrendModalDaily] = useState('');
  const [trendModalError, setTrendModalError] = useState<string | null>(null);
  const [trendModalSaving, setTrendModalSaving] = useState(false);
  const [performanceEditKey, setPerformanceEditKey] = useState<{
    strength: 'Strong' | 'Mixed' | 'Weak';
    distance_to_highs: FormulaPerformanceDistance;
    benchmark_relation: FormulaBenchmarkRelation;
  } | null>(null);
  const [performanceModalLabel, setPerformanceModalLabel] = useState('');
  const [performanceModalDescription, setPerformanceModalDescription] = useState('');
  const [performanceModalError, setPerformanceModalError] = useState<string | null>(null);
  const [performanceModalSaving, setPerformanceModalSaving] = useState(false);
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
      const [fRes, rRes, trendRes, pRes] = await Promise.all([
        listFormulaSettingsAction(token),
        listFormulaRatingLabelsAction(token),
        listFormulaTrendTemplatesAction(token),
        listFormulaPerformanceTemplatesAction(token),
      ]);
      if (fRes.ok) {
        setSettings(fRes.data);
        const map: Record<string, string> = {};
        for (const s of fRes.data) map[s.key] = String(s.value);
        setDrafts(map);
      } else {
        setError(fRes.error);
      }
      if (trendRes.ok) setTrendTemplates(trendRes.data);
      if (rRes.ok) setRatingRows(rRes.data);
      if (pRes.ok) setPerformanceRows(pRes.data);
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
        if (ratingSubtab === 'chart_trend') {
          if (!confirm('Reset chart-trend rating labels and trend templates to defaults?')) return;
          const [labelRes, trendRes] = await Promise.all([resetFormulaRatingLabelsAction(token), resetFormulaTrendTemplatesAction(token)]);
          if (!labelRes.ok) {
            setError(labelRes.error);
            return;
          }
          if (!trendRes.ok) {
            setError(trendRes.error);
            return;
          }
          setFlash('Chart-trend labels and templates reset to defaults.');
          await load();
          return;
        }
        if (!confirm('Reset performance templates to defaults?')) return;
        const res = await resetFormulaPerformanceTemplatesAction(token);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setFlash('Performance templates reset to defaults.');
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

  const trendRowsForTable = useMemo(
    () =>
      trendTemplates.filter((row) =>
        ['Extended', 'Stable', 'Cooling', 'Reversing', 'Firming', 'Softening', 'Warming'].includes(row.outlook)
      ),
    [trendTemplates]
  );

  const openTrendEditModal = (tier: FormulaRatingTier, outlook: FormulaTrendOutlook) => {
    const weekly = trendTemplates.find((r) => r.tier === tier && r.outlook === outlook && r.timeframe === 'Weekly');
    const daily = trendTemplates.find((r) => r.tier === tier && r.outlook === outlook && r.timeframe === 'Daily');
    setTrendEditKey({ tier, outlook });
    setTrendModalWeeklyTitle(weekly?.title ?? '');
    setTrendModalDailyTitle(daily?.title ?? '');
    setTrendModalWeekly(weekly?.description ?? '');
    setTrendModalDaily(daily?.description ?? '');
    setTrendModalError(null);
  };

  const closeTrendEditModal = () => {
    setTrendEditKey(null);
    setTrendModalWeeklyTitle('');
    setTrendModalDailyTitle('');
    setTrendModalError(null);
    setTrendModalSaving(false);
  };

  const saveTrendEditModal = async () => {
    if (!trendEditKey) return;
    if (!trendModalWeeklyTitle.trim() || !trendModalDailyTitle.trim()) {
      setTrendModalError('Weekly and daily titles are required.');
      return;
    }
    if (!trendModalWeekly.trim() || !trendModalDaily.trim()) {
      setTrendModalError('Weekly and daily descriptions are required.');
      return;
    }
    setTrendModalSaving(true);
    try {
      const token = await getAccessToken();
      const res = await upsertFormulaTrendTemplatesAction(token, {
        rows: [{
          tier: trendEditKey.tier,
          outlook: trendEditKey.outlook,
          weekly_title: trendModalWeeklyTitle,
          daily_title: trendModalDailyTitle,
          weekly: trendModalWeekly,
          daily: trendModalDaily,
        }],
      });
      if (!res.ok) {
        setTrendModalError(res.error);
        return;
      }
      await load();
      setFlash('Trend templates saved.');
      closeTrendEditModal();
    } catch (e) {
      setTrendModalError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setTrendModalSaving(false);
    }
  };

  const openPerformanceEditModal = (
    strength: 'Strong' | 'Mixed' | 'Weak',
    distance_to_highs: FormulaPerformanceDistance,
    benchmark_relation: FormulaBenchmarkRelation
  ) => {
    const row = performanceRows.find(
      (r) =>
        r.strength === strength &&
        r.distance_to_highs === distance_to_highs &&
        r.benchmark_relation === benchmark_relation
    );
    setPerformanceModalError(null);
    setPerformanceEditKey({ strength, distance_to_highs, benchmark_relation });
    setPerformanceModalLabel(row?.label ?? '');
    setPerformanceModalDescription(row?.description ?? '');
  };

  const closePerformanceEditModal = () => {
    setPerformanceEditKey(null);
    setPerformanceModalError(null);
    setPerformanceModalSaving(false);
  };

  const savePerformanceEditModal = async () => {
    if (!performanceEditKey) return;
    const label = performanceModalLabel.trim();
    const description = performanceModalDescription.trim();
    if (label.length < 1 || label.length > 80) {
      setPerformanceModalError('Label must be 1–80 characters.');
      return;
    }
    if (description.length < 1 || description.length > 500) {
      setPerformanceModalError('Description must be 1–500 characters.');
      return;
    }
    setPerformanceModalError(null);
    setPerformanceModalSaving(true);
    try {
      const token = await getAccessToken();
      const res = await upsertFormulaPerformanceTemplatesAction(token, {
        rows: [{ ...performanceEditKey, label, description }],
      });
      if (!res.ok) {
        setPerformanceModalError(res.error);
        return;
      }
      await load();
      setFlash('Performance template saved.');
      closePerformanceEditModal();
    } catch (e) {
      setPerformanceModalError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setPerformanceModalSaving(false);
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
    const defaultColor = LEGEND.find((l) => l.tier === tier)?.defaultColor ?? '#22c55e';
    const scoreKey = SCORE_KEY_BY_TIER[tier];
    const scoreSetting = settings.find((x) => x.key === scoreKey);
    const scoreDraft = drafts[scoreKey];
    const scoreValue = scoreDraft ?? (scoreSetting ? String(scoreSetting.value) : '');
    setRatingModalError(null);
    setRatingEditTier(tier);
    setRatingModalLabel(row?.label ?? '');
    setRatingModalDescription(row?.description ?? '');
    setRatingModalColor(normalizeHexColor(row?.color_hex ?? defaultColor, defaultColor));
    setRatingModalThreshold(scoreValue);
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
    const defaultColor = LEGEND.find((l) => l.tier === ratingEditTier)?.defaultColor ?? '#22c55e';
    const colorHex = normalizeHexColor(ratingModalColor, defaultColor);
    const scoreKey = SCORE_KEY_BY_TIER[ratingEditTier];
    const nextThreshold = Number(ratingModalThreshold);
    if (!Number.isFinite(nextThreshold)) {
      setRatingModalError('Score threshold must be a valid number.');
      return;
    }
    const scoreSetting = settings.find((x) => x.key === scoreKey);
    if (!scoreSetting) {
      setRatingModalError(`Could not find formula setting: ${scoreKey}`);
      return;
    }
    if (scoreSetting.min_value !== null && nextThreshold < Number(scoreSetting.min_value)) {
      setRatingModalError(`Threshold must be >= ${scoreSetting.min_value}.`);
      return;
    }
    if (scoreSetting.max_value !== null && nextThreshold > Number(scoreSetting.max_value)) {
      setRatingModalError(`Threshold must be <= ${scoreSetting.max_value}.`);
      return;
    }
    setRatingModalError(null);
    setRatingModalSaving(true);
    try {
      const token = await getAccessToken();
      const labelRes = await upsertFormulaRatingLabelsAction(token, {
        rows: [{ tier: ratingEditTier, label, description, color_hex: colorHex }],
      });
      if (!labelRes.ok) {
        setRatingModalError(labelRes.error);
        return;
      }
      const currentThreshold = Number(drafts[scoreKey] ?? scoreSetting.value);
      if (nextThreshold !== currentThreshold) {
        const scoreRes = await updateFormulaSettingsAction(token, {
          changes: [{ key: scoreKey, value: nextThreshold }],
          note: 'rating_rule_update',
        });
        if (!scoreRes.ok) {
          setRatingModalError(scoreRes.error);
          return;
        }
      }
      await load();
      setFlash('Rating label, color, and score rule saved.');
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
        <p className="min-w-0 flex-1 text-sm text-muted-foreground md:max-w-2xl">
          {activeNav === 'rating_labels'
            ? ratingSubtab === 'chart_trend'
              ? 'Chart Trend labels, descriptions, colors, and score rules are managed here.'
              : 'Performance label text and description templates are managed here.'
            : changedKeys.length === 0
              ? 'No unsaved changes.'
              : `${changedKeys.length} unsaved numeric change${changedKeys.length === 1 ? '' : 's'}.`}
        </p>
        <button
          type="button"
          onClick={openHistory}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
        >
          <History size={16} />
          History
        </button>
      </div>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {flash && <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-100">{flash}</div>}

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
                  isActive ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:bg-muted/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon size={18} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{m.title}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">{count}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{m.subtitle}</p>
                  </div>
                </div>
              </button>
            );
          })}

        </aside>

        <section className="min-h-0 min-w-0 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-xl font-semibold tracking-tight text-foreground">{NAV_META.find((n) => n.id === activeNav)?.title}</h3>

          {loading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}

          {!loading && activeNav === 'rating_labels' && (
            <div className="mt-4 space-y-4">
              <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setRatingSubtab('chart_trend')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    ratingSubtab === 'chart_trend' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Chart Trend Labels
                </button>
                <button
                  type="button"
                  onClick={() => setRatingSubtab('performance')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    ratingSubtab === 'performance' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Performance Labels
                </button>
              </div>

              {ratingSubtab === 'chart_trend' && (
                <div className="space-y-6">
                  <div className="min-w-0 overflow-x-auto">
                    <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
                      <thead className="text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        <tr>
                          <th className="border-b border-border bg-muted/50 px-4 py-3">Score rule</th>
                          <th className="border-b border-border bg-muted/50 px-4 py-3">Label</th>
                          <th className="border-b border-border bg-muted/50 px-4 py-3">Description</th>
                          <th className="border-b border-border bg-muted/50 px-4 py-3">Updated</th>
                          <th className="border-b border-border bg-muted/50 px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {RATING_ORDER.map((tier) => {
                          const row = ratingRows.find((r) => r.tier === tier);
                          const fallbackColor = LEGEND.find((l) => l.tier === tier)?.defaultColor ?? '#22c55e';
                          const colorHex = normalizeHexColor(row?.color_hex ?? fallbackColor, fallbackColor);
                          const labelText = row?.label?.trim() || '—';
                          const desc = row?.description ?? '';
                          return (
                            <tr key={tier} className="border-b border-border text-sm transition-colors hover:bg-muted/30">
                              <td className="px-4 py-4 font-mono text-sm font-semibold text-foreground">
                                {scoreRuleText(tier, scoreParams)}
                              </td>
                              <td className="px-4 py-4">
                                <span
                                  className="inline-block rounded-md px-2 py-1 text-xs font-semibold"
                                  style={{ backgroundColor: colorHex, color: textColorForHex(colorHex) }}
                                >
                                  {labelText}
                                </span>
                              </td>
                              <td className="max-w-md px-4 py-4 text-muted-foreground">
                                <p className="line-clamp-2" title={desc}>
                                  {desc || '—'}
                                </p>
                              </td>
                              <td className="px-4 py-4 text-xs text-muted-foreground">
                                {row?.updated_at ? formatDateTime(row.updated_at) : '—'}
                                {row?.updated_by && <div className="mt-1">{row.updated_by}</div>}
                              </td>
                              <td className="px-4 py-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => openRatingEditModal(tier)}
                                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
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
                  <div className="min-w-0 overflow-x-auto">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Trend Title + Description Templates (Weekly + Daily)
                    </p>
                    <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
                      <thead className="text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        <tr>
                          <th className="border-b border-border bg-muted/50 px-4 py-3">Tier</th>
                          <th className="border-b border-border bg-muted/50 px-4 py-3">Label</th>
                          <th className="border-b border-border bg-muted/50 px-4 py-3">Outlook</th>
                          <th className="border-b border-border bg-muted/50 px-4 py-3">Weekly</th>
                          <th className="border-b border-border bg-muted/50 px-4 py-3">Daily</th>
                          <th className="border-b border-border bg-muted/50 px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trendRowsForTable
                          .filter((row) => row.timeframe === 'Weekly')
                          .map((row) => {
                            const dailyRow = trendRowsForTable.find(
                              (x) => x.tier === row.tier && x.outlook === row.outlook && x.timeframe === 'Daily'
                            );
                            const ratingLabel = ratingRows.find((x) => x.tier === row.tier)?.label ?? row.tier;
                            return (
                              <tr key={`${row.tier}:${row.outlook}`} className="border-b border-border text-sm transition-colors hover:bg-muted/30">
                                <td className="px-4 py-4 font-semibold text-foreground">{row.tier}</td>
                                <td className="px-4 py-4 text-foreground">{ratingLabel}</td>
                                <td className="px-4 py-4 text-foreground">{row.outlook}</td>
                                <td className="max-w-md px-4 py-4 text-muted-foreground">
                                  <p className="font-medium text-foreground">{row.title || '—'}</p>
                                  <p className="line-clamp-2" title={row.description}>{row.description || '—'}</p>
                                </td>
                                <td className="max-w-md px-4 py-4 text-muted-foreground">
                                  <p className="font-medium text-foreground">{dailyRow?.title ?? '—'}</p>
                                  <p className="line-clamp-2" title={dailyRow?.description ?? ''}>{dailyRow?.description ?? '—'}</p>
                                </td>
                                <td className="px-4 py-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() => openTrendEditModal(row.tier, row.outlook)}
                                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
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
                </div>
              )}

              {ratingSubtab === 'performance' && (
                <div className="min-w-0 overflow-x-auto">
                  <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
                    <thead className="text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      <tr>
                        <th className="border-b border-border bg-muted/50 px-4 py-3">Strength</th>
                        <th className="border-b border-border bg-muted/50 px-4 py-3">Distance to Highs</th>
                        <th className="border-b border-border bg-muted/50 px-4 py-3">Benchmark Relation</th>
                        <th className="border-b border-border bg-muted/50 px-4 py-3">Performance Label</th>
                        <th className="border-b border-border bg-muted/50 px-4 py-3">Description Template</th>
                        <th className="border-b border-border bg-muted/50 px-4 py-3">Updated</th>
                        <th className="border-b border-border bg-muted/50 px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performanceRows.map((row) => {
                        return (
                          <tr key={`${row.strength}:${row.distance_to_highs}:${row.benchmark_relation}`} className="border-b border-border text-sm transition-colors hover:bg-muted/30">
                            <td className="px-4 py-4 font-semibold text-foreground">{row.strength}</td>
                            <td className="px-4 py-4 text-foreground">{row.distance_to_highs}</td>
                            <td className="px-4 py-4 text-foreground">{row.benchmark_relation}</td>
                            <td className="px-4 py-4 text-foreground">{row?.label ?? '—'}</td>
                            <td className="max-w-md px-4 py-4 text-muted-foreground">
                              <p className="line-clamp-2" title={row?.description ?? ''}>{row?.description ?? '—'}</p>
                            </td>
                            <td className="px-4 py-4 text-xs text-muted-foreground">
                              {row?.updated_at ? formatDateTime(row.updated_at) : '—'}
                              {row?.updated_by && <div className="mt-1">{row.updated_by}</div>}
                            </td>
                            <td className="px-4 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => openPerformanceEditModal(row.strength, row.distance_to_highs, row.benchmark_relation)}
                                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
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
                  <p className="mt-3 text-xs text-muted-foreground">
                    Spreadsheet matrix is keyed by strength + distance-to-highs + benchmark relation.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Performance description supports {'{{ticker}}'}, {'{{distance}}'}, {'{{strength}}'}, and {'{{benchmark_relation}}'} placeholders.
                  </p>
                </div>
              )}
            </div>
          )}

          {!loading && activeNav === 'scoring_weights' && (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-4 dark:border-emerald-500/20 dark:bg-emerald-500/15">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-100">Current formula</p>
                <p className="mt-2 font-mono text-sm text-emerald-900 dark:text-emerald-100 md:text-base">
                  SUMPRODUCT( weights[], component_scores[] ) ÷ 3 × 5
                </p>
              </div>
              <h4 className="text-base font-semibold text-foreground">Component weights</h4>
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
                  <thead className="text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    <tr>
                      <th className="border-b border-border bg-muted/50 px-4 py-3">Component</th>
                      <th className="border-b border-border bg-muted/50 px-4 py-3">Description</th>
                      <th className="border-b border-border bg-muted/50 px-4 py-3 text-right">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSettings.map((s) => {
                      const draft = drafts[s.key] ?? String(s.value);
                      return (
                        <tr key={s.key} className="border-b border-border transition-colors hover:bg-muted/30">
                          <td className="px-4 py-4">
                            <div className="font-semibold text-foreground">{s.label}</div>
                            <div className="font-mono text-xs text-muted-foreground">{s.key}</div>
                          </td>
                          <td className="max-w-md px-4 py-4 text-muted-foreground">{s.description}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted/50"
                                onClick={() => bumpWeight(s.key, -0.1)}
                              >
                                <Minus size={16} />
                              </button>
                              <input
                                value={draft}
                                onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                                className={`${FIELD_STYLE} h-10 w-24 px-2 text-center font-mono`}
                                inputMode="decimal"
                              />
                              <button
                                type="button"
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted/50"
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
                <thead className="text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <tr>
                    <th className="border-b border-border bg-muted/50 px-4 py-4">Parameter</th>
                    <th className="border-b border-border bg-muted/50 px-4 py-4">Description</th>
                    <th className="border-b border-border bg-muted/50 px-4 py-4">Default</th>
                    <th className="border-b border-border bg-muted/50 px-4 py-4">Value</th>
                    <th className="border-b border-border bg-muted/50 px-4 py-4">Updated</th>
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
                      <tr key={s.key} className="border-b border-border text-sm transition-colors hover:bg-muted/30">
                        <td className="px-4 py-4 text-foreground">
                          <div className="font-semibold">{s.label}</div>
                          <div className="font-mono text-xs text-muted-foreground">{s.key}</div>
                        </td>
                        <td className="px-4 py-4 text-muted-foreground">{s.description}</td>
                        <td className="px-4 py-4 font-mono text-xs text-muted-foreground">{String(s.default_value)}</td>
                        <td className="px-4 py-4">
                          <input
                            className={`${FIELD_STYLE} h-10 w-28 ${
                              invalid ? 'border-destructive/70' : changed ? 'border-emerald-500/70' : ''
                            }`}
                            value={draft}
                            onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                            inputMode="decimal"
                          />
                          {invalid && <div className="mt-2 text-xs text-destructive">{invalid}</div>}
                        </td>
                        <td className="px-4 py-4 text-xs text-muted-foreground">
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
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            )}
            <button
              type="button"
              onClick={onReset}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
            >
              <Undo2 size={16} />
              Reset to Default
            </button>
            <p className="flex w-full items-center gap-2 text-xs text-amber-800 dark:text-amber-200 lg:ml-auto lg:w-auto">
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
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
              <h4 id="rating-edit-title" className="text-base font-semibold text-foreground">
                Edit rating label — {LEGEND.find((l) => l.tier === ratingEditTier)?.label ?? ratingEditTier}
              </h4>
              <button
                type="button"
                onClick={closeRatingEditModal}
                disabled={ratingModalSaving}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Close
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              {ratingModalError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{ratingModalError}</div>
              )}
              <div className="space-y-1.5">
                <label htmlFor="rating-modal-label" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Label
                </label>
                <input
                  id="rating-modal-label"
                  value={ratingModalLabel}
                  onChange={(e) => setRatingModalLabel(e.target.value)}
                  maxLength={100}
                  className={`${FIELD_STYLE} w-full max-w-none`}
                  placeholder="Display label"
                />
                <p className="mt-1 text-xs text-muted-foreground">1–80 characters (saved trimmed).</p>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="rating-modal-desc"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Description
                </label>
                <textarea
                  id="rating-modal-desc"
                  value={ratingModalDescription}
                  onChange={(e) => setRatingModalDescription(e.target.value)}
                  rows={4}
                  maxLength={520}
                  className={`${FIELD_STYLE} mt-1 min-h-[7rem] w-full max-w-none py-2`}
                  placeholder="Short explanation shown in admin / reports"
                />
                <p className="mt-1 text-xs text-muted-foreground">Up to 500 characters (saved trimmed).</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                <div className="space-y-1.5">
                  <label
                    htmlFor="rating-modal-threshold"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Score Rule Threshold
                  </label>
                  <input
                    id="rating-modal-threshold"
                    type="number"
                    step="0.01"
                    value={ratingModalThreshold}
                    onChange={(e) => setRatingModalThreshold(e.target.value)}
                    className={`${FIELD_STYLE} w-full max-w-none`}
                  />
                  <p className="text-xs text-muted-foreground">
                    {ratingEditTier === 'strong_bear'
                      ? 'Strong Bear uses this as the lower bound rule: score < threshold.'
                      : `Rule applied for this tier: ${scoreRuleText(ratingEditTier!, {
                          score_strong: ratingEditTier === 'strong_bull' ? Number(ratingModalThreshold || 0) : scoreParams.score_strong,
                          score_mixed_high: ratingEditTier === 'bull' ? Number(ratingModalThreshold || 0) : scoreParams.score_mixed_high,
                          score_mixed_low: ratingEditTier === 'neutral' ? Number(ratingModalThreshold || 0) : scoreParams.score_mixed_low,
                          score_weak: ratingEditTier === 'bear' ? Number(ratingModalThreshold || 0) : scoreParams.score_weak,
                        })}`}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="rating-modal-color"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Badge Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="rating-modal-color"
                      type="color"
                      value={ratingModalColor}
                      onChange={(e) => setRatingModalColor(e.target.value)}
                      className="h-10 w-14 rounded-lg border border-input bg-input-background p-1 dark:bg-input/30"
                    />
                    <input
                      value={ratingModalColor}
                      onChange={(e) => setRatingModalColor(e.target.value)}
                      className={`${FIELD_STYLE} h-10 w-full max-w-none font-mono`}
                      placeholder="#22c55e"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Preview</span>
                    <span
                      className="rounded-md px-2 py-1 text-xs font-semibold"
                      style={{
                        backgroundColor: normalizeHexColor(
                          ratingModalColor,
                          LEGEND.find((l) => l.tier === ratingEditTier)?.defaultColor ?? '#22c55e'
                        ),
                        color: textColorForHex(
                          normalizeHexColor(
                            ratingModalColor,
                            LEGEND.find((l) => l.tier === ratingEditTier)?.defaultColor ?? '#22c55e'
                          )
                        ),
                      }}
                    >
                      {ratingModalLabel.trim() || LEGEND.find((l) => l.tier === ratingEditTier)?.label}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={closeRatingEditModal}
                disabled={ratingModalSaving}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveRatingEditModal}
                disabled={ratingModalSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Save size={16} />
                {ratingModalSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {trendEditKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trend-edit-title"
        >
          <div className="w-full max-w-3xl rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
              <h4 id="trend-edit-title" className="text-base font-semibold text-foreground">
                Edit trend template — {trendEditKey.tier} / {trendEditKey.outlook}
              </h4>
              <button
                type="button"
                onClick={closeTrendEditModal}
                disabled={trendModalSaving}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Close
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              {trendModalError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {trendModalError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="trend-modal-weekly-title" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Weekly Title
                  </label>
                  <input
                    id="trend-modal-weekly-title"
                    value={trendModalWeeklyTitle}
                    onChange={(e) => setTrendModalWeeklyTitle(e.target.value)}
                    maxLength={120}
                    className={`${FIELD_STYLE} w-full max-w-none`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="trend-modal-daily-title" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Daily Title
                  </label>
                  <input
                    id="trend-modal-daily-title"
                    value={trendModalDailyTitle}
                    onChange={(e) => setTrendModalDailyTitle(e.target.value)}
                    maxLength={120}
                    className={`${FIELD_STYLE} w-full max-w-none`}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="trend-modal-weekly" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Weekly Description
                </label>
                <textarea
                  id="trend-modal-weekly"
                  value={trendModalWeekly}
                  onChange={(e) => setTrendModalWeekly(e.target.value)}
                  rows={4}
                  className={`${FIELD_STYLE} min-h-[7rem] w-full max-w-none py-2`}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="trend-modal-daily" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Daily Description
                </label>
                <textarea
                  id="trend-modal-daily"
                  value={trendModalDaily}
                  onChange={(e) => setTrendModalDaily(e.target.value)}
                  rows={4}
                  className={`${FIELD_STYLE} min-h-[7rem] w-full max-w-none py-2`}
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={closeTrendEditModal}
                disabled={trendModalSaving}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveTrendEditModal}
                disabled={trendModalSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Save size={16} />
                {trendModalSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {performanceEditKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="performance-edit-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
              <h4 id="performance-edit-title" className="text-base font-semibold text-foreground">
                Edit performance text — {performanceEditKey.strength} / {performanceEditKey.distance_to_highs} / {performanceEditKey.benchmark_relation}
              </h4>
              <button
                type="button"
                onClick={closePerformanceEditModal}
                disabled={performanceModalSaving}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Close
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              {performanceModalError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {performanceModalError}
                </div>
              )}
              <div className="space-y-1.5">
                <label htmlFor="performance-modal-label" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Performance Label
                </label>
                <input
                  id="performance-modal-label"
                  value={performanceModalLabel}
                  onChange={(e) => setPerformanceModalLabel(e.target.value)}
                  maxLength={100}
                  className={`${FIELD_STYLE} w-full max-w-none`}
                  placeholder="e.g. Strong performer"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="performance-modal-desc" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Description Template
                </label>
                <textarea
                  id="performance-modal-desc"
                  value={performanceModalDescription}
                  onChange={(e) => setPerformanceModalDescription(e.target.value)}
                  rows={4}
                  maxLength={520}
                  className={`${FIELD_STYLE} min-h-[7rem] w-full max-w-none py-2`}
                  placeholder="This ticker is currently showing strong performance and is {{distance}}."
                />
                <p className="text-xs text-muted-foreground">
                  Supports {'{{distance}}'} and {'{{strength}}'} placeholders.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={closePerformanceEditModal}
                disabled={performanceModalSaving}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePerformanceEditModal}
                disabled={performanceModalSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Save size={16} />
                {performanceModalSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
              <div className="flex items-center gap-3">
                <Clock size={16} className="text-muted-foreground" />
                <h4 className="text-base font-semibold text-foreground">Formula Change History</h4>
              </div>
              <button type="button" onClick={() => setShowHistory(false)} className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted">
                Close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {historyLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
              {!historyLoading && history.length === 0 && <p className="p-6 text-sm text-muted-foreground">No changes yet.</p>}
              {!historyLoading && history.length > 0 && (
                <table className="w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="border-b border-border bg-muted/50 px-6 py-3">When</th>
                      <th className="border-b border-border bg-muted/50 px-6 py-3">Who</th>
                      <th className="border-b border-border bg-muted/50 px-6 py-3">Parameter</th>
                      <th className="border-b border-border bg-muted/50 px-6 py-3">Old → New</th>
                      <th className="border-b border-border bg-muted/50 px-6 py-3">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-b border-border text-sm transition-colors hover:bg-muted/30">
                        <td className="px-6 py-4 text-muted-foreground">{formatDateTime(h.changed_at)}</td>
                        <td className="px-6 py-4 text-muted-foreground">{h.changed_by}</td>
                        <td className="px-6 py-4 font-mono text-xs text-foreground">{h.key}</td>
                        <td className="px-6 py-4 font-mono text-xs text-foreground">
                          {h.old_value === null ? '—' : String(h.old_value)} → {String(h.new_value)}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{h.note ?? ''}</td>
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
