'use server';

import { getAdminSupabase } from '@/lib/server/supabase-admin';
import { decrypt } from '@/lib/server/crypto';
import { err, ok, withAdmin, type ActionResult } from './_shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CandidateProviderStatus = 'pending' | 'found' | 'not_found' | 'error';
export type CandidateImportStatus = 'pending' | 'imported' | 'skipped';
export type TargetTable = 'market_segments' | 'sectors' | 'mega_caps' | 'other_stocks';

export type TickerCandidate = {
  id: string;
  ticker: string;
  provider_name: string | null;
  provider_type: string | null;
  provider_mic: string | null;
  provider_status: CandidateProviderStatus;
  is_in_system: boolean;
  existing_table: string | null;
  import_status: CandidateImportStatus;
  import_target_table: TargetTable | null;
  notes: string | null;
  scanned_at: string | null;
  imported_at: string | null;
  imported_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TickerCandidateStats = {
  total: number;
  pending_scan: number;
  found: number;
  not_found: number;
  in_system: number;
  imported: number;
  skipped: number;
  ready_to_import: number; // found && !in_system && import_status === 'pending'
};

export type CandidateListFilter = {
  provider_status?: CandidateProviderStatus | 'all';
  import_status?: CandidateImportStatus | 'all';
  in_system?: boolean | 'all';
  search?: string;
  limit?: number;
  offset?: number;
};

const TARGET_TABLES: TargetTable[] = ['market_segments', 'sectors', 'mega_caps', 'other_stocks'];

// Mirror the edge function's hardcoded classification sets
const MARKET_SEGMENT_TICKERS = new Set(['SPY','QQQ','IWM','TLT','UUP','GLD','SLV','IBIT','ETHA','USO']);
const SECTOR_TICKERS = new Set(['XLK','XLC','SMH','XLY','XLF','XLI','XLE','XLB','XLRE','XLU','XLV','XLP']);
const MEGA_CAP_TICKERS = new Set([
  'NVDA','MSFT','AAPL','GOOG','AMZN','META','TSLA','JPM','WMT','LLY','AVGO','CSCO','MCD','V','WFC','C','ORCL','MS','APP','MA',
  'KO','ISRG','XOM','GS','LIN','JNJ','CAT','INTC','PLTR','IBM','DIS','NFLX','MRK','QCOM','BAC','AXP','PEP','COST','LRCX','BX',
  'MU','CRM','AMGN','HD','RTX','SCHW','GE','TMO','INTU','AMD','AMAT','GEV','PG','ABT','UBER','CVX','TMUS','BA','UNH','SHOP',
]);

function autoAssignTargetTable(ticker: string): TargetTable {
  if (MARKET_SEGMENT_TICKERS.has(ticker)) return 'market_segments';
  if (SECTOR_TICKERS.has(ticker)) return 'sectors';
  if (MEGA_CAP_TICKERS.has(ticker)) return 'mega_caps';
  return 'other_stocks';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert Postgres bytea hex string (\x<hex>) to Buffer. */
function fromByteaHex(raw: unknown): Buffer {
  if (typeof raw === 'string') {
    const hex = raw.startsWith('\\x') ? raw.slice(2) : raw;
    return Buffer.from(hex, 'hex');
  }
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  throw new Error('Cannot convert to Buffer: unexpected type');
}

// ---------------------------------------------------------------------------
// List / Stats
// ---------------------------------------------------------------------------

export async function listTickerCandidatesAction(
  accessToken: string,
  filter: CandidateListFilter = {}
): Promise<ActionResult<{ rows: TickerCandidate[]; total_count: number }>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    const offset = Math.max(filter.offset ?? 0, 0);

    let q = admin
      .from('ticker_import_candidates')
      .select('*', { count: 'exact' })
      .order('ticker', { ascending: true })
      .range(offset, offset + limit - 1);

    if (filter.provider_status && filter.provider_status !== 'all') {
      q = q.eq('provider_status', filter.provider_status);
    }
    if (filter.import_status && filter.import_status !== 'all') {
      q = q.eq('import_status', filter.import_status);
    }
    if (filter.in_system !== undefined && filter.in_system !== 'all') {
      q = q.eq('is_in_system', filter.in_system);
    }
    if (filter.search && filter.search.trim()) {
      q = q.ilike('ticker', `%${filter.search.trim()}%`);
    }

    const { data, error, count } = await q;
    if (error) return err('Failed to load ticker candidates.', 'db_error');
    return ok({ rows: (data ?? []) as TickerCandidate[], total_count: count ?? 0 });
  });
}

