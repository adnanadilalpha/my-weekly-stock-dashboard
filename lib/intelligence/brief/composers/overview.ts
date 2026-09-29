import type { MwsBriefOutput } from '../types';
import { BRIEF_ENGINE_VERSION } from '../types';
import { withDisclaimer } from '../format';
import type { RatingBriefInput, PerformanceBriefInput } from '../types';
import { quadrantFromPct } from './quadrant';

export type OverviewBriefInput = RatingBriefInput & PerformanceBriefInput;

function friendlyPct(value: number): string {
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  const abs = Math.abs(pct);
  const rounded = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  if (pct > 0.05) return `up about ${rounded}%`;
  if (pct < -0.05) return `down about ${rounded}%`;
  return 'roughly flat';
}

function parseBenchRelation(raw: string | null | undefined): { symbol: string; relation: string } | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || s === 'N/A') return null;
  const m = s.match(/^\$?([A-Za-z0-9.\-]+)\s*:\s*(Leading|In line|Lagging)/i);
  if (!m) return null;
  return { symbol: m[1].toUpperCase(), relation: m[2].toLowerCase() };
}

function relationPhrase(symbol: string, relation: string): string {
  if (relation === 'leading') return `running ahead of ${symbol}`;
  if (relation === 'lagging') return `trailing ${symbol}`;
  return `moving roughly with ${symbol}`;
}

function trendPhrase(rating: string | null, timeframe: 'daily' | 'weekly'): string | null {
  if (!rating) return null;
  const when = timeframe === 'weekly' ? 'on the weekly chart' : 'on the daily chart';
  const r = rating.toLowerCase();

  let core: string;
  if (r.includes('strong uptrend')) core = 'looking firmly strong';
  else if (r.includes('uptrend')) core = 'in a solid uptrend';
  else if (r.includes('strong downtrend')) core = 'under clear pressure';
  else if (r.includes('downtrend')) core = 'in a downtrend';
  else if (r.includes('sideways')) core = 'mostly sideways';
  else core = `in a ${rating} phase`;

  return `${core} ${when}`;
}

const QUADRANT_SNAPSHOT: Record<
  'SYNCED_UPTREND' | 'PULLBACK' | 'BROKEN_TREND' | 'TURNING',
  string
> = {
  SYNCED_UPTREND: 'Synced Uptrend — above both the 21-day and 30-week EMA',
  PULLBACK: 'Pullback — above the 30-week EMA but below the 21-day EMA',
  BROKEN_TREND: 'Broken Trend — below both the 21-day and 30-week EMA',
  TURNING: 'Turning — below the 30-week EMA but above the 21-day EMA',
};

/**
 * Compact, plain-language quick-read for the ticker page (built-in; no external LLM).
 */
export function composeOverviewBrief(input: OverviewBriefInput): MwsBriefOutput {
  const ticker = (input.ticker ?? 'This ticker').toUpperCase();
  const tf = input.timeframe === 'weekly' ? 'weekly' : 'daily';
  const rating = (tf === 'weekly' ? input.weekly_rating : input.daily_rating) ?? null;
  const strength = input.performance_strength ?? input.daily_performance_strength ?? null;
  const distance = input.distance_to_highs ?? input.daily_distance_to_highs ?? null;
  const ret1m = input['1m_percent'] ?? input.daily_1m_percent ?? null;
  const ret3m = input['3m_percent'] ?? input.daily_3m_percent ?? null;
  const vsSpy = parseBenchRelation(input.daily_vs_spy_comparison);
  const vsSec = parseBenchRelation(
    input.daily_vs_sector_comparison ?? input.daily_vs_benchmark_comparison,
  );
  const pct21 = input.pct_from_21d_ema ?? input.daily_price_vs_21ema ?? null;
  const pct30 = input.pct_from_30w_ema ?? input.weekly_price_vs_30ema ?? null;
  const quadrant = quadrantFromPct(pct21, pct30);

  const sourceFields: string[] = [];
  const sentences: string[] = [];

  if (quadrant !== 'UNKNOWN') {
    sourceFields.push('daily_price_vs_21ema', 'weekly_price_vs_30ema');
    sentences.push(`${ticker} is in ${QUADRANT_SNAPSHOT[quadrant]}.`);
  } else {
    const trend = trendPhrase(rating, tf);
    if (trend) {
      if (rating) sourceFields.push(tf === 'weekly' ? 'weekly_rating' : 'daily_rating');
      sentences.push(`${ticker} is ${trend}.`);
    }
  }

  const perfBits: string[] = [];
  if (strength) {
    sourceFields.push('performance_strength');
    const s = strength.toLowerCase();
    if (s === 'strong') perfBits.push('recent results have been strong');
    else if (s === 'weak') perfBits.push('recent results have been soft');
    else perfBits.push('recent results look mixed');
  }
  if (distance) {
    sourceFields.push('distance_to_highs');
    const d = distance.toLowerCase();
    if (d.includes('close')) perfBits.push('and price is near its highs');
    else if (d.includes('medium')) perfBits.push('with some room below the highs');
    else if (d.includes('far')) perfBits.push('and still well off the highs');
  }

  const moveBits: string[] = [];
  if (ret1m != null && Number.isFinite(ret1m)) {
    sourceFields.push('1m_percent');
    moveBits.push(`${friendlyPct(ret1m)} over the past month`);
  }
  if (ret3m != null && Number.isFinite(ret3m)) {
    sourceFields.push('3m_percent');
    moveBits.push(`${friendlyPct(ret3m)} over three months`);
  }

  if (perfBits.length || moveBits.length) {
    let s = '';
    if (perfBits.length) s = perfBits.join(' ');
    if (moveBits.length) {
      const moves = moveBits.join(' and ');
      s = s ? `${s} — ${moves}` : `Price is ${moves}`;
    }
    s = s.charAt(0).toUpperCase() + s.slice(1);
    sentences.push(`${s}.`);
  }

  const vsParts: string[] = [];
  if (vsSpy) {
    sourceFields.push('daily_vs_spy_comparison');
    vsParts.push(relationPhrase(vsSpy.symbol, vsSpy.relation));
  }
  if (vsSec && (!vsSpy || vsSec.symbol !== vsSpy.symbol)) {
    sourceFields.push(
      input.daily_vs_sector_comparison
        ? 'daily_vs_sector_comparison'
        : 'daily_vs_benchmark_comparison',
    );
    vsParts.push(relationPhrase(vsSec.symbol, vsSec.relation));
  }
  if (vsParts.length) {
    sentences.push(`Versus peers, it’s ${vsParts.join(' and ')}.`);
  }

  if (sentences.length === 0) {
    return {
      version: BRIEF_ENGINE_VERSION,
      composerId: 'overview',
      title: ticker,
      body: 'Not enough MWS data yet for a quick read on this ticker.',
      bullets: [],
      sourceFields: [],
    };
  }

  return withDisclaimer({
    composerId: 'overview',
    title: ticker,
    body: sentences.join(' '),
    bullets: [],
    disclaimer: undefined,
    sourceFields: [...new Set(sourceFields)],
  });
}
