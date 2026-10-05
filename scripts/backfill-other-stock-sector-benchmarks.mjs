#!/usr/bin/env node
/**
 * Backfill other_stocks: sector_etf + second benchmark from Farouk sector mapping,
 * and clean company names. Fixes stale QQQ second benchmarks.
 *
 * Usage: node --env-file=.env.local scripts/backfill-other-stock-sector-benchmarks.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const FAROUK_SECTOR_TO_ETF = {
  'Basic Materials': 'XLB',
  'Communication Services': 'XLC',
  'Consumer Cyclical': 'XLY',
  'Consumer Defensive': 'XLP',
  Energy: 'XLE',
  Financial: 'XLF',
  Healthcare: 'XLV',
  Industrials: 'XLI',
  'Real Estate': 'XLRE',
  Technology: 'XLK',
  Utilities: 'XLU',
};

const ETF_NAMES = {
  XLY: '$XLY (Consumer Cyclical)',
  XLP: '$XLP (Consumer Defensive)',
  XLC: '$XLC (Communication Services)',
  XLE: '$XLE (Energy)',
  XLF: '$XLF (Financial)',
  XLV: '$XLV (Healthcare)',
  XLI: '$XLI (Industrials)',
  XLB: '$XLB (Basic Materials)',
  XLRE: '$XLRE (Real Estate)',
  XLK: '$XLK (Technology)',
  XLU: '$XLU (Utilities)',
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL_PROD || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_PROD || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SERVICE_ROLE_KEY');
  process.exit(1);
}

const meta = JSON.parse(readFileSync(resolve(ROOT, 'lib/screening/client-ticker-meta.json'), 'utf8'));

function headers(extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function fetchAll(table, select) {
  const out = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const res = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=ticker&limit=${page}&offset=${from}`, {
      headers: headers(),
    });
    if (!res.ok) throw new Error(`${table} ${res.status} ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return out;
}

function score(diff, leading = 0.03, lagging = 0.03) {
  if (diff == null || !Number.isFinite(diff)) return 1;
  if (diff > leading) return 3;
  if (diff < -lagging) return 0;
  return 1;
}

function comparison(t1m, t3m, b1m, b3m, etf) {
  if (t1m == null || t3m == null || b1m == null || b3m == null) return `$${etf}: In line`;
  const total = score(t1m - b1m) + score(t3m - b3m);
  if (total > 4) return `$${etf}: Leading`;
  if (total <= 1.1) return `$${etf}: Lagging`;
  return `$${etf}: In line`;
}

function metaRow(ticker) {
  const row = meta[ticker] || meta[ticker.replace(/-/g, '.')] || meta[ticker.replace(/\./g, '-')];
  if (!row) return null;
  if (row.length >= 4) {
    const [name, sector, industry, cap] = row;
    return { name, sector, industry, cap };
  }
  const [sector, industry, cap] = row;
  return { name: null, sector, industry, cap };
}

const sectors = await fetchAll('sectors', 'ticker,1m_percent,3m_percent,daily_1m_percent,daily_3m_percent');
const sectorByTicker = new Map(sectors.map((s) => [String(s.ticker).toUpperCase(), s]));

const stocks = await fetchAll(
  'other_stocks',
  'id,ticker,company_name,sector_etf,second_benchmark_ticker,1m_percent,3m_percent,daily_1m_percent,daily_3m_percent',
);

let updated = 0;
let skipped = 0;
const errors = [];

for (const row of stocks) {
  const ticker = String(row.ticker || '').toUpperCase();
  const m = metaRow(ticker);
  if (!m || m.cap === 'ETF') {
    skipped += 1;
    continue;
  }
  const etf = FAROUK_SECTOR_TO_ETF[m.sector];
  if (!etf) {
    skipped += 1;
    continue;
  }
  const bench = sectorByTicker.get(etf);
  const b1m = bench?.['1m_percent'] ?? bench?.daily_1m_percent ?? null;
  const b3m = bench?.['3m_percent'] ?? bench?.daily_3m_percent ?? null;
  const t1m = row['1m_percent'] ?? row.daily_1m_percent ?? null;
  const t3m = row['3m_percent'] ?? row.daily_3m_percent ?? null;
  const rel = comparison(
    t1m == null ? null : Number(t1m),
    t3m == null ? null : Number(t3m),
    b1m == null ? null : Number(b1m),
    b3m == null ? null : Number(b3m),
    etf,
  );

  const patch = {
    sector_etf: etf,
    second_benchmark_ticker: etf,
    second_benchmark_name: ETF_NAMES[etf] ?? `$${etf}`,
    second_benchmark_1m_percent: b1m,
    second_benchmark_3m_percent: b3m,
    daily_vs_benchmark_comparison: rel,
    weekly_vs_benchmark_comparison: rel,
    daily_vs_sector_comparison: rel,
    weekly_vs_sector_comparison: rel,
  };
  if (m.name && String(m.name).trim()) {
    patch.company_name = String(m.name).trim();
  }

  // Skip no-op writes when already correct
  if (
    row.sector_etf === etf &&
    row.second_benchmark_ticker === etf &&
    (!m.name || row.company_name === m.name)
  ) {
    skipped += 1;
    continue;
  }

  const res = await fetch(`${url}/rest/v1/other_stocks?id=eq.${row.id}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    errors.push(`${ticker}: ${res.status} ${await res.text()}`);
    continue;
  }
  updated += 1;
  if (updated % 100 === 0) console.log('updated', updated);
}

console.log({ updated, skipped, errors: errors.slice(0, 10), errorCount: errors.length });

const gisRes = await fetch(
  `${url}/rest/v1/other_stocks?ticker=eq.GIS&select=ticker,company_name,sector_etf,second_benchmark_ticker,second_benchmark_name,daily_vs_benchmark_comparison`,
  { headers: headers() },
);
console.log('GIS after', await gisRes.json());
