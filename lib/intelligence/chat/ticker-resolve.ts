/** Common company → ticker aliases for chat questions (incl. frequent typos). */
export const NAME_ALIASES: Record<string, string> = {
  nvidia: 'NVDA',
  nvd: 'NVDA', // common shorthand / typo
  apple: 'AAPL',
  appl: 'AAPL', // common typo for AAPL
  aaple: 'AAPL',
  tesla: 'TSLA',
  tsla: 'TSLA',
  microsoft: 'MSFT',
  microsft: 'MSFT',
  amazon: 'AMZN',
  google: 'GOOGL',
  alphabet: 'GOOGL',
  meta: 'META',
  facebook: 'META',
  netflix: 'NFLX',
  amd: 'AMD',
  intel: 'INTC',
  broadcom: 'AVGO',
  silver: 'SLV',
  gold: 'GLD',
  spy: 'SPY',
  qqq: 'QQQ',
};

/** Canonical tickers used for 1-edit typo correction when an exact lookup misses. */
const TYPO_CORRECTION_TARGETS = [
  ...new Set([
    ...Object.values(NAME_ALIASES),
    'AAPL',
    'ABT',
    'AMZN',
    'GOOGL',
    'GOOG',
    'MSFT',
    'META',
    'NVDA',
    'TSLA',
    'SPY',
    'QQQ',
    'IWM',
    'DIA',
    'GLD',
    'SLV',
  ]),
];

/** Levenshtein distance — used only for short ticker typos (≤5 chars). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/**
 * Map a missed symbol to a unique 1-edit canonical ticker (e.g. APPL → AAPL).
 * Returns null when no unique match exists.
 */
export function suggestTickerCorrection(raw: string): string | null {
  const u = raw.trim().toUpperCase();
  if (!u || u.length > 5) return null;
  const aliasHit = NAME_ALIASES[u.toLowerCase()];
  if (aliasHit) return aliasHit;

  let match: string | null = null;
  for (const target of TYPO_CORRECTION_TARGETS) {
    if (editDistance(u, target) !== 1) continue;
    if (match && match !== target) return null; // ambiguous
    match = target;
  }
  return match;
}
