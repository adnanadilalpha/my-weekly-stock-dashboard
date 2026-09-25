/**
 * Assert Brief composers match golden fixtures (run: npx tsx lib/intelligence/brief/scripts/verify-fixtures.ts)
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  composeRatingBrief,
  composePerformanceBrief,
  composeQuadrantBrief,
  composePortfolioHoldingBrief,
  composeOverviewBrief,
} from '../index';

const composers = {
  rating: composeRatingBrief,
  performance: composePerformanceBrief,
  quadrant: composeQuadrantBrief,
  portfolio_holding: composePortfolioHoldingBrief,
  overview: composeOverviewBrief,
} as const;

let failed = 0;
for (const name of Object.keys(composers) as (keyof typeof composers)[]) {
  const path = join(process.cwd(), 'docs/fixtures/brief', `${name}.json`);
  const file = JSON.parse(readFileSync(path, 'utf8')) as {
    cases: { input: never; output: unknown }[];
  };
  const fn = composers[name] as (input: never) => unknown;
  for (let i = 0; i < file.cases.length; i++) {
    const got = JSON.stringify(fn(file.cases[i].input));
    const want = JSON.stringify(file.cases[i].output);
    if (got !== want) {
      console.error(`FAIL ${name} case ${i}`);
      failed += 1;
    }
  }
}

if (failed > 0) {
  console.error(`${failed} fixture mismatch(es)`);
  process.exit(1);
}
console.log('All Brief fixtures match.');
