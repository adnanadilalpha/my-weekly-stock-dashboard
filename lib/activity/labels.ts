import type { AppMode, PageView, PortfolioPage } from '@/app/types';

const PAGE_LABELS: Record<string, string> = {
  hub: 'Hub',
  index: 'MWS Index',
  readme: 'Read Me',
  'ticker-analysis': 'Ticker Analysis',
  dashboard: 'Momentum Pulse',
  'momentum-combined': 'Combined Momentum',
  dow30: 'Dow 30',
  'large-caps': 'US Large Caps',
  nasdaq100: 'Nasdaq 100',
  'macro-etf': 'Macro ETF',
  'macro-3x': 'Macro 2–3× ETF',
};

const MODE_LABELS: Record<AppMode, string> = {
  hub: 'Hub',
  mws: 'MWS Dashboard',
  portfolio: 'Portfolio',
};

export function activityPageLabel(page: string | undefined): string {
  if (!page) return '—';
  return PAGE_LABELS[page] ?? page;
}

export function activityModeLabel(mode: AppMode | string | undefined): string {
  if (!mode) return '—';
  return MODE_LABELS[mode as AppMode] ?? String(mode);
}

export function activityLocationLabel(
  appMode: string | undefined,
  currentPage: string | undefined,
): string {
  if (appMode === 'hub' || currentPage === 'hub') return 'Hub';
  if (appMode === 'portfolio') {
    if (!currentPage || currentPage === 'dashboard') return 'Portfolio · Dashboard';
    return `Portfolio · ${activityPageLabel(currentPage)}`;
  }
  if (appMode === 'mws') {
    return `MWS · ${activityPageLabel(currentPage ?? 'index')}`;
  }
  return activityPageLabel(currentPage);
}

export function resolveActivityPage(ctx: {
  appMode: AppMode;
  page?: PageView | PortfolioPage | 'hub';
  portfolioPage?: PortfolioPage;
}): string {
  if (ctx.appMode === 'hub') return 'hub';
  if (ctx.appMode === 'portfolio') return ctx.portfolioPage ?? 'dashboard';
  return ctx.page ?? 'index';
}

export function eventTypeLabel(eventType: string): string {
  const labels: Record<string, string> = {
    session_start: 'Session started',
    session_end: 'Session ended',
    page_view: 'Page view',
    mode_switch: 'Mode switch',
    ticker_view: 'Ticker viewed',
    search: 'Search',
    filter: 'Filter',
    sign_out: 'Signed out',
  };
  return labels[eventType] ?? eventType;
}
