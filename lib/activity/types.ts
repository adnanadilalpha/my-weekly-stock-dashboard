import type { AppMode, PageView, PortfolioPage } from '@/app/types';

export type ActivityEventType =
  | 'session_start'
  | 'session_end'
  | 'page_view'
  | 'mode_switch'
  | 'ticker_view'
  | 'search'
  | 'filter'
  | 'sign_out'
  | 'feature_use';

export type ActivityContext = {
  appMode: AppMode;
  page?: PageView | PortfolioPage | 'hub' | 'my-holdings';
  portfolioPage?: PortfolioPage;
};

export type ActivityEventPayload = {
  eventType: ActivityEventType;
  eventName: string;
  metadata?: Record<string, unknown>;
};

export type ActivityHeartbeatPayload = {
  sessionKey: string;
  appMode?: string;
  currentPage?: string;
  metadata?: Record<string, unknown>;
};

export type ActivityIngestBody = {
  sessionKey: string;
  heartbeat?: ActivityHeartbeatPayload;
  events?: ActivityEventPayload[];
};
