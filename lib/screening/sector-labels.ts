/** Sector ETF ticker → short sector label for screener filters. */
export const SECTOR_ETF_LABELS: Record<string, string> = {
  'XLK': 'Technology',
  'SMH': 'Semiconductors',
  'XLF': 'Financials',
  'XLV': 'Health Care',
  'XLY': 'Consumer Discretionary',
  'XLP': 'Consumer Staples',
  'XLE': 'Energy',
  'XLI': 'Industrials',
  'XLB': 'Materials',
  'XLRE': 'Real Estate',
  'XLU': 'Utilities',
  'XLC': 'Communication Services',
};

export function sectorEtfLabel(etf: string | null | undefined): string | null {
  if (!etf) return null;
  const key = etf.trim().toUpperCase();
  return SECTOR_ETF_LABELS[key] ?? key;
}
