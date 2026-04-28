import { supabase } from '../supabase-client';
import { USER_TICKER_ACTIVE_OR } from './user-ticker-visibility';

export interface HubTickerMetric {
  ticker: string;
  name: string;
  m1: number | null;
  score: number | null;
}

const POSTGREST_PAGE = 1000;

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

  async function selectAllRows(table: string, selectCols: string): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from(table)
        .select(selectCols)
        .or(USER_TICKER_ACTIVE_OR)
        .range(from, from + POSTGREST_PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      out.push(...rows);
      if (rows.length < POSTGREST_PAGE) break;
      from += POSTGREST_PAGE;
    }
    return out;
  }

  const [segRows, secRows, megaRows, otherRows] = await Promise.all([
    selectAllRows('market_segments', 'ticker,name,1m_percent,daily_1m_percent,daily_trend_score'),
    selectAllRows('sectors', 'ticker,sector_name,1m_percent,daily_1m_percent,daily_trend_score'),
    selectAllRows('mega_caps', 'ticker,company_name,1m_percent,daily_1m_percent,daily_trend_score'),
    selectAllRows('other_stocks', 'ticker,company_name,1m_percent,daily_1m_percent,daily_trend_score'),
  ]);

  for (const row of segRows) {
    const r = row as Record<string, unknown>;
    add(String(r.ticker ?? ''), String(r.name ?? r.ticker ?? ''), r);
  }
  for (const row of secRows) {
    const r = row as Record<string, unknown>;
    add(String(r.ticker ?? ''), String(r.sector_name ?? r.ticker ?? ''), r);
  }
  for (const row of megaRows) {
    const r = row as Record<string, unknown>;
    add(String(r.ticker ?? ''), String(r.company_name ?? r.ticker ?? ''), r);
  }
  for (const row of otherRows) {
    const r = row as Record<string, unknown>;
    add(String(r.ticker ?? ''), String(r.company_name ?? r.ticker ?? ''), r);
  }

  return map;
}
