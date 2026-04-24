'use server';

import { getAdminSupabase } from '@/lib/server/supabase-admin';
import { err, ok, withAdmin, type ActionResult } from './_shared';

export type PortfolioRecapRowDisplay = {
  portfolioName: string;
  start: string;
  initialValue: string;
  cashInvested: string;
  portfolioValue: string;
  returnUsd: string;
  returnsPct: string;
  hitRate: string;
  avgGain: string;
  avgLoss: string;
  netAvgReturn: string;
  cagr: string;
  holdingDays: string;
};

export type DashboardStats = {
  totalUsers: number;
  admins: number;
  addedThisWeek: number;
  runsLast24h: number;
  successLast24h: number;
  /**
   * Approximate “active” accounts from Supabase Auth `last_sign_in_at`
   * (updates when users authenticate, not per-request).
   */
  activeSignIn15m: number;
  activeSignIn24h: number;
  totalAuthAccounts: number;
  /** Average of Returns % (column_9) across recap portfolio rows, for KPI. */
  recapAvgReturnDisplay: string;
  portfolioRecapWeekly: PortfolioRecapRowDisplay[];
  portfolioRecapEtf: PortfolioRecapRowDisplay[];
};

const AUTH_LIST_PAGE_SIZE = 1000;
const AUTH_LIST_MAX_PAGES = 50;

async function authSignInActivity(admin: ReturnType<typeof getAdminSupabase>): Promise<{
  activeSignIn15m: number;
  activeSignIn24h: number;
  totalAuthAccounts: number;
}> {
  const now = Date.now();
  const since15 = now - 15 * 60 * 1000;
  const since24 = now - 24 * 60 * 60 * 1000;
  let activeSignIn15m = 0;
  let activeSignIn24h = 0;
  let totalAuthAccounts = 0;
  try {
    for (let page = 1; page <= AUTH_LIST_MAX_PAGES; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_LIST_PAGE_SIZE });
      if (error || !data?.users?.length) break;
      for (const u of data.users) {
        totalAuthAccounts += 1;
        const raw = u.last_sign_in_at;
        if (!raw) continue;
        const t = new Date(raw).getTime();
        if (Number.isNaN(t)) continue;
        if (t >= since15) activeSignIn15m += 1;
        if (t >= since24) activeSignIn24h += 1;
      }
      if (data.users.length < AUTH_LIST_PAGE_SIZE) break;
    }
  } catch {
    return { activeSignIn15m: 0, activeSignIn24h: 0, totalAuthAccounts: 0 };
  }
  return { activeSignIn15m, activeSignIn24h, totalAuthAccounts };
}

// -----------------------------------------------------------------------------
// Performance recap (aligned with `performance_recap` / portfolio dashboard)
// -----------------------------------------------------------------------------

const PORTFOLIO_NAMES = {
  DOW30: 'Dow Jones 30',
  LARGE_CAPS: 'US Large Caps',
  NASDAQ100: 'Nasdaq 100',
  MACRO_ETF: 'Macro ETF',
  MACRO_2_3X: 'Macro 2-3xETF',
} as const;

const RECAP_NAMES_SET: Set<string> = new Set([
  PORTFOLIO_NAMES.DOW30,
  PORTFOLIO_NAMES.LARGE_CAPS,
  PORTFOLIO_NAMES.NASDAQ100,
  PORTFOLIO_NAMES.MACRO_ETF,
  PORTFOLIO_NAMES.MACRO_2_3X,
  '  Macro ETF',
  '  Macro 2-3xETF',
]);

const WEEKLY_NAMES = new Set<string>([
  PORTFOLIO_NAMES.DOW30,
  PORTFOLIO_NAMES.LARGE_CAPS,
  PORTFOLIO_NAMES.NASDAQ100,
]);

const ETF_NAMES = new Set<string>([PORTFOLIO_NAMES.MACRO_ETF, PORTFOLIO_NAMES.MACRO_2_3X]);

