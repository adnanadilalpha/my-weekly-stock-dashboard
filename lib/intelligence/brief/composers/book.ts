import type { MwsBriefOutput } from '../types';
import { BRIEF_ENGINE_VERSION } from '../types';
import { withDisclaimer } from '../format';

export type BookBriefInput = {
  holdingCount: number;
  /** Cash-weighted return since each holding’s Start date (decimal). */
  bookReturn: number | null;
  bookReturnCounted: number;
  /** Average last-month price change among covered rows. */
  avg1m: number | null;
  attentionTickers: string[];
};

function friendlyMove(value: number): string {
  const pct = Math.abs(value) <= 2 ? value * 100 : value;
  const abs = Math.abs(pct);
  const rounded = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  if (pct > 0.05) return `up about ${rounded}%`;
  if (pct < -0.05) return `down about ${rounded}%`;
  return 'roughly flat';
}

/**
 * Short, plain-language book snapshot — no jargon, no “3 of 5 positions” math speak.
 */
export function composeBookBrief(input: BookBriefInput): MwsBriefOutput {
  const { holdingCount, bookReturn, bookReturnCounted, avg1m, attentionTickers } = input;
  const sourceFields: string[] = [];
  const sentences: string[] = [];

  if (holdingCount === 0) {
    return {
      version: BRIEF_ENGINE_VERSION,
      composerId: 'overview',
      title: 'Book',
      body: 'Add a few tickers, then set when you bought and how much. We’ll show how your book is doing.',
      bullets: [],
      sourceFields: [],
    };
  }

  if (bookReturn != null && Number.isFinite(bookReturn) && bookReturnCounted > 0) {
    sourceFields.push('since_start_return');
    sentences.push(`Overall, your book is ${friendlyMove(bookReturn)} since you bought.`);
  } else {
    sentences.push('Set a Start date on your holdings to see how your book is doing since you bought.');
  }

  if (avg1m != null && Number.isFinite(avg1m)) {
    sourceFields.push('1m_percent');
    sentences.push(`Lately (past month), the group is ${friendlyMove(avg1m)}.`);
  }

  if (attentionTickers.length === 1) {
    sentences.push(`${attentionTickers[0]} looks soft right now — worth a closer look.`);
  } else if (attentionTickers.length > 1) {
    const named = attentionTickers.slice(0, 2).join(' and ');
    const more = attentionTickers.length > 2 ? ` (+${attentionTickers.length - 2} more)` : '';
    sentences.push(`${named}${more} look soft right now — worth a closer look.`);
  }

  return withDisclaimer({
    composerId: 'overview',
    title: 'Book snapshot',
    body: sentences.join(' '),
    bullets: [],
    sourceFields: [...new Set(sourceFields)],
  });
}
