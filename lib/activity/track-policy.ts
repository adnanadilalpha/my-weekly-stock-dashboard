import type { ActivityEventPayload, ActivityEventType } from './types';

/** Product areas worth measuring — navigation between sections, not UI clicks. */
const SIGNIFICANT_PAGE_VIEWS = new Set([
  'hub',
  'index',
  'readme',
  'ticker-analysis',
  'dashboard',
  'momentum-combined',
  'dow30',
  'large-caps',
  'nasdaq100',
  'macro-etf',
  'macro-3x',
]);

const TRACKED_EVENT_TYPES = new Set<ActivityEventType>(['page_view', 'ticker_view']);

export function shouldTrackEvent(event: ActivityEventPayload): boolean {
  if (!TRACKED_EVENT_TYPES.has(event.eventType)) return false;
  if (event.eventType === 'page_view') {
    return SIGNIFICANT_PAGE_VIEWS.has(event.eventName);
  }
  return true;
}