const RECAP_TABLE_COLUMNS: { key: string; header: string }[] = [
  { key: 'column_2', header: 'Portfolio' },
  { key: 'column_3', header: 'Start' },
  { key: 'column_4', header: 'Initial Value' },
  { key: 'column_5', header: 'Cash Invested' },
  { key: 'column_7', header: 'Portfolio Value' },
  { key: 'column_8', header: 'Return $' },
  { key: 'column_9', header: 'Returns %' },
  { key: 'column_10', header: 'Hit Rate' },
  { key: 'column_11', header: 'Avg Gain' },
  { key: 'column_12', header: 'Avg Loss' },
  { key: 'column_13', header: 'Net Avg Return' },
  { key: 'column_14', header: 'CAGR' },
  { key: 'column_15', header: 'Holding Time (days)' },
];

function normalizeCol2(val: string | null): string {
  return (val ?? '').trim();
}

function getCol(row: Record<string, unknown>, key: string): string | number | null {
  const snake = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const val = row[key] ?? row[snake] ?? row[camel];
  return val == null ? null : (val as string | number);
}

function formatPct(val: string | number | null): string {
  if (val == null) return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  const pct = Math.abs(n) >= 1 ? n : n * 100;
  return pct.toFixed(1) + '%';
}

function formatInt(val: string | number | null): string {
  if (val == null) return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return Math.round(n).toLocaleString();
}

function formatCurrency(val: string | number | null): string {
  if (val == null) return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return '$' + Math.round(n).toLocaleString();
}

