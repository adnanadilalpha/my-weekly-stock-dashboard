import type { MomentumDirection, MomentumKpis, MomentumTrackWeek } from './types';

/**
 * Normalize Direction from sheet/UI ("Long" / "SHORT" / "long").
 * Design file Take Profit $ checked Week Open instead of Direction — always use this.
 */
export function normalizeDirection(
  direction: string | null | undefined
): MomentumDirection | null {
  const d = String(direction ?? '')
    .trim()
    .toLowerCase();
  if (d === 'long' || d === 'short') return d;
  return null;
}

/**
 * Stop-loss $ — Direction-aware.
 * Long: open * (1 + stopPct)  |  Short: open * (1 - stopPct)
 * stopPct is typically negative (e.g. -0.02).
 */
export function stopLossDollars(
  weekOpen: number | null | undefined,
  stopLossPct: number | null | undefined,
  direction: string | null | undefined
): number | null {
  const dir = normalizeDirection(direction);
  if (weekOpen == null || stopLossPct == null || !dir) return null;
  if (!Number.isFinite(weekOpen) || !Number.isFinite(stopLossPct)) return null;
  return dir === 'long' ? weekOpen * (1 + stopLossPct) : weekOpen * (1 - stopLossPct);
}

/**
 * Take Profit $ — Direction-aware.
 * Fixes design-sheet typo that used Week Open cell in the IF (so Long was priced like Short).
 * Long: open * (1 + tpPct)  |  Short: open * (1 - tpPct)
 */
export function takeProfitDollars(
  weekOpen: number | null | undefined,
  takeProfitPct: number | null | undefined,
  direction: string | null | undefined
): number | null {
  const dir = normalizeDirection(direction);
  if (weekOpen == null || takeProfitPct == null || !dir) return null;
  if (!Number.isFinite(weekOpen) || !Number.isFinite(takeProfitPct)) return null;
  return dir === 'long' ? weekOpen * (1 + takeProfitPct) : weekOpen * (1 - takeProfitPct);
}

/**
 * Return 5-d — direction-aware.
 * Design Current Week used price/open-1 for every row (wrong for shorts).
 * Long: price/open - 1  |  Short: open/price - 1
 */
export function return5d(
  weekOpen: number | null | undefined,
  currentPrice: number | null | undefined,
  direction: string | null | undefined
): number | null {
  const dir = normalizeDirection(direction);
  if (weekOpen == null || currentPrice == null || !dir) return null;
  if (!Number.isFinite(weekOpen) || !Number.isFinite(currentPrice) || weekOpen === 0 || currentPrice === 0) {
    return null;
  }
  return dir === 'long' ? currentPrice / weekOpen - 1 : weekOpen / currentPrice - 1;
}

export function average(nums: Array<number | null | undefined>): number | null {
  const vals = nums.filter((n): n is number => n != null && Number.isFinite(n));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Compound: (1+prev)*(1+week) - 1. Oldest week has cumulative = weekly avg. */
export function compoundCumulative(
  previousCumulative: number | null,
  weeklyAvg: number | null
): number | null {
  if (weeklyAvg == null || !Number.isFinite(weeklyAvg)) return previousCumulative;
  if (previousCumulative == null || !Number.isFinite(previousCumulative)) return weeklyAvg;
  return (1 + previousCumulative) * (1 + weeklyAvg) - 1;
}

/**
 * CAGR from Track record sheet: (1+totalReturn)^(1/(year-2019 + week/52)) - 1
 */
export function computeCagr(
  totalReturn: number | null,
  year: number | null,
  week: number | null
): number | null {
  if (totalReturn == null || year == null || week == null) return null;
  if (!Number.isFinite(totalReturn) || totalReturn <= -1) return null;
  const years = year - 2019 + week / 52;
  if (!Number.isFinite(years) || years <= 0) return null;
  return Math.pow(1 + totalReturn, 1 / years) - 1;
}

export function computeHitRate(weeklyAvgStopLosses: Array<number | null | undefined>): number | null {
  const vals = weeklyAvgStopLosses.filter((n): n is number => n != null && Number.isFinite(n));
  if (vals.length === 0) return null;
  const hits = vals.filter((n) => n > 0).length;
  return hits / vals.length;
}

/**
 * Recompute cumulative columns chronologically (oldest → newest), then return
 * weeks in the same order as input (caller usually newest-first).
 */
export function recomputeCumulatives<
  T extends {
    year: number;
    week: number;
    weeklyAvg5d: number | null;
    weeklyAvgStopLoss: number | null;
    cumulative5d?: number | null;
    cumulativeStopLoss?: number | null;
  }
>(weeksNewestFirst: T[]): T[] {
  const oldestFirst = [...weeksNewestFirst].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.week - b.week;
  });

  let cum5: number | null = null;
  let cumStop: number | null = null;
  const byKey = new Map<string, { cumulative5d: number | null; cumulativeStopLoss: number | null }>();

  for (const w of oldestFirst) {
    cum5 = compoundCumulative(cum5, w.weeklyAvg5d);
    cumStop = compoundCumulative(cumStop, w.weeklyAvgStopLoss);
    byKey.set(`${w.year}-${w.week}`, { cumulative5d: cum5, cumulativeStopLoss: cumStop });
  }

  return weeksNewestFirst.map((w) => {
    const c = byKey.get(`${w.year}-${w.week}`);
    return {
      ...w,
      cumulative5d: c?.cumulative5d ?? w.cumulative5d ?? null,
      cumulativeStopLoss: c?.cumulativeStopLoss ?? w.cumulativeStopLoss ?? null,
    };
  });
}

