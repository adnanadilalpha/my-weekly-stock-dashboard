import type { MwsBriefOutput } from '../types';
import { BRIEF_ENGINE_VERSION } from '../types';
import { withDisclaimer } from '../format';
import type { QuadrantId } from '../types';

export type BookBriefInput = {
  holdingCount: number;
  /** Cash-weighted return since each holding’s Start date (decimal). */
  bookReturn: number | null;
  bookReturnCounted: number;
  /** Average last-month price change among covered rows. */
  avg1m: number | null;
  attentionTickers: string[];
  /** Optional quadrant id per attention ticker (same order as attentionTickers). */
  attentionQuadrants?: Array<Exclude<QuadrantId, 'UNKNOWN'> | 'UNKNOWN' | null>;
  /** Open-book quadrant mix when EMA data exists. */
  quadrantCounts?: Partial<Record<Exclude<QuadrantId, 'UNKNOWN'>, number>>;
  closedCount?: number;
};

function friendlyMove(value: number): string {
  const pct = Math.abs(value) <= 2 ? value * 100 : value;
  const abs = Math.abs(pct);
  const rounded = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  if (pct > 0.05) return `up about ${rounded}%`;
  if (pct < -0.05) return `down about ${rounded}%`;
  return 'roughly flat';
}

function quadrantMixLine(
  counts: Partial<Record<Exclude<QuadrantId, 'UNKNOWN'>, number>> | undefined,
): string | null {
  if (!counts) return null;
  const entries = (
    Object.entries(counts) as Array<[Exclude<QuadrantId, 'UNKNOWN'>, number]>
  ).filter(([, n]) => n > 0);
  if (entries.length === 0) return null;

  const labels: Record<Exclude<QuadrantId, 'UNKNOWN'>, string> = {
    SYNCED_UPTREND: 'Synced Uptrend',
    PULLBACK: 'Pullback',
    TURNING: 'Turning',
    BROKEN_TREND: 'Broken Trend',
  };

  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  if (entries.length === 1) {
    return `On EMA quadrants, the book sits in ${labels[top[0]]} (${top[1]} name${top[1] === 1 ? '' : 's'}).`;
  }
  const second = entries[1];
  return `On EMA quadrants, most names are in ${labels[top[0]]} (${top[1]}), with ${labels[second[0]]} next (${second[1]}).`;
}

/**
 * Short, plain-language book snapshot — built-in composer (no external LLM).
 */
export function composeBookBrief(input: BookBriefInput): MwsBriefOutput {
  const {
    holdingCount,
    bookReturn,
    bookReturnCounted,
    avg1m,
    attentionTickers,
    attentionQuadrants,
    quadrantCounts,
    closedCount = 0,
  } = input;
  const sourceFields: string[] = [];
  const sentences: string[] = [];

  if (holdingCount === 0) {
    return {
      version: BRIEF_ENGINE_VERSION,
      composerId: 'overview',
      title: 'Book',
      body:
        closedCount > 0
          ? 'No open holdings right now. Past positions are still available below for review.'
          : 'Add a few tickers, then set shares, average entry, and Start. We’ll summarize how your book is doing.',
      bullets: [],
      sourceFields: [],
    };
  }

  if (bookReturn != null && Number.isFinite(bookReturn) && bookReturnCounted > 0) {
    sourceFields.push('since_start_return');
    if (bookReturnCounted === holdingCount) {
      sentences.push(`Your open book is ${friendlyMove(bookReturn)} since you bought.`);
    } else {
      sentences.push(
        `Where Start dates are set (${bookReturnCounted} of ${holdingCount}), the book is ${friendlyMove(bookReturn)} since you bought.`,
      );
    }
  } else {
    sentences.push('Set a Start date on your holdings to see how the book has done since you bought.');
  }

  if (avg1m != null && Number.isFinite(avg1m)) {
    sourceFields.push('1m_percent');
    const tone =
      avg1m > 0.02
        ? 'The past month has been a lift for the group'
        : avg1m < -0.02
          ? 'The past month has been a drag for the group'
          : 'The past month has been quiet for the group';
    sentences.push(`${tone} (${friendlyMove(avg1m)}).`);
  }

  const mix = quadrantMixLine(quadrantCounts);
  if (mix) {
    sourceFields.push('daily_price_vs_21ema', 'weekly_price_vs_30ema');
    sentences.push(mix);
  }

  if (attentionTickers.length >= 1) {
    const shortQuad: Record<Exclude<QuadrantId, 'UNKNOWN'>, string> = {
      SYNCED_UPTREND: 'Synced Uptrend',
      PULLBACK: 'Pullback',
      TURNING: 'Turning',
      BROKEN_TREND: 'Broken Trend',
    };
    const labeled = attentionTickers.slice(0, 3).map((t, i) => {
      const q = attentionQuadrants?.[i];
      if (q && q !== 'UNKNOWN') return `${t} (${shortQuad[q]})`;
      return t;
    });
    if (attentionTickers.length === 1) {
      sentences.push(`${labeled[0]} stands out on the quadrant / recent-price screen.`);
    } else {
      const more = attentionTickers.length > 3 ? ` (+${attentionTickers.length - 3} more)` : '';
      sentences.push(
        `${labeled.slice(0, -1).join(', ')} and ${labeled[labeled.length - 1]}${more} stand out on the quadrant / recent-price screen.`,
      );
    }
  }

  if (closedCount > 0) {
    sentences.push(
      `${closedCount} past position${closedCount === 1 ? '' : 's'} archived for analysis (not in these totals).`,
    );
  }

  return withDisclaimer({
    composerId: 'overview',
    title: 'Book snapshot',
    body: sentences.join(' '),
    bullets: [],
    sourceFields: [...new Set(sourceFields)],
  });
}
