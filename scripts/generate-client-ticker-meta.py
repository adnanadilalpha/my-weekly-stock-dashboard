#!/usr/bin/env python3
"""Regenerate lib/screening/client-ticker-meta.* from Sector and Industry Mapping.xlsx

Usage:
  python3 scripts/generate-client-ticker-meta.py [path/to/mapping.xlsx]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError as e:
    raise SystemExit('pip install openpyxl') from e

ROOT = Path(__file__).resolve().parents[1]
SRC = (
    Path(sys.argv[1])
    if len(sys.argv) > 1
    else Path.home() / 'Downloads' / 'Sector and Industry Mapping.xlsx'
)
OUT = ROOT / 'lib' / 'screening'
CAP_ORDER = ['Mega Cap', 'Large Cap', 'Mid Cap', 'Small Cap', 'ETF']

wb = openpyxl.load_workbook(SRC, data_only=True)
rows = list(wb.active.iter_rows(values_only=True))
# Row format: [cleanName, sector, industry, cap]
by_ticker: dict[str, list[str]] = {}
sectors: set[str] = set()
industries: set[str] = set()
caps: set[str] = set()

for r in rows[1:]:
    if not r or r[0] is None:
        continue
    ticker = str(r[0]).strip().upper().replace(' ', '')
    if not ticker:
        continue
    name = str(r[1]).strip() if r[1] is not None else ''
    sector = str(r[2]).strip() if r[2] is not None else ''
    industry = str(r[3]).strip() if r[3] is not None else ''
    cap = str(r[5]).strip() if r[5] is not None else ''
    if sector:
        sectors.add(sector)
    if industry:
        industries.add(industry)
    if cap:
        caps.add(cap)
    if ticker not in by_ticker:
        by_ticker[ticker] = [name, sector, industry, cap]
    alt = ticker.replace('-', '.') if '-' in ticker else ticker.replace('.', '-')
    if alt != ticker and alt not in by_ticker:
        by_ticker[alt] = by_ticker[ticker]

(OUT / 'client-ticker-meta.json').write_text(
    json.dumps(by_ticker, separators=(',', ':'), ensure_ascii=False) + '\n',
    encoding='utf-8',
)

caps_sorted = [c for c in CAP_ORDER if c in caps]
sectors_sorted = sorted(sectors)
cap_union = '  | '.join(repr(c) for c in caps_sorted)
cap_labels = ',\n'.join(f"  {json.dumps(c)}: {json.dumps(c)}" for c in caps_sorted)
sectors_lit = json.dumps(sectors_sorted, indent=2)
caps_lit = json.dumps(caps_sorted, indent=2)

ts = f'''/** Auto-generated from Sector and Industry Mapping.xlsx — regenerate via scripts/generate-client-ticker-meta.py */
import raw from './client-ticker-meta.json';

export type ClientCapBucket =
{chr(10).join(f'  | {json.dumps(c)}' for c in caps_sorted)};

export type ClientTickerMeta = {{
  /** Farouk clean company / ETF name from the mapping sheet. */
  name: string | null;
  sector: string;
  industry: string;
  cap: ClientCapBucket;
}};

export const CLIENT_SECTORS = {sectors_lit} as const;

export const CLIENT_CAP_BUCKETS = {caps_lit} as const;

export const CLIENT_CAP_LABELS: Record<ClientCapBucket, string> = {{
{cap_labels},
}};

/** Farouk sector → sector ETF (stocks only). */
export const FAROUK_SECTOR_TO_ETF: Record<(typeof CLIENT_SECTORS)[number], string> = {{
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
}};

type RawRow = [string, string, string, string];

const TABLE = raw as unknown as Record<string, RawRow>;

function lookupKeys(ticker: string): string[] {{
  const u = ticker.trim().toUpperCase();
  if (!u) return [];
  return [...new Set([u, u.replace(/-/g, '.'), u.replace(/\\./g, '-')])];
}}

export function getClientTickerMeta(ticker: string): ClientTickerMeta | null {{
  for (const key of lookupKeys(ticker)) {{
    const row = TABLE[key];
    if (!row) continue;
    // Support legacy 3-tuple [sector, industry, cap] and new 4-tuple [name, sector, industry, cap].
    if (row.length >= 4) {{
      const [name, sector, industry, cap] = row;
      if (!sector && !industry && !cap) continue;
      return {{
        name: name?.trim() || null,
        sector,
        industry,
        cap: cap as ClientCapBucket,
      }};
    }}
    const [sector, industry, cap] = row as unknown as [string, string, string];
    if (!sector && !industry && !cap) continue;
    return {{
      name: null,
      sector,
      industry,
      cap: cap as ClientCapBucket,
    }};
  }}
  return null;
}}

export function getClientTickerName(ticker: string): string | null {{
  return getClientTickerMeta(ticker)?.name ?? null;
}}

export function faroukSectorEtf(sector: string | null | undefined): string | null {{
  if (!sector) return null;
  const key = sector.trim() as keyof typeof FAROUK_SECTOR_TO_ETF;
  return FAROUK_SECTOR_TO_ETF[key] ?? null;
}}
'''
(OUT / 'client-ticker-meta.ts').write_text(ts, encoding='utf-8')
print(f'Wrote {len(by_ticker)} tickers → {OUT / "client-ticker-meta.json"}')
print('sectors', len(sectors_sorted), 'caps', caps_sorted)
print('GIS', by_ticker.get('GIS'))
