/**
 * Locks correct Current Week formulas (fixes two design-sheet bugs).
 * Run: npx tsx scripts/verify-momentum-formulas.ts
 *
 * Design bugs we do NOT copy:
 * 1) Take Profit $ checked Week Open instead of Direction → Long TP became Short TP
 * 2) Return 5-d was always price/open-1 → winning shorts showed negative returns
 */
import {
  normalizeDirection,
  return5d,
  stopLossDollars,
  takeProfitDollars,
  average,
  compoundCumulative,
  computeCagr,
  computeHitRate,
} from '../lib/momentum/formulas';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function nearly(a: number | null, b: number, eps = 1e-9) {
  assert(a != null && Math.abs(a - b) < eps, `expected ${b}, got ${a}`);
}

// --- Design sample rows (New designs 23.11.2026 Current Week) ---

// KO Long: open 100, SL -2%, TP 6%, price 101
nearly(stopLossDollars(100, -0.02, 'Long'), 98);
nearly(takeProfitDollars(100, 0.06, 'long'), 106); // sheet wrongly showed 94
nearly(return5d(100, 101, 'LONG'), 0.01);

// ORCL Short: open 200, SL -4%, TP 12%, price 190 (short wins)
nearly(stopLossDollars(200, -0.04, 'short'), 208);
nearly(takeProfitDollars(200, 0.12, 'Short'), 176);
nearly(return5d(200, 190, 'short'), 200 / 190 - 1); // sheet wrongly showed -5%

// NBIS Short: open 400, SL -10%, TP 20%, price 410 (short loses)
nearly(stopLossDollars(400, -0.1, 'short'), 440);
nearly(takeProfitDollars(400, 0.2, 'short'), 320);
nearly(return5d(400, 410, 'short'), 400 / 410 - 1); // sheet wrongly showed +2.5%

assert(normalizeDirection('Long') === 'long', 'normalize Long');
assert(normalizeDirection('') == null, 'normalize empty');
assert(takeProfitDollars(100, 0.06, null) == null, 'TP needs direction');
assert(return5d(100, 101, '') == null, 'return needs direction');

// Track record helpers
nearly(average([0.03, -0.05, 0.02]), 0);
nearly(compoundCumulative(3.661, -0.004), (1 + 3.661) * (1 - 0.004) - 1);
nearly(computeHitRate([0.01, -0.02, 0.03, 0]), 0.5); // >0 only
const cagr = computeCagr(12.528873495301028, 2026, 46);
assert(cagr != null && cagr > 0.35 && cagr < 0.45, `CAGR out of range: ${cagr}`);

console.log('momentum formulas OK (Take Profit + short Return 5-d fixes locked)');
