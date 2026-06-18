/** Client-facing section title (feedback #2). */
export const GROUP_WEEKLY_MOMENTUM_TITLE = 'Weekly Momentum Picks';

export type RecapTableColumn = { key: string; header: string };

const HOLDING_TIME_HEADER = 'Holding time (days)';

const RECAP_TABLE_COLUMNS_BASE: RecapTableColumn[] = [
  { key: 'column_2', header: 'Strategy' },
  { key: 'column_3', header: 'Start' },
  { key: 'column_4', header: 'Initial Value' },
  { key: 'column_5', header: 'Cash Invested' },
  { key: 'column_7', header: 'Portfolio Value' },
  { key: 'column_8', header: 'Return $' },
  { key: 'column_9', header: 'Returns' },
  { key: 'column_10', header: 'Hit Rate' },
  { key: 'column_11', header: 'Avg Gain' },
  { key: 'column_12', header: 'Avg Loss' },
  { key: 'column_13', header: 'Net Avg Return' },
  { key: 'column_14', header: 'CAGR' },
  { key: 'column_15', header: HOLDING_TIME_HEADER },
];

/** Hidden on Weekly Momentum Picks table per client feedback (15.06.2026). */
export const WEEKLY_MOMENTUM_HIDDEN_COLUMN_KEYS = new Set(['column_4', 'column_7', 'column_8']);

/** Hidden on ETF recap tables (Portfolio Value per client feedback). */
export const ETF_HIDDEN_COLUMN_KEYS = new Set(['column_7']);

export function weeklyMomentumRecapColumns(): RecapTableColumn[] {
  return RECAP_TABLE_COLUMNS_BASE.filter((c) => !WEEKLY_MOMENTUM_HIDDEN_COLUMN_KEYS.has(c.key));
}

export function etfRecapColumns(): RecapTableColumn[] {
  return RECAP_TABLE_COLUMNS_BASE.filter((c) => !ETF_HIDDEN_COLUMN_KEYS.has(c.key));
}

/** User-facing strategy name in recap tables (COMBINED PERFORMANCE → Weekly Momentum Picks). */
export function recapStrategyDisplayName(raw: string | null | undefined): string {
  const n = String(raw ?? '').trim();
  if (n.length > 0 && /^combined performance(\b|$)/i.test(n)) return GROUP_WEEKLY_MOMENTUM_TITLE;
  return n;
}

export type PortfolioRecapDisplayKey =
  | 'portfolioName'
  | 'start'
  | 'initialValue'
  | 'cashInvested'
  | 'portfolioValue'
  | 'returnUsd'
  | 'returnsPct'
  | 'hitRate'
  | 'avgGain'
  | 'avgLoss'
  | 'netAvgReturn'
  | 'cagr'
  | 'holdingDays';

const ADMIN_RECAP_HEADERS: { key: PortfolioRecapDisplayKey; label: string }[] = [
  { key: 'portfolioName', label: 'Portfolio' },
  { key: 'start', label: 'Start' },
  { key: 'initialValue', label: 'Initial Value' },
  { key: 'cashInvested', label: 'Cash Invested' },
  { key: 'portfolioValue', label: 'Portfolio Value' },
  { key: 'returnUsd', label: 'Return $' },
  { key: 'returnsPct', label: 'Returns %' },
  { key: 'hitRate', label: 'Hit Rate' },
  { key: 'avgGain', label: 'Avg Gain' },
  { key: 'avgLoss', label: 'Avg Loss' },
  { key: 'netAvgReturn', label: 'Net Avg Return' },
  { key: 'cagr', label: 'CAGR' },
  { key: 'holdingDays', label: HOLDING_TIME_HEADER },
];

const ADMIN_MOMENTUM_HIDDEN_KEYS = new Set<PortfolioRecapDisplayKey>([
  'initialValue',
  'portfolioValue',
  'returnUsd',
]);

const ADMIN_ETF_HIDDEN_KEYS = new Set<PortfolioRecapDisplayKey>(['portfolioValue']);

export function adminWeeklyMomentumRecapHeaders() {
  return ADMIN_RECAP_HEADERS.filter((h) => !ADMIN_MOMENTUM_HIDDEN_KEYS.has(h.key));
}

export function adminEtfRecapHeaders() {
  return ADMIN_RECAP_HEADERS.filter((h) => !ADMIN_ETF_HIDDEN_KEYS.has(h.key));
}

/** Keys used to detect whether a recap row has displayable data (includes hidden columns). */
export function recapRowDataColumnKeys(): string[] {
  return RECAP_TABLE_COLUMNS_BASE.filter((c) => c.key !== 'column_2').map((c) => c.key);
}
