'use server';

import { getAdminSupabase } from '@/lib/server/supabase-admin';
import { err, ok, withAdmin, type ActionResult } from './_shared';

const TICKER_TABLES = ['market_segments', 'sectors', 'mega_caps', 'other_stocks'] as const;
export type TickerTable = (typeof TICKER_TABLES)[number];

export type AdminTickerRow = {
  id: string;
  source_table: TickerTable;
  ticker: string;
  company: string;
  sector: string;
  price: number | null;
  change_pct: number | null;
  etf_mapping: string[];
  volume: number | null;
  active: boolean;
  last_updated: string | null;
};

export type TickerStats = {
  total: number;
  active: number;
  inactive: number;
  sectors: number;
};

export type ListTickersInput = {
  page?: number;
  pageSize?: number;
  /** `all` returns a capped cross-table preview; pick a table for full server pagination. */
  sourceTable?: TickerTable | 'all';
  search?: string;
  status?: 'all' | 'active' | 'inactive';
  sort?: 'ticker_asc' | 'last_updated_desc' | 'last_updated_asc';
};

export type ListTickersResult = {
  rows: AdminTickerRow[];
  stats: TickerStats;
  totalCount: number;
  page: number;
  pageSize: number;
  sourceTable: TickerTable | 'all';
  /** `preview` when source is `all` (no full cross-table pagination). */
  listMode: 'paged' | 'preview';
};

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const ALL_PREVIEW_PER_TABLE = 30;
const ALL_PREVIEW_CAP = 100;

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function asNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function titleCase(s: string) {
  return s
    .split('_')
    .map((p) => p.slice(0, 1).toUpperCase() + p.slice(1))
    .join(' ');
}

function getAnyString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = asString(row[key]);
    if (v) return v;
  }
  return null;
}

function getAnyNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const n = asNumber(row[key]);
    if (n !== null) return n;
  }
  return null;
}

/** Use the newest non-null timestamp among columns (e.g. `last_updated` vs `updated_at`). */
function pickLatestIso(row: Record<string, unknown>, keys: readonly string[]): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const key of keys) {
    const s = asString(row[key]);
    if (!s) continue;
    const t = new Date(s).getTime();
    if (!Number.isFinite(t)) continue;
    if (t > bestMs) {
      bestMs = t;
      best = s;
    }
  }
  return best;
}

function getEtfMapping(row: Record<string, unknown>): string[] {
  const raw = row.etf_mapping ?? row.etf_map ?? row.etfs;
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function mapTickerRow(table: TickerTable, row: Record<string, unknown>): AdminTickerRow | null {
  const id = asString(row.id);
  const ticker = asString(row.ticker);
  if (!id || !ticker) return null;
  const company =
    getAnyString(row, ['company', 'company_name', 'name', 'stock_name', 'security_name', 'sector_name']) ?? ticker;
  const sector = getAnyString(row, ['sector', 'sector_name']) ?? titleCase(table);
  const price = getAnyNumber(row, ['daily_current_price', 'weekly_current_price', 'current_price', 'price']);
  const change_pct = getAnyNumber(row, ['daily_1m_percent', 'change_percent', 'change_pct', 'price_change_pct']);
  const volume = getAnyNumber(row, ['volume', 'daily_volume', 'avg_volume']);
  const activeRaw = row.is_active ?? row.active ?? row.enabled;
  const active = typeof activeRaw === 'boolean' ? activeRaw : true;
  const last_updated = pickLatestIso(row, ['updated_at', 'last_updated']);
  return {
    id,
    source_table: table,
    ticker,
    company,
    sector,
    price,
    change_pct,
    etf_mapping: getEtfMapping(row),
    volume,
    active,
    last_updated,
  };
}

function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_,]/g, '').trim().slice(0, 80);
}

