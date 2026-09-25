import type { MwsBriefOutput, PortfolioHoldingBriefInput } from '../types';
import { missingBrief, withDisclaimer } from '../format';

/**
 * Present packaged MWS narratives for a holding — never invent new prose.
 */
export function composePortfolioHoldingBrief(input: PortfolioHoldingBriefInput): MwsBriefOutput {
  const ticker = (input.ticker ?? 'Holding').toUpperCase();
  const inCoverage = input.in_mws_coverage !== false;

  if (!inCoverage) {
    return withDisclaimer({
      composerId: 'portfolio_holding',
      title: `${ticker} · Not in MWS`,
      body: 'This ticker is not in the MWS universe, so packaged MWS narratives are not available.',
      bullets: [],
      sourceFields: [],
    });
  }

  const trend = (input.daily_trend_description ?? '').trim();
  const perfDesc = (input.daily_performance_description ?? '').trim();
  const summary = (input.daily_performance_summary ?? '').trim();
  const packaged = [perfDesc || summary, trend].filter(Boolean).join('\n\n');

  if (!packaged) {
    return missingBrief('portfolio_holding', `${ticker} · MWS`, [
      'daily_trend_description',
      'daily_performance_description',
      'daily_performance_summary',
    ]);
  }

  const bullets: string[] = [];
  if (input.daily_rating) bullets.push(input.daily_rating);
  if (input.daily_outlook) bullets.push(input.daily_outlook);
  const strength = input.performance_strength ?? input.daily_performance_strength;
  if (strength) bullets.push(strength);
  if (summary && perfDesc) bullets.push(summary);

  return withDisclaimer({
    composerId: 'portfolio_holding',
    title: [ticker, strength, input.daily_rating].filter(Boolean).join(' · '),
    body: packaged,
    bullets,
    sourceFields: [
      ...(perfDesc ? ['daily_performance_description'] : []),
      ...(summary ? ['daily_performance_summary'] : []),
      ...(trend ? ['daily_trend_description'] : []),
      ...(input.daily_rating ? ['daily_rating'] : []),
      ...(input.daily_outlook ? ['daily_outlook'] : []),
      ...(strength ? ['performance_strength'] : []),
    ],
  });
}
