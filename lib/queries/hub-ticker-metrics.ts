import { supabase } from '../supabase-client';
import { USER_TICKER_ACTIVE_OR } from './user-ticker-visibility';

export interface HubTickerMetric {
  ticker: string;
  name: string;
  m1: number | null;
  score: number | null;
}

function m1FromRow(row: Record<string, unknown>): number | null {
  const v = row['1m_percent'] ?? row.daily_1m_percent;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function scoreFromRow(row: Record<string, unknown>): number | null {
  const v = row.daily_trend_score;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** One map keyed by uppercased ticker for hub search + pills (daily 1M % + trend score). */
export async function fetchHubTickerMetricsMap(): Promise<Map<string, HubTickerMetric>> {
  const map = new Map<string, HubTickerMetric>();

  const add = (ticker: string, name: string, row: Record<string, unknown>) => {
    const t = ticker.toUpperCase().trim();
    if (!t) return;
    map.set(t, {
      ticker: t,
      name: name || t,
      m1: m1FromRow(row),
      score: scoreFromRow(row),
    });
  };

  const [segRes, secRes, megaRes, otherRes] = await Promise.all([
    supabase
      .from('market_segments')
      .select('ticker,name,1m_percent,daily_1m_percent,daily_trend_score')
      .or(USER_TICKER_ACTIVE_OR),
    supabase
      .from('sectors')
      .select('ticker,sector_name,1m_percent,daily_1m_percent,daily_trend_score')
      .or(USER_TICKER_ACTIVE_OR),
    supabase
      .from('mega_caps')
      .select('ticker,company_name,1m_percent,daily_1m_percent,daily_trend_score')
      .or(USER_TICKER_ACTIVE_OR),
    supabase
      .from('other_stocks')
      .select('ticker,company_name,1m_percent,daily_1m_percent,daily_trend_score')
      .or(USER_TICKER_ACTIVE_OR),
  ]);

  for (const res of [segRes, secRes, megaRes, otherRes]) {
    if (res.error) {
      console.error('fetchHubTickerMetricsMap', res.error);
      throw res.error;
    }
  }

  for (const row of segRes.data ?? []) {
    const r = row as Record<string, unknown>;
    add(String(r.ticker ?? ''), String(r.name ?? r.ticker ?? ''), r);
  }
  for (const row of secRes.data ?? []) {
    const r = row as Record<string, unknown>;
    add(String(r.ticker ?? ''), String(r.sector_name ?? r.ticker ?? ''), r);
  }
  for (const row of megaRes.data ?? []) {
    const r = row as Record<string, unknown>;
    add(String(r.ticker ?? ''), String(r.company_name ?? r.ticker ?? ''), r);
  }
  for (const row of otherRes.data ?? []) {
    const r = row as Record<string, unknown>;
    add(String(r.ticker ?? ''), String(r.company_name ?? r.ticker ?? ''), r);
  }

  return map;
}