// Supabase query builder chain types differ between `.from().select()` and after filters; use a loose type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyTickerSearch(q: any, table: TickerTable, search: string) {
  const safe = sanitizeSearch(search);
  if (!safe) return q;
  const p = `%${safe}%`;
  switch (table) {
    case 'market_segments':
      return q.or(`ticker.ilike.${p},name.ilike.${p}`);
    case 'sectors':
      return q.or(`ticker.ilike.${p},sector_name.ilike.${p}`);
    default:
      return q.or(`ticker.ilike.${p},company_name.ilike.${p}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyStatusFilter(q: any, status: ListTickersInput['status']) {
  // NULL is_active is treated as active in the UI (see mapTickerRow).
  if (status === 'active') return q.or('is_active.eq.true,is_active.is.null');
  if (status === 'inactive') return q.eq('is_active', false);
  return q;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySort(q: any, sort: NonNullable<ListTickersInput['sort']>) {
  if (sort === 'ticker_asc') return q.order('ticker', { ascending: true });
  const asc = sort === 'last_updated_asc';
  return q
    .order('updated_at', { ascending: asc, nullsFirst: false })
    .order('last_updated', { ascending: asc, nullsFirst: false })
    .order('ticker', { ascending: true });
}

async function aggregateTickerStats(admin: ReturnType<typeof getAdminSupabase>): Promise<TickerStats> {
  const countPromises = TICKER_TABLES.map((t) => admin.from(t).select('id', { count: 'exact', head: true }));
  const inactivePromises = TICKER_TABLES.map((t) =>
    admin.from(t).select('id', { count: 'exact', head: true }).eq('is_active', false)
  );
  const sectorPromises = TICKER_TABLES.map((t) =>
    t === 'market_segments'
      ? admin.from(t).select('name').limit(120)
      : admin.from(t).select('sector,sector_name').limit(120)
  );
  const all = await Promise.all([...countPromises, ...inactivePromises, ...sectorPromises]);
  const counts = all.slice(0, 4);
  const inactiveRows = all.slice(4, 8);
  const sectorSamples = all.slice(8, 12);
  let total = 0;
  for (const c of counts) {
    if (c.error) continue;
    total += c.count ?? 0;
  }
  let inactive = 0;
  for (const c of inactiveRows) {
    if (c.error) continue;
    inactive += c.count ?? 0;
  }
  const active = Math.max(0, total - inactive);
  const sectorSet = new Set<string>();
  for (let i = 0; i < sectorSamples.length; i++) {
    const res = sectorSamples[i];
    const table = TICKER_TABLES[i];
    if (res.error) continue;
    for (const row of (res.data ?? []) as Record<string, unknown>[]) {
      const s =
        table === 'market_segments'
          ? getAnyString(row, ['name'])
          : getAnyString(row, ['sector', 'sector_name']);
      if (s) sectorSet.add(s.toLowerCase());
    }
  }
  return {
    total,
    active,
    inactive,
    sectors: sectorSet.size,
  };
}

export async function listTickersAction(
  accessToken: string,
  input?: ListTickersInput
): Promise<ActionResult<ListTickersResult>> {
  const page = Math.max(0, Math.floor(input?.page ?? 0));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(input?.pageSize ?? DEFAULT_PAGE_SIZE)));
  const sourceTable = input?.sourceTable ?? 'other_stocks';
  const search = typeof input?.search === 'string' ? input.search : '';
  const status = input?.status ?? 'all';
  const sort = input?.sort ?? 'last_updated_desc';

  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const stats = await aggregateTickerStats(admin);

    if (sourceTable === 'all') {
      const results = await Promise.all(
        TICKER_TABLES.map((table) => {
          let q = applySort(applyStatusFilter(applyTickerSearch(admin.from(table).select('*'), table, search), status), sort);
          q = q.limit(ALL_PREVIEW_PER_TABLE);
          return q;
        })
      );
      const mapped: AdminTickerRow[] = [];
      for (let i = 0; i < results.length; i++) {
        const table = TICKER_TABLES[i];
        const res = results[i];
        if (res.error) return err(`Failed to load tickers from ${table}.`, 'db_error');
        for (const raw of (res.data ?? []) as Record<string, unknown>[]) {
          const row = mapTickerRow(table, raw);
          if (row) mapped.push(row);
        }
      }
      const rowTime = (r: AdminTickerRow) => {
        const raw = r.last_updated;
        if (!raw) return 0;
        const t = new Date(raw).getTime();
        return Number.isFinite(t) ? t : 0;
      };
      mapped.sort((a, b) => {
        if (sort === 'last_updated_asc') return rowTime(a) - rowTime(b);
        return rowTime(b) - rowTime(a);
      });
      const rows = mapped.slice(0, ALL_PREVIEW_CAP);
      const preview: ListTickersResult = {
        rows,
        stats,
        totalCount: stats.total,
        page: 0,
        pageSize: rows.length,
        sourceTable: 'all',
        listMode: 'preview',
      };
      return ok(preview);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = applySort(
      applyStatusFilter(applyTickerSearch(admin.from(sourceTable).select('*', { count: 'exact' }), sourceTable, search), status),
      sort
    );
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await q.range(from, to);
    if (error) return err(`Failed to load tickers from ${sourceTable}.`, 'db_error');
    const rows: AdminTickerRow[] = [];
    for (const raw of (data ?? []) as Record<string, unknown>[]) {
      const row = mapTickerRow(sourceTable, raw);
      if (row) rows.push(row);
    }
    const paged: ListTickersResult = {
      rows,
      stats,
      totalCount: count ?? rows.length,
      page,
      pageSize,
      sourceTable,
      listMode: 'paged',
    };
    return ok(paged);
  });
}

export async function toggleTickerActiveAction(
  accessToken: string,
  input: { source_table: TickerTable; id: string; active: boolean }
): Promise<ActionResult<{ id: string; active: boolean }>> {
  return withAdmin(accessToken, async () => {
    if (!TICKER_TABLES.includes(input.source_table)) return err('Invalid ticker table.', 'validation');
    if (typeof input.id !== 'string' || input.id.length < 10) return err('Invalid ticker id.', 'validation');
    if (typeof input.active !== 'boolean') return err('Invalid active flag.', 'validation');
    const admin = getAdminSupabase();
    const payload = { is_active: input.active, updated_at: new Date().toISOString() };
    const { error } = await admin.from(input.source_table).update(payload).eq('id', input.id);
    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('column') && msg.includes('is_active')) {
        return err(`Table ${input.source_table} does not support active toggles yet.`, 'unsupported');
      }
      return err('Failed to update ticker status.', 'db_error');
    }
    return ok({ id: input.id, active: input.active });
  });
}
