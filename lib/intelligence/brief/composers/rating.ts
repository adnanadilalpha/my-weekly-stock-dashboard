import type { MwsBriefOutput, RatingBriefInput } from '../types';
import { missingBrief, withDisclaimer } from '../format';

/**
 * Present packaged MWS trend narrative only — never invent new prose.
 */
export function composeRatingBrief(input: RatingBriefInput): MwsBriefOutput {
  const tf = input.timeframe === 'weekly' ? 'weekly' : 'daily';
  const rating = tf === 'weekly' ? input.weekly_rating : input.daily_rating;
  const outlook = tf === 'weekly' ? input.weekly_outlook : input.daily_outlook;
  const score = tf === 'weekly' ? input.weekly_trend_score : input.daily_trend_score;
  const description =
    tf === 'weekly' ? input.weekly_trend_description : input.daily_trend_description;

  const sourceFields =
    tf === 'weekly'
      ? ['weekly_trend_score', 'weekly_rating', 'weekly_outlook', 'weekly_trend_description']
      : ['daily_trend_score', 'daily_rating', 'daily_outlook', 'daily_trend_description'];

  const ticker = (input.ticker ?? 'This ticker').toUpperCase();
  const packaged = (description ?? '').trim();

  if (!packaged) {
    return missingBrief('rating', `${ticker}: Trend`, sourceFields);
  }

  const bullets: string[] = [];
  if (rating) bullets.push(rating);
  if (outlook) bullets.push(outlook);
  if (score != null && Number.isFinite(score)) bullets.push(`Trend Score ${Number(score).toFixed(2)}`);

  return withDisclaimer({
    composerId: 'rating',
    title: rating ? `${ticker} · ${rating}` : `${ticker} · Trend`,
    body: packaged,
    bullets,
    sourceFields: [
      tf === 'weekly' ? 'weekly_trend_description' : 'daily_trend_description',
      ...(rating ? [tf === 'weekly' ? 'weekly_rating' : 'daily_rating'] : []),
      ...(outlook ? [tf === 'weekly' ? 'weekly_outlook' : 'daily_outlook'] : []),
      ...(score != null ? [tf === 'weekly' ? 'weekly_trend_score' : 'daily_trend_score'] : []),
    ],
  });
}
