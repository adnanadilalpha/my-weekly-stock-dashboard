/**
 * Verify live IWM + sample rows match the AND-rule outlook formula.
 */
import { createClient } from '@supabase/supabase-js';
import { trendOutlook } from '../lib/mws-trend-outlook';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    // ignore
  }
}

loadEnvLocal();

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL_PROD ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY_PROD ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing Supabase URL / service role key');
  process.exit(1);
}

const sb = createClient(url, key);
const P = { score_mixed_high: 2.7, score_mixed_low: 1.6, extended_threshold: 0.05 };

async function main() {
  const { data: settings } = await sb
    .from('formula_settings')
    .select('key,value')
    .in('key', ['score_mixed_high', 'score_mixed_low', 'extended_threshold']);
  for (const row of settings ?? []) {
    const n = Number(row.value);
    if (!Number.isFinite(n)) continue;
    if (row.key === 'score_mixed_high') P.score_mixed_high = n;
    if (row.key === 'score_mixed_low') P.score_mixed_low = n;
    if (row.key === 'extended_threshold') P.extended_threshold = n;
  }

  const { data: iwm, error } = await sb
    .from('market_segments')
    .select(
      'ticker, weekly_trend_score, weekly_rating, weekly_outlook, weekly_price_vs_9ema, weekly_price_vs_30ema, weekly_ema9_vs_30ema, weekly_trend_description',
    )
    .eq('ticker', 'IWM')
    .maybeSingle();
  if (error) throw error;
  if (!iwm) {
    console.error('IWM not found in market_segments');
    process.exit(1);
  }

  const expect = trendOutlook(
    Number(iwm.weekly_trend_score),
    {
      priceVsShortEma: Number(iwm.weekly_price_vs_9ema),
      priceVsLongEma: Number(iwm.weekly_price_vs_30ema),
      emaCross: Number(iwm.weekly_ema9_vs_30ema),
    },
    P,
  );

  console.log('IWM weekly live:', {
    rating: iwm.weekly_rating,
    outlook: iwm.weekly_outlook,
    expect,
    cross: Number(iwm.weekly_ema9_vs_30ema),
    pvl: Number(iwm.weekly_price_vs_30ema),
    desc: String(iwm.weekly_trend_description ?? '').slice(0, 80),
  });

  if (iwm.weekly_outlook !== 'Stable' || expect !== 'Stable') {
    console.error('FAIL: IWM weekly must be Stable');
    process.exit(1);
  }
  if (iwm.weekly_rating !== 'Sideways') {
    console.error('FAIL: IWM weekly rating expected Sideways, got', iwm.weekly_rating);
    process.exit(1);
  }
  console.log('PASS: IWM weekly = Sideways + Stable (client case)');

  // Spot-check all market_segments weekly sideways rows
  const { data: rows, error: e2 } = await sb
    .from('market_segments')
    .select(
      'ticker, weekly_trend_score, weekly_outlook, weekly_price_vs_9ema, weekly_price_vs_30ema, weekly_ema9_vs_30ema',
    );
  if (e2) throw e2;

  let fail = 0;
  let n = 0;
  for (const row of rows ?? []) {
    const score = Number(row.weekly_trend_score);
    const pvs = row.weekly_price_vs_9ema == null ? null : Number(row.weekly_price_vs_9ema);
    const pvl = row.weekly_price_vs_30ema == null ? null : Number(row.weekly_price_vs_30ema);
    const cross = row.weekly_ema9_vs_30ema == null ? null : Number(row.weekly_ema9_vs_30ema);
    if (!Number.isFinite(score) || pvs == null || pvl == null) continue;
    const got = trendOutlook(score, { priceVsShortEma: pvs, priceVsLongEma: pvl, emaCross: cross }, P);
    n += 1;
    if (row.weekly_outlook !== got) {
      fail += 1;
      console.error(`FAIL ${row.ticker} weekly db=${row.weekly_outlook} expect=${got}`);
    }
  }
  if (fail) {
    console.error(`${fail}/${n} market_segments weekly mismatches`);
    process.exit(1);
  }
  console.log(`PASS: all ${n} market_segments weekly outlooks match`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
