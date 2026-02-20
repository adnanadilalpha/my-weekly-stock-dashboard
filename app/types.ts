export type PageView = 'index' | 'readme' | 'ticker-analysis' | 'dashboard';

/** After login: hub choice, then either MWS or Portfolio area */
export type AppMode = 'hub' | 'mws' | 'portfolio';

/** Portfolio detail pages (client-requested 5 only for now) */
export type PortfolioPage =
  | 'dashboard'
  | 'dow30'
  | 'large-caps'
  | 'nasdaq100'
  | 'macro-etf'
  | 'macro-3x';