export function computeMomentumKpis(weeksNewestFirst: MomentumTrackWeek[]): MomentumKpis {
  if (weeksNewestFirst.length === 0) {
    return {
      totalReturn: null,
      cagr: null,
      hitRate: null,
      weekCount: 0,
      latestYear: null,
      latestWeek: null,
    };
  }

  const latest = weeksNewestFirst[0];
  const totalReturn = latest.cumulativeStopLoss;
  const hitRate = computeHitRate(weeksNewestFirst.map((w) => w.weeklyAvgStopLoss));
  const cagr = computeCagr(totalReturn, latest.year, latest.week);

  return {
    totalReturn,
    cagr,
    hitRate,
    weekCount: weeksNewestFirst.length,
    latestYear: latest.year,
    latestWeek: latest.week,
  };
}

export function formatRatioAsPct(ratio: number | null | undefined, digits = 1): string {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** Total return display: 12.528 → +1,252.9% */
export function formatTotalReturnPct(ratio: number | null | undefined, digits = 0): string {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  const pct = ratio * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function suggestNextWeek(from: {
  year: number;
  week: number;
  weekStart: string;
}): { year: number; week: number; weekStart: string } {
  const d = new Date(`${from.weekStart}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return { year: from.year, week: from.week + 1, weekStart: from.weekStart };
  }
  d.setUTCDate(d.getUTCDate() + 7);
  const weekStart = d.toISOString().slice(0, 10);
  let year = from.year;
  let week = from.week + 1;
  if (week > 52) {
    // Soft rollover — admin can edit freely
    week = 1;
    year = from.year + 1;
  }
  // Prefer calendar year of the new start date when it advances
  const startYear = d.getUTCFullYear();
  if (startYear > from.year) {
    year = startYear;
    week = 1;
  }
  return { year, week, weekStart };
}

export function emptyPicksTemplate(): Array<{
  strategy: 'dow' | 'large_cap' | 'nasdaq';
  ticker: string;
  direction: '';
  weekOpen: null;
  stopLossPct: null;
  takeProfitPct: null;
  currentPrice: null;
  return5d: null;
  returnStopLoss: null;
  comments: string;
  sortOrder: number;
}> {
  return [
    {
      strategy: 'dow',
      ticker: '',
      direction: '',
      weekOpen: null,
      stopLossPct: null,
      takeProfitPct: null,
      currentPrice: null,
      return5d: null,
      returnStopLoss: null,
      comments: '',
      sortOrder: 0,
    },
    {
      strategy: 'large_cap',
      ticker: '',
      direction: '',
      weekOpen: null,
      stopLossPct: null,
      takeProfitPct: null,
      currentPrice: null,
      return5d: null,
      returnStopLoss: null,
      comments: '',
      sortOrder: 1,
    },
    {
      strategy: 'nasdaq',
      ticker: '',
      direction: '',
      weekOpen: null,
      stopLossPct: null,
      takeProfitPct: null,
      currentPrice: null,
      return5d: null,
      returnStopLoss: null,
      comments: '',
      sortOrder: 2,
    },
  ];
}
