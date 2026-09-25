import type { MwsBriefOutput } from '../types';
import { BRIEF_ENGINE_VERSION } from '../types';
import { withDisclaimer } from '../format';
import type { RatingBriefInput, PerformanceBriefInput } from '../types';

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

function trendPhrase(rating: string | null, outlook: string | null, timeframe: 'daily' | 'weekly'): string | null {
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

  const o = (outlook ?? '').toLowerCase();
  let state = '';
  if (o === 'stable') state = ', and the setup looks steady';
  else if (o === 'extended') state = ', though it looks a bit stretched';
  else if (o === 'cooling') state = ', with some cooling after strength';
  else if (o === 'warming') state = ', with early signs of improvement';
  else if (o === 'firming') state = ', and conditions are firming';
  else if (o === 'softening') state = ', with a softer tone';
  else if (o === 'reversing') state = ', with signs of a possible turn';
  else if (outlook) state = ` (${outlook})`;

  return `${core}${state} ${when}`;
}

/**
 * Compact, plain-language quick-read for the ticker page.
 * Uses structured MWS fields only — short sentences, no jargon dump.
 */
export function composeOverviewBrief(input: OverviewBriefInput): MwsBriefOutput {
  const ticker = (input.ticker ?? 'This ticker').toUpperCase();
  const tf = input.timeframe === 'weekly' ? 'weekly' : 'daily';
  const rating = (tf === 'weekly' ? input.weekly_rating : input.daily_rating) ?? null;
  const outlook = (tf === 'weekly' ? input.weekly_outlook : input.daily_outlook) ?? null;
  const strength = input.performance_strength ?? input.daily_performance_strength ?? null;
  const distance = input.distance_to_highs ?? input.daily_distance_to_highs ?? null;
  const ret1m = input['1m_percent'] ?? input.daily_1m_percent ?? null;
  const ret3m = input['3m_percent'] ?? input.daily_3m_percent ?? null;
  const vsSpy = parseBenchRelation(input.daily_vs_spy_comparison);
  const vsSec = parseBenchRelation(
    input.daily_vs_sector_comparison ?? input.daily_vs_benchmark_comparison,
  );

  const sourceFields: string[] = [];
  const sentences: string[] = [];

  const trend = trendPhrase(rating, outlook, tf);
  if (trend) {
    if (rating) sourceFields.push(tf === 'weekly' ? 'weekly_rating' : 'daily_rating');
    if (outlook) sourceFields.push(tf === 'weekly' ? 'weekly_outlook' : 'daily_outlook');
    sentences.push(`${ticker} is ${trend}.`);
  }

  // Performance sentence
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
    // Capitalize first letter
    s = s.charAt(0).toUpperCase() + s.slice(1);
    sentences.push(`${s}.`);
  }

  // Vs benchmarks — one short clause
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
