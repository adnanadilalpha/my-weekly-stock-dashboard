export type HubSectionKey = 'personal' | 'segments' | 'sectors' | 'large';

export const HUB_SECTION_KEYS: HubSectionKey[] = ['personal', 'segments', 'sectors', 'large'];

export const DEFAULT_HUB_ORDER: HubSectionKey[] = [...HUB_SECTION_KEYS];

export const HUB_SECTION_META: Record<
  HubSectionKey,
  { label: string; meta: string }
> = {
  personal: { label: 'Your Tickers', meta: 'up to 20' },
  segments: { label: 'SEGMENT Ticker Page', meta: '10 tickers' },
  sectors: { label: 'SECTOR Ticker Pages', meta: '12 tickers' },
  large: { label: 'LARGE CAPS Ticker Pages', meta: '60 tickers' },
};

export interface HubPersonalTicker {
  ticker: string;
  name: string;
}

export interface HubPrefs {
  order: HubSectionKey[];
  hidden: Partial<Record<HubSectionKey, boolean>>;
  personalTickers: HubPersonalTicker[];
}

export const DEFAULT_HUB_PREFS: HubPrefs = {
  order: [...DEFAULT_HUB_ORDER],
  hidden: {},
  personalTickers: [],
};

const KEY_SET = new Set<string>(HUB_SECTION_KEYS);

function isHubSectionKey(k: string): k is HubSectionKey {
  return KEY_SET.has(k);
}

export function normalizeHubPrefs(raw: unknown): HubPrefs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  let order: HubSectionKey[] = [];
  if (Array.isArray(o.order)) {
    order = o.order.filter(
      (k): k is HubSectionKey =>
        typeof k === 'string' && k !== 'quick' && isHubSectionKey(k),
    );
  }
  for (const k of DEFAULT_HUB_ORDER) {
    if (!order.includes(k)) order.push(k);
  }
  order = order.filter((k, i) => order.indexOf(k) === i);

  const hidden: Partial<Record<HubSectionKey, boolean>> = {};
  if (o.hidden && typeof o.hidden === 'object' && o.hidden !== null) {
    const h = o.hidden as Record<string, unknown>;
    for (const k of HUB_SECTION_KEYS) {
      if (h[k] === true) hidden[k] = true;
    }
  }

  const pt = Array.isArray(o.personalTickers) ? o.personalTickers : [];
  const personalTickers: HubPersonalTicker[] = pt
    .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
    .map((x) => ({
      ticker: String(x.ticker ?? '')
        .toUpperCase()
        .trim(),
      name: String(x.name ?? x.ticker ?? '').trim(),
    }))
    .filter((x) => x.ticker.length > 0)
    .slice(0, 20);

  return { order, hidden, personalTickers };
}
