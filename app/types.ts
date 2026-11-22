export type PageView = 'index' | 'readme' | 'ticker-analysis' | 'dashboard';

/**
 * After login: hub choice (temporarily disabled), then MWS, MWS Portfolio books, or personal holdings.
 * Hub chooser is skipped via HUB_DISABLED in app/page.tsx — remove hub when client approves.
 */
export type AppMode = 'hub' | 'mws' | 'portfolio' | 'my-holdings';

/** MWS Portfolio detail pages (legacy sheet keys + V2 momentum pages) */
export type PortfolioPage =
  | 'dashboard'
  | 'momentum-combined'
  | 'dow30'
  | 'large-caps'
  | 'nasdaq100'
  | 'macro-etf'
  | 'macro-3x'
  | 'current-week'
  | 'track-record';
