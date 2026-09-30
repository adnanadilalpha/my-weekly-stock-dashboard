/**
 * Cases for Sideways outlook — IWM is the client-reported bug.
 * Run: npx tsx scripts/verify-trend-outlook.ts
 */
import { trendOutlook } from '../lib/mws-trend-outlook';

const P = {
  score_mixed_high: 2.7,
  score_mixed_low: 1.6,
  extended_threshold: 0.05,
};

type Case = {
  name: string;
  score: number;
  pvs: number | null;
  pvl: number | null;
  cross: number | null;
  expect: string;
};

const cases: Case[] = [
  // Client bug: IWM weekly — price within ±1.5% of 30w EMA → Stable (not Firming from cross)
  {
    name: 'IWM weekly (client)',
    score: 2.17,
    pvs: -0.032,
    pvl: -0.0127,
    cross: 0.0199,
    expect: 'Stable',
  },
  // Firming: price > +1.5% above long EMA
  {
    name: 'sideways true Firming',
    score: 2.0,
    pvs: 0.02,
    pvl: 0.02,
    cross: 0.02,
    expect: 'Firming',
  },
  // Softening: price < -1.5% below long EMA
  {
    name: 'sideways true Softening',
    score: 2.0,
    pvs: -0.02,
    pvl: -0.02,
    cross: -0.02,
    expect: 'Softening',
  },
  // Cross firming but price near long EMA → Stable
  {
    name: 'sideways cross-up price-near → Stable',
    score: 2.17,
    pvs: -0.03,
    pvl: -0.01,
    cross: 0.02,
    expect: 'Stable',
  },
  // Price barely above long EMA (< 1.5%) → Stable even if cross is strong
  {
    name: 'sideways small pvl + strong cross → Stable',
    score: 2.0,
    pvs: 0.01,
    pvl: 0.01,
    cross: 0.02,
    expect: 'Stable',
  },
  // Price barely below → Stable
  {
    name: 'sideways small negative pvl → Stable',
    score: 2.0,
    pvs: -0.01,
    pvl: -0.01,
    cross: -0.02,
    expect: 'Stable',
  },
  // Uptrend / downtrend unchanged
  { name: 'uptrend Extended', score: 4.0, pvs: 0.06, pvl: 0.08, cross: 0.02, expect: 'Extended' },
  { name: 'uptrend Reversing', score: 3.2, pvs: -0.02, pvl: -0.01, cross: 0.01, expect: 'Reversing' },
  { name: 'uptrend Cooling', score: 3.2, pvs: -0.02, pvl: 0.01, cross: -0.01, expect: 'Cooling' },
  { name: 'uptrend Stable', score: 3.2, pvs: 0.02, pvl: 0.03, cross: 0.01, expect: 'Stable' },
  { name: 'AAPL daily', score: 3.17, pvs: -0.0169, pvl: -0.0036, cross: 0.0135, expect: 'Reversing' },
  { name: 'downtrend Stable', score: 0, pvs: -0.01, pvl: -0.02, cross: -0.01, expect: 'Stable' },
  { name: 'JPM weekly Cooling', score: 3.17, pvs: -0.034, pvl: 0.007, cross: 0.042, expect: 'Cooling' },
];

let failed = 0;
for (const c of cases) {
  const got = trendOutlook(
    c.score,
    { priceVsShortEma: c.pvs, priceVsLongEma: c.pvl, emaCross: c.cross },
    P,
  );
  if (got !== c.expect) {
    failed += 1;
    console.error(`FAIL ${c.name}: expected ${c.expect}, got ${got}`);
  } else {
    console.log(`ok   ${c.name} → ${got}`);
  }
}

if (failed) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} cases passed`);