export async function getTickerCandidateStatsAction(
  accessToken: string
): Promise<ActionResult<TickerCandidateStats>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    // Source-of-truth stats from raw rows so UI stays correct even if legacy rows
    // have mismatched flags from older import logic.
    const rows: Pick<TickerCandidate, 'provider_status' | 'import_status' | 'is_in_system'>[] = [];
    let from = 0;
    const chunk = 1000;
    while (true) {
      const { data: page, error: pageErr } = await admin
        .from('ticker_import_candidates')
        .select('provider_status, import_status, is_in_system')
        .range(from, from + chunk - 1);
      if (pageErr) return err('Failed to load candidate stats.', 'db_error');
      const batch = (page ?? []) as typeof rows;
      rows.push(...batch);
      if (batch.length < chunk) break;
      from += chunk;
    }
    const inSystemEffective = (r: Pick<TickerCandidate, 'import_status' | 'is_in_system'>) =>
      Boolean(r.is_in_system) || r.import_status === 'imported';

    return ok({
      total: rows.length,
      pending_scan: rows.filter((r) => r.provider_status === 'pending').length,
      found: rows.filter((r) => r.provider_status === 'found').length,
      not_found: rows.filter((r) => r.provider_status === 'not_found').length,
      in_system: rows.filter((r) => inSystemEffective(r)).length,
      imported: rows.filter((r) => r.import_status === 'imported').length,
      skipped: rows.filter((r) => r.import_status === 'skipped').length,
      ready_to_import: rows.filter(
        (r) => r.provider_status === 'found' && !inSystemEffective(r) && r.import_status === 'pending'
      ).length,
    });
  });
}

// ---------------------------------------------------------------------------
// Scan – validate candidates against provider symbol catalog + existing tables
// ---------------------------------------------------------------------------

