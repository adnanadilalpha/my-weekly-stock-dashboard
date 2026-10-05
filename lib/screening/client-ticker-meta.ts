/** Auto-generated from Sector and Industry Mapping.xlsx — regenerate via scripts/generate-client-ticker-meta.py */
import raw from './client-ticker-meta.json';

export type ClientCapBucket =
  | "Mega Cap"
  | "Large Cap"
  | "Mid Cap"
  | "Small Cap"
  | "ETF";

export type ClientTickerMeta = {
  /** Farouk clean company / ETF name from the mapping sheet. */
  name: string | null;
  sector: string;
  industry: string;
  cap: ClientCapBucket;
};

export const CLIENT_SECTORS = [
  "Basic Materials",
  "Communication Services",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Energy",
  "Financial",
  "Healthcare",
  "Industrials",
  "Real Estate",
  "Technology",
  "Utilities"
] as const;

export const CLIENT_CAP_BUCKETS = [
  "Mega Cap",
  "Large Cap",
  "Mid Cap",
  "Small Cap",
  "ETF"
] as const;

export const CLIENT_CAP_LABELS: Record<ClientCapBucket, string> = {
  "Mega Cap": "Mega Cap",
  "Large Cap": "Large Cap",
  "Mid Cap": "Mid Cap",
  "Small Cap": "Small Cap",
  "ETF": "ETF",
};

/** Farouk sector → sector ETF (stocks only). */
export const FAROUK_SECTOR_TO_ETF: Record<(typeof CLIENT_SECTORS)[number], string> = {
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

type RawRow = [string, string, string, string];

const TABLE = raw as unknown as Record<string, RawRow>;

function lookupKeys(ticker: string): string[] {
  const u = ticker.trim().toUpperCase();
  if (!u) return [];
  return [...new Set([u, u.replace(/-/g, '.'), u.replace(/\./g, '-')])];
}

export function getClientTickerMeta(ticker: string): ClientTickerMeta | null {
  for (const key of lookupKeys(ticker)) {
    const row = TABLE[key];
    if (!row) continue;
    // Support legacy 3-tuple [sector, industry, cap] and new 4-tuple [name, sector, industry, cap].
    if (row.length >= 4) {
      const [name, sector, industry, cap] = row;
      if (!sector && !industry && !cap) continue;
      return {
        name: name?.trim() || null,
        sector,
        industry,
        cap: cap as ClientCapBucket,
      };
    }
    const [sector, industry, cap] = row as unknown as [string, string, string];
    if (!sector && !industry && !cap) continue;
    return {
      name: null,
      sector,
      industry,
      cap: cap as ClientCapBucket,
    };
  }
  return null;
}

export function getClientTickerName(ticker: string): string | null {
  return getClientTickerMeta(ticker)?.name ?? null;
}

export function faroukSectorEtf(sector: string | null | undefined): string | null {
  if (!sector) return null;
  const key = sector.trim() as keyof typeof FAROUK_SECTOR_TO_ETF;
  return FAROUK_SECTOR_TO_ETF[key] ?? null;
}
