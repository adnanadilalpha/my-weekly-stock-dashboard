import type { MwsBriefOutput, PerformanceBriefInput } from '../types';
import { missingBrief, withDisclaimer } from '../format';

/**
 * Present packaged MWS performance narrative only — never invent new prose.
 * Prefers daily_performance_description; falls back to daily_performance_summary.
 */
export function composePerformanceBrief(input: PerformanceBriefInput): MwsBriefOutput {
  const strength = input.performance_strength ?? input.daily_performance_strength ?? null;
  const distance = input.distance_to_highs ?? input.daily_distance_to_highs ?? null;
  const summary = (input.daily_performance_summary ?? '').trim();
  const description = (input.daily_performance_description ?? '').trim();
  const ticker = (input.ticker ?? 'This ticker').toUpperCase();

  const packaged = description || summary;
  const sourceFields = [
    'daily_performance_description',
    'daily_performance_summary',
    'performance_strength',
    'distance_to_highs',
  ];

  if (!packaged) {
    return missingBrief('performance', `${ticker}: Performance`, sourceFields);
  }

  const bullets: string[] = [];
  if (summary && description) bullets.push(summary);
  if (strength) bullets.push(strength);
  if (distance) bullets.push(distance);
  if (input.daily_vs_spy_comparison) bullets.push(input.daily_vs_spy_comparison);
  if (input.daily_vs_sector_comparison) bullets.push(input.daily_vs_sector_comparison);
  else if (input.daily_vs_benchmark_comparison) bullets.push(input.daily_vs_benchmark_comparison);

  return withDisclaimer({
    composerId: 'performance',
    title: strength ? `${ticker} · ${strength}` : `${ticker} · Performance`,
    body: packaged,
    bullets,
    sourceFields: [
      ...(description ? ['daily_performance_description'] : []),
      ...(summary ? ['daily_performance_summary'] : []),
      ...(strength ? ['performance_strength'] : []),
      ...(distance ? ['distance_to_highs'] : []),
      ...(input.daily_vs_spy_comparison ? ['daily_vs_spy_comparison'] : []),
      ...(input.daily_vs_sector_comparison ? ['daily_vs_sector_comparison'] : []),
      ...(input.daily_vs_benchmark_comparison ? ['daily_vs_benchmark_comparison'] : []),
    ],
  });
}