export async function scanTickerCandidatesAction(
  accessToken: string
): Promise<ActionResult<{ scanned: number; found: number; not_found: number; already_in_system: number; error_msg: string | null }>> {
  return withAdmin(accessToken, async (ctx) => {
    const admin = getAdminSupabase();

    // 1. Read preferred provider from config
    const { data: cfg } = await admin
      .from('admin_api_config')
      .select('preferred_provider')
      .eq('id', 1)
      .maybeSingle();
    const provider = typeof cfg?.preferred_provider === 'string' && cfg.preferred_provider.trim()
      ? cfg.preferred_provider.trim().toLowerCase()
      : 'finnhub';

    if (provider === 'yahoo') {
      return err('Yahoo Finance does not support scan. Change the preferred provider in API Settings to validate candidates.', 'unsupported');
    }

    // 2. Load all candidates in pages to avoid the default 1000-row cap.
    const candidates: Array<{ id: string; ticker: string; is_in_system: boolean | null; existing_table: string | null }> = [];
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error: candErr } = await admin
        .from('ticker_import_candidates')
        .select('id, ticker, is_in_system, existing_table')
        .order('created_at', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (candErr) return err('Failed to load candidates.', 'db_error');
      const chunk = (data ?? []) as Array<{ id: string; ticker: string; is_in_system: boolean | null; existing_table: string | null }>;
      candidates.push(...chunk);
      if (chunk.length < PAGE) break;
    }

    // 3. API key
    const { data: keyRow, error: keyErr } = await admin
      .from('api_keys')
      .select('key_ciphertext, key_iv, key_auth_tag, is_active')
      .eq('provider', provider)
      .eq('is_active', true)
      .maybeSingle();
    if (keyErr) return err('Failed to read API key.', 'db_error');
    if (!keyRow) {
      return err(`No active API key found for provider "${provider}". Add a key in API Settings first.`, 'config');
    }
    let apiKey: string;
    try {
      apiKey = decrypt({
        ciphertext: fromByteaHex((keyRow as Record<string, unknown>).key_ciphertext),
        iv: fromByteaHex((keyRow as Record<string, unknown>).key_iv),
        authTag: fromByteaHex((keyRow as Record<string, unknown>).key_auth_tag),
      });
    } catch (e) {
      return err(`Failed to decrypt API key: ${(e as Error).message}`, 'crypto_error');
    }

    // 4. Load all existing tickers from the 4 system tables
    const systemTables: TargetTable[] = ['market_segments', 'sectors', 'mega_caps', 'other_stocks'];
    const systemTickers = new Map<string, TargetTable>(); // ticker → table
    for (const table of systemTables) {
      const { data: rows } = await admin.from(table).select('ticker');
      for (const row of (rows ?? []) as { ticker: string }[]) {
        systemTickers.set(row.ticker.toUpperCase(), table);
      }
    }

    // 5. Build scan list: skip anything already known to be in system.
    const alreadyInSystemByRows = candidates.filter((cand) => {
      const sym = String(cand.ticker ?? '').toUpperCase().trim();
      if (!sym) return false;
      return Boolean(cand.is_in_system) || systemTickers.has(sym);
    }).length;

    const toScan = candidates.filter((cand) => {
      const sym = String(cand.ticker ?? '').toUpperCase().trim();
      if (!sym) return false;
      return !Boolean(cand.is_in_system) && !systemTickers.has(sym);
    });

    const candidateTickers = [
      ...new Set(
        toScan
          .map((c) => String(c.ticker ?? '').toUpperCase().trim())
          .filter(Boolean)
      ),
    ];

    // 6. Fetch symbol catalog only when needed.
    type CatalogEntry = { ticker: string; name: string | null; type: string | null; mic: string | null };
    let catalog: Map<string, CatalogEntry> = new Map();
    if (candidateTickers.length > 0) {
      try {
        catalog = await fetchProviderCatalog(provider, apiKey, candidateTickers);
      } catch (e) {
        return err(`Failed to fetch provider symbol catalog: ${(e as Error).message}`, 'provider_error');
      }
    }

    const now = new Date().toISOString();
    let found = 0, not_found = 0;

    // 7. Build batch update payload (only rows that actually need a scan)
    const updates: Array<{
      id: string;
      ticker: string;
      provider_status: CandidateProviderStatus;
      provider_name: string | null;
      provider_type: string | null;
      provider_mic: string | null;
      is_in_system: boolean;
      existing_table: string | null;
      import_target_table: TargetTable;
      notes: string | null;
      scanned_at: string;
      scanned_by: string;
      updated_at: string;
    }> = [];

    for (const cand of toScan) {
      const sym = cand.ticker.toUpperCase();
      const catalogEntry = catalog.get(sym);

      const providerStatus: CandidateProviderStatus = catalogEntry ? 'found' : 'not_found';
      const importTargetTable = autoAssignTargetTable(sym);

      const notes: string[] = [];
      if (!catalogEntry) notes.push('Symbol not found in provider catalog');

      if (catalogEntry) found++;
      else not_found++;

      updates.push({
        id: cand.id,
        ticker: cand.ticker,
        provider_status: providerStatus,
        provider_name: catalogEntry?.name ?? null,
        provider_type: catalogEntry?.type ?? null,
        provider_mic: catalogEntry?.mic ?? null,
        is_in_system: false,
        existing_table: null,
        import_target_table: importTargetTable,
        notes: notes.length > 0 ? notes.join('; ') : null,
        scanned_at: now,
        scanned_by: ctx.email,
        updated_at: now,
      });
    }

    // 8. Batch upsert in chunks of 200
    const CHUNK = 200;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      const { error: upsertErr } = await admin
        .from('ticker_import_candidates')
        .upsert(chunk, { onConflict: 'id' });
      if (upsertErr) {
        return err(`Failed to save scan results (chunk ${Math.floor(i / CHUNK) + 1}): ${upsertErr.message}`, 'db_error');
      }
    }

    return ok({
      scanned: toScan.length,
      found,
      not_found,
      already_in_system: alreadyInSystemByRows,
      error_msg: null,
    });
  });
}