function formatDateSheet(val: string | number | null): string | null {
  if (val == null) return null;
  const d = new Date(typeof val === 'number' ? val : String(val).trim());
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function formatRecapCell(key: string, value: string | number | null): string {
  if (value == null || value === '') return '—';
  const s = String(value).trim();
  if (s.toLowerCase() === 'back to home page') return '—';
  if (key === 'column_3') {
    const dateText = formatDateSheet(value);
    if (dateText) return dateText;
    return s;
  }
  if (key === 'column_4') return formatInt(value);
  if (key === 'column_5') {
    if (s.toLowerCase() === 'n/a') return 'N/A';
    const n = Number(value);
    if (!Number.isNaN(n)) return n >= 1 ? formatPct(value) : (n * 100).toFixed(2) + '%';
    return s;
  }
  if (key === 'column_7' || key === 'column_8') return formatCurrency(value);
  if (key === 'column_14') {
    const n = Number(value);
    if (Number.isNaN(n)) return s;
    const pct = Math.abs(n) >= 1 ? n : n * 100;
    return Math.round(pct) + '%';
  }
  if (
    key === 'column_9' ||
    key === 'column_10' ||
    key === 'column_11' ||
    key === 'column_12' ||
    key === 'column_13'
  ) {
    return formatPct(value);
  }
  if (key === 'column_15') return formatInt(value);
  return s;
}

/** Numeric “returns %” as percentage points (e.g. 9.27 for 9.27%). */
function parseReturnsPctPoints(raw: string | number | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  return Math.abs(n) >= 1 ? n : n * 100;
}

function recapRowHasData(row: Record<string, unknown>): boolean {
  return RECAP_TABLE_COLUMNS.some((col, idx) => {
    if (idx === 0) return false;
    const v = getCol(row, col.key);
    return v != null && String(v).trim() !== '';
  });
}

function buildRecapDisplay(row: Record<string, unknown>): PortfolioRecapRowDisplay {
  const name = normalizeCol2(String(getCol(row, 'column_2')));
  return {
    portfolioName: name,
    start: formatRecapCell('column_3', getCol(row, 'column_3')),
    initialValue: formatRecapCell('column_4', getCol(row, 'column_4')),
    cashInvested: formatRecapCell('column_5', getCol(row, 'column_5')),
    portfolioValue: formatRecapCell('column_7', getCol(row, 'column_7')),
    returnUsd: formatRecapCell('column_8', getCol(row, 'column_8')),
    returnsPct: formatRecapCell('column_9', getCol(row, 'column_9')),
    hitRate: formatRecapCell('column_10', getCol(row, 'column_10')),
    avgGain: formatRecapCell('column_11', getCol(row, 'column_11')),
    avgLoss: formatRecapCell('column_12', getCol(row, 'column_12')),
    netAvgReturn: formatRecapCell('column_13', getCol(row, 'column_13')),
    cagr: formatRecapCell('column_14', getCol(row, 'column_14')),
    holdingDays: formatRecapCell('column_15', getCol(row, 'column_15')),
  };
}

function processPerformanceRecap(rawRows: Record<string, unknown>[]): {
  weekly: PortfolioRecapRowDisplay[];
  etf: PortfolioRecapRowDisplay[];
  recapAvgReturnDisplay: string;
} {
  const getCol2 = (r: Record<string, unknown>) => normalizeCol2(String(getCol(r, 'column_2')));

  const portfolioRows = rawRows.filter((r) => {
    const n = getCol2(r);
    return /^combined performance(\b|$)/i.test(n) || RECAP_NAMES_SET.has(n);
  });

  const withData = portfolioRows.filter((r) => recapRowHasData(r));

  const combinedRecap = withData.filter((r) => /^combined performance(\b|$)/i.test(getCol2(r)));
  const weeklyOnly = withData.filter(
    (r) => WEEKLY_NAMES.has(getCol2(r)) && !/^combined performance(\b|$)/i.test(getCol2(r)),
  );
  const weekly = [...combinedRecap, ...weeklyOnly].map((r) => buildRecapDisplay(r));
  const etf = withData.filter((r) => ETF_NAMES.has(getCol2(r))).map((r) => buildRecapDisplay(r));

  const kpiRecapRows = [...weeklyOnly, ...withData.filter((r) => ETF_NAMES.has(getCol2(r)))];
  const pts = kpiRecapRows
    .map((r) => parseReturnsPctPoints(getCol(r, 'column_9')))
    .filter((v): v is number => v !== null);
  let recapAvgReturnDisplay = '—';
  if (pts.length > 0) {
    const avg = pts.reduce((s, n) => s + n, 0) / pts.length;
    const sign = avg >= 0 ? '+' : '';
    recapAvgReturnDisplay = `${sign}${avg.toFixed(1)}%`;
  }

  return { weekly, etf, recapAvgReturnDisplay };
}

export async function loadDashboardStatsAction(accessToken: string): Promise<ActionResult<DashboardStats>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();

    const sinceWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [usersRes, newUsersRes, adminsRes, runs24hRes, recapRes, authAct] = await Promise.all([
      admin.from('authorized_users').select('*', { count: 'planned', head: true }),
      admin.from('authorized_users').select('*', { count: 'planned', head: true }).gte('created_at', sinceWeek),
      admin.from('authorized_users').select('*', { count: 'planned', head: true }).eq('role', 'Admin'),
      admin.from('api_health_log').select('status').gte('run_at', since24h),
      admin.from('performance_recap').select('*').order('row_index', { ascending: true }),
      authSignInActivity(admin),
    ]);

    if (usersRes.error) return err('Failed to load user count.', 'db_error');
    if (recapRes.error) return err('Failed to load portfolio recap.', 'db_error');

    const runs24h = (runs24hRes.data ?? []) as { status: 'ok' | 'partial' | 'error' }[];
    const recapRows = (recapRes.data ?? []) as Record<string, unknown>[];
    const { weekly: portfolioRecapWeekly, etf: portfolioRecapEtf, recapAvgReturnDisplay } =
      processPerformanceRecap(recapRows);

    const stats: DashboardStats = {
      totalUsers: usersRes.count ?? 0,
      admins: adminsRes.count ?? 0,
      addedThisWeek: newUsersRes.count ?? 0,
      runsLast24h: runs24h.length,
      successLast24h: runs24h.filter((r) => r.status === 'ok').length,
      activeSignIn15m: authAct.activeSignIn15m,
      activeSignIn24h: authAct.activeSignIn24h,
      totalAuthAccounts: authAct.totalAuthAccounts,
      recapAvgReturnDisplay,
      portfolioRecapWeekly,
      portfolioRecapEtf,
    };

    return ok(stats);
  });
}