async function readFetchErrorSnippet(r: Response): Promise<string> {
  const text = await r.text().catch(() => '');
  if (!text) return '';
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const msg =
      (typeof j['Error Message'] === 'string' && j['Error Message']) ||
      (typeof j.message === 'string' && j.message) ||
      (typeof j.error === 'string' && j.error) ||
      '';
    if (msg) return String(msg).trim();
  } catch {
    /* non-JSON body */
  }
  return text.slice(0, 200).trim();
}

function normalizeToObjectArray(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const k of ['stockList', 'data', 'symbols', 'results', 'content']) {
      const v = o[k];
      if (Array.isArray(v)) return v as Array<Record<string, unknown>>;
    }
  }
  return [];
}

/** Fetches the provider's full symbol catalog (bulk lists, or per-candidate where noted). */
async function fetchProviderCatalog(
  provider: string,
  apiKey: string,
  _candidateTickers: string[]
): Promise<Map<string, { ticker: string; name: string | null; type: string | null; mic: string | null }>> {
  const map = new Map<string, { ticker: string; name: string | null; type: string | null; mic: string | null }>();
  const TIMEOUT_MS = 30_000;

  if (provider === 'finnhub') {
    const url = `https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) {
      const snippet = await readFetchErrorSnippet(r);
      throw new Error(
        `Finnhub responded with HTTP ${r.status}${snippet ? ` — ${snippet}` : ''}. Check the Finnhub key in API Settings (Test connection).`
      );
    }
    const rows = (await r.json()) as Array<{ symbol?: string; description?: string; mic?: string; type?: string }>;
    for (const row of rows ?? []) {
      const sym = String(row.symbol ?? '').toUpperCase().trim();
      if (!sym) continue;
      const mic = String(row.mic ?? '').toUpperCase().trim() || null;
      const type = String(row.type ?? '').trim() || null;
      if (!map.has(sym)) {
        map.set(sym, { ticker: sym, name: row.description?.trim() || null, type, mic });
      }
    }
  } else if (provider === 'twelve_data') {
    const endpoints = [
      { url: `https://api.twelvedata.com/etf?country=United States&apikey=${apiKey}`, type: 'ETP' },
      { url: `https://api.twelvedata.com/stocks?country=United States&apikey=${apiKey}`, type: 'Common Stock' },
    ];
    for (const ep of endpoints) {
      const r = await fetch(ep.url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!r.ok) continue;
      const j = (await r.json()) as { data?: Array<{ symbol?: string; name?: string; mic_code?: string; exchange?: string }> };
      for (const row of j.data ?? []) {
        const sym = String(row.symbol ?? '').toUpperCase().trim();
        if (!sym) continue;
        const mic = String(row.mic_code ?? row.exchange ?? '').toUpperCase().trim() || null;
        if (!map.has(sym)) {
          map.set(sym, { ticker: sym, name: row.name?.trim() || null, type: ep.type, mic });
        }
      }
    }
  } else if (provider === 'fmp') {
    const fmpTimeoutMs = Math.max(TIMEOUT_MS, 120_000);
    // Legacy /api/v3/stock/list often returns 401 for keys that only work with the stable API (same as quote/history in-app).
    const url = `https://financialmodelingprep.com/stable/stock-list?apikey=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(fmpTimeoutMs) });
    if (!r.ok) {
      const snippet = await readFetchErrorSnippet(r);
      throw new Error(
        `FMP responded with HTTP ${r.status}${snippet ? ` — ${snippet}` : ''}. Confirm the FMP key in API Settings (Test connection uses the stable API).`
      );
    }
    const rawJson = await r.json();
    const rows = normalizeToObjectArray(rawJson);
    if (rows.length === 0) {
      throw new Error('FMP stock list returned no symbols (unexpected response shape or empty list).');
    }
    for (const row of rows) {
      const sym = String(row.symbol ?? row.Symbol ?? '').toUpperCase().trim();
      if (!sym) continue;
      const mic =
        String(row.exchangeShortName ?? row.exchange ?? row.stockExchange ?? '')
          .toUpperCase()
          .trim() || null;
      const type = String(row.type ?? row.assetType ?? '').trim() || null;
      const nameRaw = row.name ?? row.companyName ?? row.company_name;
      const name = typeof nameRaw === 'string' ? nameRaw.trim() || null : null;
      if (!map.has(sym)) {
        map.set(sym, { ticker: sym, name, type, mic });
      }
    }
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }

  return map;
}

// ---------------------------------------------------------------------------
// Import single ticker
// ---------------------------------------------------------------------------

export async function importTickerCandidateAction(
  accessToken: string,
  input: { id: string; targetTable: TargetTable; activateImmediately?: boolean }
): Promise<ActionResult<{ ticker: string; targetTable: TargetTable }>> {
  return withAdmin(accessToken, async (ctx) => {
    if (!input.id || typeof input.id !== 'string') return err('Invalid candidate id.', 'validation');
    if (!TARGET_TABLES.includes(input.targetTable)) return err('Invalid target table.', 'validation');

    const admin = getAdminSupabase();

    // Load the candidate
    const { data: cand, error: candErr } = await admin
      .from('ticker_import_candidates')
      .select('*')
      .eq('id', input.id)
      .single();
    if (candErr || !cand) return err('Candidate not found.', 'not_found');
    const candidate = cand as TickerCandidate;

    if (candidate.import_status === 'imported') {
      return err(`${candidate.ticker} has already been imported.`, 'conflict');
    }
    if (candidate.is_in_system) {
      return err(`${candidate.ticker} already exists in ${candidate.existing_table}.`, 'conflict');
    }

    const now = new Date().toISOString();
    const isActive = input.activateImmediately ?? false;

    // Insert into the target table with only the required NOT NULL fields
    const insertPayload = buildInsertPayload(candidate, input.targetTable, isActive);
    const { error: insertErr } = await admin.from(input.targetTable).insert(insertPayload);
    if (insertErr) {
      if ((insertErr.message ?? '').toLowerCase().includes('unique') || insertErr.code === '23505') {
        return err(`${candidate.ticker} already exists in ${input.targetTable}.`, 'conflict');
      }
      return err(`Failed to insert ${candidate.ticker}: ${insertErr.message}`, 'db_error');
    }

    // Mark as imported in the candidates table
    await admin
      .from('ticker_import_candidates')
      .update({
        import_status: 'imported',
        import_target_table: input.targetTable,
        is_in_system: true,
        existing_table: input.targetTable,
        imported_at: now,
        imported_by: ctx.email,
        updated_at: now,
      })
      .eq('id', input.id);

    return ok({ ticker: candidate.ticker, targetTable: input.targetTable });
  });
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

export async function bulkImportTickerCandidatesAction(
  accessToken: string,
  input: { ids: string[]; targetTable: TargetTable; activateImmediately?: boolean }
): Promise<ActionResult<{ imported: number; skipped: number; errors: string[] }>> {
  return withAdmin(accessToken, async (ctx) => {
    if (!Array.isArray(input.ids) || input.ids.length === 0) return err('No candidates selected.', 'validation');
    if (input.ids.length > 200) return err('Maximum 200 tickers per bulk import.', 'validation');
    if (!TARGET_TABLES.includes(input.targetTable)) return err('Invalid target table.', 'validation');

    const admin = getAdminSupabase();

    // Load all requested candidates
    const { data: candidates, error: candErr } = await admin
      .from('ticker_import_candidates')
      .select('*')
      .in('id', input.ids);
    if (candErr) return err('Failed to load candidates.', 'db_error');

    const now = new Date().toISOString();
    const isActive = input.activateImmediately ?? false;
    const errors: string[] = [];
    let imported = 0, skipped = 0;

    const eligible = (candidates ?? []) as TickerCandidate[];
    const toInsert: Record<string, unknown>[] = [];
    const toMark: string[] = [];

    for (const cand of eligible) {
      if (cand.import_status === 'imported') {
        errors.push(`${cand.ticker}: already imported`);
        skipped++;
        continue;
      }
      if (cand.is_in_system) {
        errors.push(`${cand.ticker}: already in ${cand.existing_table}`);
        skipped++;
        continue;
      }
      toInsert.push(buildInsertPayload(cand, input.targetTable, isActive));
      toMark.push(cand.id);
    }

    if (toInsert.length > 0) {
      const { error: insertErr } = await admin.from(input.targetTable).insert(toInsert);
      if (insertErr) {
        return err(`Bulk insert failed: ${insertErr.message}`, 'db_error');
      }
      imported = toInsert.length;

      // Mark all as imported
      await admin
        .from('ticker_import_candidates')
        .update({
          import_status: 'imported',
          import_target_table: input.targetTable,
          is_in_system: true,
          existing_table: input.targetTable,
          imported_at: now,
          imported_by: ctx.email,
          updated_at: now,
        })
        .in('id', toMark);
    }

    return ok({ imported, skipped, errors });
  });
}

// ---------------------------------------------------------------------------
// Skip / Reset
// ---------------------------------------------------------------------------

export async function skipTickerCandidateAction(
  accessToken: string,
  input: { id: string }
): Promise<ActionResult<{ id: string }>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const { error } = await admin
      .from('ticker_import_candidates')
      .update({ import_status: 'skipped', updated_at: new Date().toISOString() })
      .eq('id', input.id);
    if (error) return err('Failed to skip ticker.', 'db_error');
    return ok({ id: input.id });
  });
}

export async function resetTickerCandidateAction(
  accessToken: string,
  input: { id: string }
): Promise<ActionResult<{ id: string }>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const { error } = await admin
      .from('ticker_import_candidates')
      .update({ import_status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', input.id)
      .neq('import_status', 'imported'); // don't un-import
    if (error) return err('Failed to reset ticker.', 'db_error');
    return ok({ id: input.id });
  });
}

// ---------------------------------------------------------------------------
// Add candidates (search + bulk paste / xlsx on client sends rows here)
// ---------------------------------------------------------------------------

const TICKER_SYMBOL_RE = /^[A-Z0-9][A-Z0-9./^\-]{0,39}$/;

function normalizeCandidateTicker(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toUpperCase();
  if (!t || t.length > 40) return null;
  if (!TICKER_SYMBOL_RE.test(t)) return null;
  return t;
}

export type ProviderSymbolHit = {
  symbol: string;
  description: string | null;
  type: string | null;
  exchange: string | null;
};

export async function searchProviderSymbolsAction(
  accessToken: string,
  input: { q: string; limit?: number }
): Promise<ActionResult<{ provider: string; hits: ProviderSymbolHit[] }>> {
  return withAdmin(accessToken, async () => {
    const q = typeof input.q === 'string' ? input.q.trim() : '';
    if (q.length < 1) return err('Type at least one character to search.', 'validation');
    const limit = Math.min(Math.max(Math.floor(input.limit ?? 24), 1), 50);

    const admin = getAdminSupabase();
    const { data: cfg } = await admin.from('admin_api_config').select('preferred_provider').eq('id', 1).maybeSingle();
    const provider =
      typeof cfg?.preferred_provider === 'string' && cfg.preferred_provider.trim()
        ? cfg.preferred_provider.trim().toLowerCase()
        : 'finnhub';

    let apiKey = '';
    if (provider !== 'yahoo') {
      const { data: keyRow, error: keyErr } = await admin
        .from('api_keys')
        .select('key_ciphertext, key_iv, key_auth_tag')
        .eq('provider', provider)
        .eq('is_active', true)
        .maybeSingle();
      if (keyErr) return err('Failed to read API key.', 'db_error');
      if (!keyRow) {
        return err(`No active API key for "${provider}". Add one in API Settings, or choose Yahoo (no key).`, 'config');
      }
      try {
        apiKey = decrypt({
          ciphertext: fromByteaHex((keyRow as Record<string, unknown>).key_ciphertext),
          iv: fromByteaHex((keyRow as Record<string, unknown>).key_iv),
          authTag: fromByteaHex((keyRow as Record<string, unknown>).key_auth_tag),
        });
      } catch (e) {
        return err(`Failed to decrypt API key: ${(e as Error).message}`, 'crypto_error');
      }
    }

    const TIMEOUT_MS = 15_000;
    const hits: ProviderSymbolHit[] = [];

    if (provider === 'finnhub') {
      const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&exchange=US&token=${encodeURIComponent(apiKey)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!r.ok) return err(`Finnhub search failed (HTTP ${r.status}).`, 'provider_error');
      const j = (await r.json()) as {
        result?: Array<{ symbol?: string; description?: string; type?: string; primary?: string }>;
      };
      for (const row of j.result ?? []) {
        const sym = normalizeCandidateTicker(row.symbol ?? '');
        if (!sym) continue;
        hits.push({
          symbol: sym,
          description: row.description?.trim() || null,
          type: row.type?.trim() || null,
          exchange: 'US',
        });
        if (hits.length >= limit) break;
      }
      return ok({ provider, hits });
    }

    if (provider === 'twelve_data') {
      const url = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(q)}&outputsize=${limit + 10}&apikey=${encodeURIComponent(apiKey)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!r.ok) return err(`Twelve Data search failed (HTTP ${r.status}).`, 'provider_error');
      const j = (await r.json()) as {
        data?: Array<{
          symbol?: string;
          instrument_name?: string;
          instrument_type?: string;
          exchange?: string;
          country?: string;
        }>;
      };
      for (const row of j.data ?? []) {
        const ctry = String(row.country ?? '').toLowerCase();
        if (ctry && ctry !== 'united states') continue;
        const sym = normalizeCandidateTicker(row.symbol ?? '');
        if (!sym) continue;
        hits.push({
          symbol: sym,
          description: row.instrument_name?.trim() || null,
          type: row.instrument_type?.trim() || null,
          exchange: row.exchange?.trim() || null,
        });
        if (hits.length >= limit) break;
      }
      return ok({ provider, hits });
    }

    if (provider === 'yahoo') {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${limit}&newsCount=0`;
      const r = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          Origin: 'https://finance.yahoo.com',
          Referer: 'https://finance.yahoo.com/',
        },
      });
      if (!r.ok) return err(`Yahoo Finance search failed (HTTP ${r.status}).`, 'provider_error');
      const j = (await r.json()) as {
        quotes?: Array<{
          symbol?: string;
          shortname?: string;
          longname?: string;
          exchange?: string;
          quoteType?: string;
        }>;
      };
      const allow = new Set(['EQUITY', 'ETF', 'MUTUALFUND']);
      for (const row of j.quotes ?? []) {
        const qt = String(row.quoteType ?? '').toUpperCase();
        if (qt && !allow.has(qt)) continue;
        const sym = normalizeCandidateTicker(row.symbol ?? '');
        if (!sym) continue;
        const desc = (row.longname ?? row.shortname)?.trim() || null;
        hits.push({
          symbol: sym,
          description: desc,
          type: row.quoteType?.trim() || null,
          exchange: row.exchange?.trim() || null,
        });
        if (hits.length >= limit) break;
      }
      return ok({ provider, hits });
    }

    if (provider === 'fmp') {
      const url = `https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(q)}&apikey=${encodeURIComponent(apiKey)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!r.ok) return err(`FMP search failed (HTTP ${r.status}).`, 'provider_error');
      const rows = (await r.json()) as Array<{
        symbol?: string;
        name?: string;
        stockExchange?: string;
        exchangeFullName?: string;
      }>;
      if (!Array.isArray(rows)) return err('FMP search returned an unexpected shape.', 'provider_error');
      for (const row of rows) {
        const sym = normalizeCandidateTicker(row.symbol ?? '');
        if (!sym) continue;
        hits.push({
          symbol: sym,
          description: row.name?.trim() || null,
          type: null,
          exchange: row.stockExchange?.trim() || row.exchangeFullName?.trim() || null,
        });
        if (hits.length >= limit) break;
      }
      return ok({ provider, hits });
    }

    return err(
      `Symbol search is not wired for "${provider}". Use Finnhub, Twelve Data, Yahoo, or FMP as the preferred provider in API Settings.`,
      'unsupported'
    );
  });
}

export type AddCandidateInput = { ticker: string; provider_name?: string | null };

const MAX_ADD_CANDIDATES = 1000;

export async function addTickerCandidatesAction(
  accessToken: string,
  input: { rows: AddCandidateInput[] }
): Promise<ActionResult<{ added: number; skipped: number }>> {
  return withAdmin(accessToken, async () => {
    const rawRows = Array.isArray(input.rows) ? input.rows : [];
    if (rawRows.length === 0) return err('Nothing to add.', 'validation');

    const normalized: AddCandidateInput[] = [];
    const seen = new Set<string>();
    for (const row of rawRows) {
      const t = normalizeCandidateTicker(row.ticker);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      const name =
        typeof row.provider_name === 'string' && row.provider_name.trim() ? row.provider_name.trim() : null;
      normalized.push({ ticker: t, provider_name: name });
      if (normalized.length >= MAX_ADD_CANDIDATES) break;
    }
    if (normalized.length === 0) return err('No valid ticker symbols.', 'validation');

    const admin = getAdminSupabase();
    const tickers = normalized.map((r) => r.ticker);
    const existingSet = new Set<string>();
    for (let i = 0; i < tickers.length; i += 200) {
      const slice = tickers.slice(i, i + 200);
      const { data: existing, error: exErr } = await admin
        .from('ticker_import_candidates')
        .select('ticker')
        .in('ticker', slice);
      if (exErr) return err('Failed to check existing candidates.', 'db_error');
      for (const r of (existing ?? []) as { ticker: string }[]) existingSet.add(r.ticker.toUpperCase());
    }

    const now = new Date().toISOString();
    const toInsert = normalized
      .filter((r) => !existingSet.has(r.ticker))
      .map((r) => ({
        ticker: r.ticker,
        provider_name: r.provider_name ?? null,
        provider_status: 'pending' as const,
        import_status: 'pending' as const,
        updated_at: now,
      }));

    const skipped = normalized.length - toInsert.length;
    let added = 0;
    const CHUNK = 200;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error: insErr } = await admin.from('ticker_import_candidates').insert(chunk);
      if (insErr) {
        return err(`Failed to add tickers: ${insErr.message}`, 'db_error');
      }
      added += chunk.length;
    }

    return ok({ added, skipped });
  });
}

// ---------------------------------------------------------------------------
// Internal: build per-table insert payload
// ---------------------------------------------------------------------------

function buildInsertPayload(
  candidate: TickerCandidate,
  targetTable: TargetTable,
  isActive: boolean
): Record<string, unknown> {
  const name = candidate.provider_name ?? candidate.ticker;
  switch (targetTable) {
    case 'market_segments':
      return { ticker: candidate.ticker, name, is_active: isActive };
    case 'sectors':
      return { ticker: candidate.ticker, sector_name: name, is_active: isActive };
    case 'mega_caps':
      return { ticker: candidate.ticker, company_name: name, is_active: isActive };
    case 'other_stocks':
    default:
      return { ticker: candidate.ticker, company_name: name, is_active: isActive };
  }
}
