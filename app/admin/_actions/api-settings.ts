'use server';

import { getAdminSupabase } from '@/lib/server/supabase-admin';
import { encrypt, fingerprint, decrypt } from '@/lib/server/crypto';
import { err, ok, withAdmin, type ActionResult } from './_shared';

export type ApiKeyMetadata = {
  id: string;
  provider: string;
  key_fingerprint: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type ApiHealthRow = {
  id: number;
  provider: string;
  run_at: string;
  duration_ms: number | null;
  tickers_updated: number;
  tickers_failed: number;
  status: 'ok' | 'partial' | 'error';
  error_message: string | null;
  triggered_by: string | null;
};

export type AdminApiConfig = {
  id: number;
  preferred_provider: string;
  refresh_interval_seconds: number;
  auto_retry: boolean;
  cache_responses: boolean;
  realtime_updates: boolean;
  rate_limit_rpm: number;
  updated_at: string;
  updated_by: string | null;
};

const PROVIDER_RE = /^[a-z0-9_-]{2,32}$/;

const DEFAULT_API_CONFIG: AdminApiConfig = {
  id: 1,
  preferred_provider: 'finnhub',
  refresh_interval_seconds: 900,
  auto_retry: true,
  cache_responses: true,
  realtime_updates: false,
  rate_limit_rpm: 60,
  updated_at: new Date(0).toISOString(),
  updated_by: null,
};

export async function getAdminApiConfigAction(accessToken: string): Promise<ActionResult<AdminApiConfig>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const { data, error } = await admin.from('admin_api_config').select('*').eq('id', 1).maybeSingle();
    if (error) {
      const msg = (error.message ?? '').toLowerCase();
      if (msg.includes('relation') || msg.includes('does not exist') || msg.includes('schema cache')) {
        return ok(DEFAULT_API_CONFIG);
      }
      return err('Failed to load API configuration.', 'db_error');
    }
    if (!data) return ok(DEFAULT_API_CONFIG);
    return ok(data as AdminApiConfig);
  });
}

export async function saveAdminApiConfigAction(
  accessToken: string,
  input: {
    preferred_provider: string;
    refresh_interval_seconds: number;
    auto_retry: boolean;
    cache_responses: boolean;
    realtime_updates: boolean;
    rate_limit_rpm: number;
  }
): Promise<ActionResult<AdminApiConfig>> {
  return withAdmin(accessToken, async (ctx) => {
    const provider = typeof input.preferred_provider === 'string' ? input.preferred_provider.trim().toLowerCase() : '';
    if (!PROVIDER_RE.test(provider)) return err('Invalid provider.', 'validation');
    const refresh = Math.round(Number(input.refresh_interval_seconds));
    const rpm = Math.round(Number(input.rate_limit_rpm));
    if (!Number.isFinite(refresh) || refresh < 30 || refresh > 86400) return err('Refresh interval must be 30–86400 seconds.', 'validation');
    if (!Number.isFinite(rpm) || rpm < 1 || rpm > 100000) return err('Rate limit must be 1–100000.', 'validation');

    const admin = getAdminSupabase();
    const now = new Date().toISOString();
    const payload = {
      id: 1,
      preferred_provider: provider,
      refresh_interval_seconds: refresh,
      auto_retry: Boolean(input.auto_retry),
      cache_responses: Boolean(input.cache_responses),
      realtime_updates: Boolean(input.realtime_updates),
      rate_limit_rpm: rpm,
      updated_at: now,
      updated_by: ctx.email,
    };
    const { data, error } = await admin.from('admin_api_config').upsert(payload, { onConflict: 'id' }).select('*').single();
    if (error) return err('Failed to save API configuration.', 'db_error');
    return ok(data as AdminApiConfig);
  });
}

export type ApiConnectionTestResult = { connected: boolean; message: string };

export async function testApiConnectionAction(
  accessToken: string,
  input: { provider: string }
): Promise<ActionResult<ApiConnectionTestResult>> {
  return withAdmin(accessToken, async () => {
    const provider = typeof input.provider === 'string' ? input.provider.trim().toLowerCase() : '';
    if (!PROVIDER_RE.test(provider)) return err('Invalid provider.', 'validation');
    const admin = getAdminSupabase();
    const { data: keyRow, error } = await admin
      .from('api_keys')
      .select('key_ciphertext, key_iv, key_auth_tag, is_active')
      .eq('provider', provider)
      .eq('is_active', true)
      .maybeSingle();
    if (error) return err('Failed to read API keys.', 'db_error');
    if (!keyRow) {
      return ok({ connected: false, message: `No active key stored for ${provider}. Save a key first.` });
    }
    let apiKey: string;
    try {
      apiKey = decrypt({
        ciphertext: byteaToBuffer((keyRow as Record<string, unknown>).key_ciphertext),
        iv: byteaToBuffer((keyRow as Record<string, unknown>).key_iv),
        authTag: byteaToBuffer((keyRow as Record<string, unknown>).key_auth_tag),
      });
    } catch (e) {
      return ok({ connected: false, message: `Key decryption failed: ${(e as Error).message}` });
    }
    try {
      const result = await liveTestProvider(provider, apiKey);
      return ok(result);
    } catch (e) {
      return ok({ connected: false, message: `Test failed: ${(e as Error).message}` });
    }
  });
}

function byteaToBuffer(raw: unknown): Buffer {
  if (typeof raw === 'string') {
    const hex = raw.startsWith('\\x') ? raw.slice(2) : raw;
    return Buffer.from(hex, 'hex');
  }
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  throw new Error('Cannot convert to Buffer');
}

async function liveTestProvider(provider: string, apiKey: string): Promise<ApiConnectionTestResult> {
  const TIMEOUT = 10_000;
  const ticker = 'AAPL';

  if (provider === 'finnhub') {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) return { connected: false, message: `Finnhub HTTP ${r.status}` };
    const j = (await r.json()) as { c?: number; pc?: number };
    const price = (j.c && j.c > 0 ? j.c : j.pc) ?? 0;
    if (!price) return { connected: false, message: 'Finnhub returned no price data' };
    return { connected: true, message: `Finnhub OK — AAPL: $${price.toFixed(2)}` };
  }

  if (provider === 'twelve_data') {
    const r = await fetch(`https://api.twelvedata.com/price?symbol=${ticker}&apikey=${apiKey}`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) return { connected: false, message: `TwelveData HTTP ${r.status}` };
    const j = (await r.json()) as { price?: string; code?: number; message?: string };
    if (j.code && j.code >= 400) return { connected: false, message: j.message ?? 'TwelveData API error' };
    const price = Number(j.price);
    if (!Number.isFinite(price) || price <= 0) return { connected: false, message: 'TwelveData returned no price data' };
    return { connected: true, message: `TwelveData OK — AAPL: $${price.toFixed(2)}` };
  }

  if (provider === 'fmp') {
    // Try stable endpoint with ?apikey= param (FMP's documented method)
    const fmpUrl = `https://financialmodelingprep.com/stable/quote?symbol=${ticker}&apikey=${apiKey}`;
    console.info('[fmp:test] key_length:', apiKey.length, 'key_prefix:', apiKey.slice(0, 6) + '...');
    const r = await fetch(fmpUrl, { signal: AbortSignal.timeout(TIMEOUT) });
    const rawBody = await r.text().catch(() => '(unreadable)');
    console.info('[fmp:test] status:', r.status, 'body:', rawBody.slice(0, 300));
    if (!r.ok) return { connected: false, message: `FMP HTTP ${r.status} — ${rawBody.slice(0, 200)}` };
    let j: unknown;
    try { j = JSON.parse(rawBody); } catch { return { connected: false, message: `FMP non-JSON response: ${rawBody.slice(0, 200)}` }; }
    if (!Array.isArray(j)) return { connected: false, message: (j as { 'Error Message'?: string })['Error Message'] ?? `FMP unexpected shape: ${rawBody.slice(0, 200)}` };
    const price = (j as Array<{ price?: number }>)[0]?.price ?? 0;
    if (!price) return { connected: false, message: `FMP returned no price — body: ${rawBody.slice(0, 200)}` };
    return { connected: true, message: `FMP OK — AAPL: $${price.toFixed(2)}` };
  }

  if (provider === 'yahoo') {
    // Yahoo Finance is public — no API key required. Key value is ignored.
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`, {
      signal: AbortSignal.timeout(TIMEOUT),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://finance.yahoo.com',
        'Referer': 'https://finance.yahoo.com/',
      },
    });
    const rawBody = await r.text().catch(() => '(unreadable)');
    if (!r.ok) return { connected: false, message: `Yahoo Finance HTTP ${r.status}` };
    let j: unknown;
    try { j = JSON.parse(rawBody); } catch { return { connected: false, message: `Yahoo Finance non-JSON response` }; }
    const price = (j as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } })?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
    if (!price) return { connected: false, message: `Yahoo Finance returned no price` };
    return { connected: true, message: `Yahoo Finance OK — AAPL: $${price.toFixed(2)}` };
  }

  if (provider === 'alpha_vantage') {
    const r = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${apiKey}`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) return { connected: false, message: `Alpha Vantage HTTP ${r.status}` };
    const j = (await r.json()) as { 'Global Quote'?: Record<string, string>; Note?: string; Information?: string };
    if (j.Note || j.Information) return { connected: false, message: 'Alpha Vantage rate limit hit (25 req/day on free plan)' };
    const price = Number(j['Global Quote']?.['05. price']);
    if (!Number.isFinite(price) || price <= 0) return { connected: false, message: 'Alpha Vantage returned no price data' };
    return { connected: true, message: `Alpha Vantage OK — AAPL: $${price.toFixed(2)}` };
  }

  if (provider === 'polygon') {
    const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${apiKey}`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) return { connected: false, message: `Polygon HTTP ${r.status}` };
    const j = (await r.json()) as { results?: Array<{ c?: number }> };
    const price = j.results?.[0]?.c ?? 0;
    if (!price) return { connected: false, message: 'Polygon returned no price data' };
    return { connected: true, message: `Polygon OK — AAPL prev close: $${price.toFixed(2)}` };
  }

  return { connected: false, message: `Unknown provider: ${provider}. Add a key and test again.` };
}

export async function listApiKeysAction(accessToken: string): Promise<ActionResult<ApiKeyMetadata[]>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('api_keys')
      .select('id, provider, key_fingerprint, is_active, created_at, updated_at, updated_by')
      .order('provider', { ascending: true });
    if (error) return err('Failed to load API keys.', 'db_error');
    return ok((data ?? []) as ApiKeyMetadata[]);
  });
}

export async function saveApiKeyAction(
  accessToken: string,
  input: { provider: string; key: string; isActive?: boolean }
): Promise<ActionResult<ApiKeyMetadata>> {
  return withAdmin(accessToken, async (ctx) => {
    const provider = typeof input.provider === 'string' ? input.provider.trim().toLowerCase() : '';
    const key = typeof input.key === 'string' ? input.key.trim() : '';
    if (!PROVIDER_RE.test(provider)) return err('Invalid provider.', 'validation');
    if (key.length < 4 || key.length > 512) return err('API key has an invalid length.', 'validation');

    const blob = encrypt(key);
    const fp = fingerprint(key);
    const toByteaHex = (buf: Buffer) => `\\x${buf.toString('hex')}`;

    const admin = getAdminSupabase();
    const now = new Date().toISOString();

    const payload = {
      provider,
      key_ciphertext: toByteaHex(blob.ciphertext),
      key_iv: toByteaHex(blob.iv),
      key_auth_tag: toByteaHex(blob.authTag),
      key_fingerprint: fp,
      is_active: input.isActive ?? true,
      updated_at: now,
      updated_by: ctx.email,
    };

    const { data, error } = await admin
      .from('api_keys')
      .upsert(payload, { onConflict: 'provider' })
      .select('id, provider, key_fingerprint, is_active, created_at, updated_at, updated_by')
      .single();

    if (error) return err('Failed to save API key.', 'db_error');
    return ok(data as ApiKeyMetadata);
  });
}

export async function toggleApiKeyActiveAction(
  accessToken: string,
  input: { provider: string; isActive: boolean }
): Promise<ActionResult<ApiKeyMetadata>> {
  return withAdmin(accessToken, async (ctx) => {
    const provider = typeof input.provider === 'string' ? input.provider.trim().toLowerCase() : '';
    if (!PROVIDER_RE.test(provider)) return err('Invalid provider.', 'validation');
    if (typeof input.isActive !== 'boolean') return err('Invalid active flag.', 'validation');

    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('api_keys')
      .update({ is_active: input.isActive, updated_at: new Date().toISOString(), updated_by: ctx.email })
      .eq('provider', provider)
      .select('id, provider, key_fingerprint, is_active, created_at, updated_at, updated_by')
      .single();
    if (error) return err('Failed to update API key.', 'db_error');
    return ok(data as ApiKeyMetadata);
  });
}

export async function deleteApiKeyAction(
  accessToken: string,
  input: { provider: string }
): Promise<ActionResult<{ provider: string }>> {
  return withAdmin(accessToken, async () => {
    const provider = typeof input.provider === 'string' ? input.provider.trim().toLowerCase() : '';
    if (!PROVIDER_RE.test(provider)) return err('Invalid provider.', 'validation');
    const admin = getAdminSupabase();
    const { error } = await admin.from('api_keys').delete().eq('provider', provider);
    if (error) return err('Failed to delete API key.', 'db_error');
    return ok({ provider });
  });
}

export type ApiDashboardMetrics = {
  statusLabel: 'Operational' | 'Degraded' | 'Error' | 'No data';
  avgResponseMs: number | null;
  activity24h: number;
  successRatePct: number | null;
};

export type DataCollectionRunResult = {
  status: 'ok' | 'partial' | 'error';
  updated: number;
  failed: number;
  imported?: number;
  skipped?: number;
  durationMs: number;
  queued?: boolean;
};

export async function getApiDashboardMetricsAction(accessToken: string): Promise<ActionResult<ApiDashboardMetrics>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: lastGlobal, error: lastErr } = await admin
      .from('api_health_log')
      .select('status')
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastErr) return err('Failed to load metrics.', 'db_error');

    const { data, error } = await admin
      .from('api_health_log')
      .select('status, run_at, duration_ms, tickers_updated, tickers_failed')
      .gte('run_at', since)
      .order('run_at', { ascending: false })
      .limit(200);
    if (error) return err('Failed to load metrics.', 'db_error');
    const rows = (data ?? []) as Pick<ApiHealthRow, 'status' | 'run_at' | 'duration_ms' | 'tickers_updated' | 'tickers_failed'>[];
    const metrics: ApiDashboardMetrics = !lastGlobal
      ? { statusLabel: 'No data', avgResponseMs: null, activity24h: 0, successRatePct: null }
      : (() => {
          const last = lastGlobal as { status: ApiHealthRow['status'] };
          const statusLabel: ApiDashboardMetrics['statusLabel'] =
            last.status === 'ok' ? 'Operational' : last.status === 'partial' ? 'Degraded' : 'Error';
          const withDur = rows.filter((r) => r.duration_ms != null && Number(r.duration_ms) > 0);
          const avgResponseMs =
            withDur.length === 0
              ? null
              : Math.round(withDur.reduce((s, r) => s + Number(r.duration_ms), 0) / withDur.length);
          const activity24h = rows.reduce((s, r) => s + Number(r.tickers_updated) + Number(r.tickers_failed), 0);
          const okCount = rows.filter((r) => r.status === 'ok').length;
          const successRatePct = rows.length === 0 ? null : Math.round((okCount / rows.length) * 1000) / 10;
          return { statusLabel, avgResponseMs, activity24h, successRatePct };
        })();
    return ok(metrics);
  });
}

type EdgeProgressPayload = {
  type: 'progress';
  mode: 'collect' | 'import';
  phase: string;
  done: number;
  total: number;
  percent: number;
};

function parseEdgeProgressPayload(raw: string | null): EdgeProgressPayload | null {
  if (!raw) return null;
  const idx = raw.indexOf('__progress__');
  if (idx < 0) return null;
  try {
    const parsed = JSON.parse(raw.slice(idx + '__progress__'.length).trim()) as EdgeProgressPayload;
    if (parsed?.type !== 'progress') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Any in-flight edge job (manual, cron, or another tab) — same rows the admin UI polls for progress. */
async function findActiveEdgeJob(
  admin: ReturnType<typeof getAdminSupabase>
): Promise<{ message: string; mode: 'collect' | 'import'; phase: string; percent: number } | null> {
  const { data, error } = await admin
    .from('api_health_log')
    .select('error_message')
    .order('id', { ascending: false })
    .limit(80);
  if (error || !data?.length) return null;
  for (const row of data) {
    const p = parseEdgeProgressPayload((row as { error_message: string | null }).error_message);
    if (p && p.percent < 100) {
      const label = p.mode === 'import' ? 'Ticker import' : 'Ticker data collection';
      return {
        mode: p.mode,
        phase: p.phase,
        percent: p.percent,
        message: `${label} is already running (${p.phase}, ${p.percent}%). Wait for it to finish — this may be the hourly schedule, another admin, or a job you started earlier.`,
      };
    }
  }
  return null;
}

export async function listApiHealthAction(
  accessToken: string,
  input?: { limit?: number; provider?: string }
): Promise<ActionResult<ApiHealthRow[]>> {
  return withAdmin(accessToken, async () => {
    const limit = Math.min(Math.max(input?.limit ?? 20, 1), 500);
    const admin = getAdminSupabase();
    let q = admin
      .from('api_health_log')
      .select('id, provider, run_at, duration_ms, tickers_updated, tickers_failed, status, error_message, triggered_by')
      .order('run_at', { ascending: false })
      .limit(limit);
    if (input?.provider && PROVIDER_RE.test(input.provider)) {
      q = q.eq('provider', input.provider);
    }
    const { data, error } = await q;
    if (error) return err('Failed to load health log.', 'db_error');
    return ok((data ?? []) as ApiHealthRow[]);
  });
}

export async function runTickerDataCollectionAction(
  accessToken: string,
  input?: { importUniverse?: boolean; importLimit?: number }
): Promise<ActionResult<DataCollectionRunResult>> {
  return withAdmin(accessToken, async (ctx) => {
    const admin = getAdminSupabase();
    const activeJob = await findActiveEdgeJob(admin);
    if (activeJob) return err(activeJob.message, 'busy');

    const { data: cfg } = await admin.from('admin_api_config').select('preferred_provider').eq('id', 1).maybeSingle();
    const preferredProvider =
      typeof cfg?.preferred_provider === 'string' && cfg.preferred_provider.trim()
        ? cfg.preferred_provider.trim().toLowerCase()
        : 'finnhub';

    const edgeSecret = process.env.EDGE_FN_SECRET ?? process.env.EDGE_FN_SECRET_DEV ?? process.env.EDGE_FN_SECRET_PROD;
    if (!edgeSecret) {
      return err('EDGE_FN_SECRET is not configured in server env.', 'config');
    }

    const edgeFunctionName = input?.importUniverse ? 'update-stock-data' : 'collect-stock-data';

    const importLimitRaw = Number(input?.importLimit ?? 100);
    const importLimit = Math.min(Math.max(Math.floor(importLimitRaw), 1), 100);
    const { data: startedLog, error: startedLogError } = await admin
      .from('api_health_log')
      .insert({
        provider: preferredProvider,
        status: 'partial',
        error_message: `__progress__${JSON.stringify({
          type: 'progress',
          mode: input?.importUniverse ? 'import' : 'collect',
          phase: 'queued',
          done: 0,
          total: 0,
          percent: 0,
          updated: 0,
          failed: 0,
          imported: 0,
          skipped: 0,
          elapsedMs: 0,
        })}`,
        triggered_by: ctx.email,
        duration_ms: null,
        tickers_updated: 0,
        tickers_failed: 0,
      })
      .select('id')
      .single();
    if (startedLogError || !startedLog) {
      return err('Failed to create run progress log.', 'db_error');
    }
    const payload = {
      triggered_by: ctx.email,
      preferred_provider: preferredProvider,
      import_universe: Boolean(input?.importUniverse),
      import_limit: importLimit,
      run_log_id: Number((startedLog as { id: number }).id),
    };
    const started = Date.now();
    console.info('[admin][data-collection] start', {
      admin: ctx.email,
      provider: preferredProvider,
      importUniverse: payload.import_universe,
      importLimit,
    });
    void admin.functions
      .invoke(edgeFunctionName, {
        body: payload,
        headers: {
          'x-edge-secret': edgeSecret,
        },
      })
      .then(async (invokeRes) => {
        const body = ((invokeRes.data as Record<string, unknown>) ?? {}) as {
          error?: string;
          status?: DataCollectionRunResult['status'];
          updated?: number;
          failed?: number;
          imported?: number;
          skipped?: number;
          durationMs?: number;
        };
        if (invokeRes.error) {
          const details = await readInvokeErrorDetails(invokeRes.error);
          const message = details.message ?? body.error ?? invokeRes.error.message ?? 'Edge function invocation failed.';
          console.error('[admin][data-collection] edge error', {
            admin: ctx.email,
            edgeFunctionName,
            provider: preferredProvider,
            status: details.status ?? null,
            message,
          });
          await admin
            .from('api_health_log')
            .update({
              provider: preferredProvider,
              status: 'error',
              error_message: `[admin-action] ${message}`,
              triggered_by: ctx.email,
              duration_ms: Date.now() - started,
              tickers_updated: 0,
              tickers_failed: 0,
              run_at: new Date().toISOString(),
            })
            .eq('id', Number((startedLog as { id: number }).id));
          return;
        }
        console.info('[admin][data-collection] completed', {
          admin: ctx.email,
          provider: preferredProvider,
          status: body.status ?? 'error',
          updated: Number(body.updated ?? 0),
          failed: Number(body.failed ?? 0),
          imported: Number(body.imported ?? 0),
          skipped: Number(body.skipped ?? 0),
          durationMs: Number(body.durationMs ?? 0),
        });
      })
      .catch(async (e) => {
        const message = e instanceof Error ? e.message : String(e);
        await admin
          .from('api_health_log')
          .update({
            provider: preferredProvider,
            status: 'error',
            error_message: `[admin-action] ${message}`,
            triggered_by: ctx.email,
            duration_ms: Date.now() - started,
            tickers_updated: 0,
            tickers_failed: 0,
            run_at: new Date().toISOString(),
          })
          .eq('id', Number((startedLog as { id: number }).id));
      });
    return ok({
      status: 'partial',
      updated: 0,
      failed: 0,
      imported: 0,
      skipped: 0,
      durationMs: 0,
      queued: true,
    });
  });
}

export async function runUpdateTickersAction(
  accessToken: string
): Promise<ActionResult<DataCollectionRunResult>> {
  return runTickerDataCollectionAction(accessToken, { importUniverse: false });
}

export async function runImportCandidatesAction(
  accessToken: string
): Promise<ActionResult<DataCollectionRunResult>> {
  return withAdmin(accessToken, async (ctx) => {
    const admin = getAdminSupabase();
    const activeJob = await findActiveEdgeJob(admin);
    if (activeJob) return err(activeJob.message, 'busy');

    const { data: cfg } = await admin.from('admin_api_config').select('preferred_provider').eq('id', 1).maybeSingle();
    const preferredProvider =
      typeof cfg?.preferred_provider === 'string' && cfg.preferred_provider.trim()
        ? cfg.preferred_provider.trim().toLowerCase()
        : 'finnhub';

    const edgeSecret = process.env.EDGE_FN_SECRET ?? process.env.EDGE_FN_SECRET_DEV ?? process.env.EDGE_FN_SECRET_PROD;
    if (!edgeSecret) {
      return err('EDGE_FN_SECRET is not configured in server env.', 'config');
    }

    const { data: startedLog, error: startedLogError } = await admin
      .from('api_health_log')
      .insert({
        provider: preferredProvider,
        status: 'partial',
        error_message: `__progress__${JSON.stringify({
          type: 'progress',
          mode: 'import',
          phase: 'queued',
          done: 0,
          total: 0,
          percent: 0,
          updated: 0,
          failed: 0,
          imported: 0,
          skipped: 0,
          elapsedMs: 0,
        })}`,
        triggered_by: ctx.email,
        duration_ms: null,
        tickers_updated: 0,
        tickers_failed: 0,
      })
      .select('id')
      .single();
    if (startedLogError || !startedLog) {
      return err('Failed to create run progress log.', 'db_error');
    }

    const payload = {
      triggered_by: ctx.email,
      preferred_provider: preferredProvider,
      import_from_candidates: true,
      run_log_id: Number((startedLog as { id: number }).id),
    };
    const started = Date.now();

    void admin.functions
      .invoke('import-candidates-data', {
        body: payload,
        headers: { 'x-edge-secret': edgeSecret },
      })
      .then(async (invokeRes) => {
        const body = ((invokeRes.data as Record<string, unknown>) ?? {}) as {
          error?: string;
          status?: DataCollectionRunResult['status'];
          imported?: number;
          failed?: number;
          skipped?: number;
          durationMs?: number;
        };
        if (invokeRes.error) {
          const details = await readInvokeErrorDetails(invokeRes.error);
          const message = details.message ?? body.error ?? invokeRes.error.message ?? 'Edge function invocation failed.';
          await admin
            .from('api_health_log')
            .update({
              provider: preferredProvider,
              status: 'error',
              error_message: `[admin-action] ${message}`,
              triggered_by: ctx.email,
              duration_ms: Date.now() - started,
              tickers_updated: 0,
              tickers_failed: 0,
              run_at: new Date().toISOString(),
            })
            .eq('id', Number((startedLog as { id: number }).id));
        }
      })
      .catch(async (e) => {
        const message = e instanceof Error ? e.message : String(e);
        await admin
          .from('api_health_log')
          .update({
            provider: preferredProvider,
            status: 'error',
            error_message: `[admin-action] ${message}`,
            triggered_by: ctx.email,
            duration_ms: Date.now() - started,
            tickers_updated: 0,
            tickers_failed: 0,
            run_at: new Date().toISOString(),
          })
          .eq('id', Number((startedLog as { id: number }).id));
      });

    return ok({
      status: 'partial',
      updated: 0,
      failed: 0,
      imported: 0,
      skipped: 0,
      durationMs: 0,
      queued: true,
    });
  });
}

export async function runManualTickerUpdateAction(
  accessToken: string,
  input: { tickers: string[] }
): Promise<ActionResult<DataCollectionRunResult>> {
  return withAdmin(accessToken, async (ctx) => {
    if (!Array.isArray(input.tickers) || input.tickers.length === 0) return err('No tickers specified.', 'validation');
    if (input.tickers.length > 20) return err('Maximum 20 tickers per manual update.', 'validation');
    const tickers = input.tickers.map((t) => String(t).toUpperCase().trim()).filter(Boolean);
    if (tickers.length === 0) return err('No valid tickers provided.', 'validation');

    const admin = getAdminSupabase();
    const activeJob = await findActiveEdgeJob(admin);
    if (activeJob) return err(activeJob.message, 'busy');

    const { data: cfg } = await admin.from('admin_api_config').select('preferred_provider').eq('id', 1).maybeSingle();
    const preferredProvider =
      typeof cfg?.preferred_provider === 'string' && cfg.preferred_provider.trim()
        ? cfg.preferred_provider.trim().toLowerCase()
        : 'finnhub';

    const edgeSecret = process.env.EDGE_FN_SECRET ?? process.env.EDGE_FN_SECRET_DEV ?? process.env.EDGE_FN_SECRET_PROD;
    if (!edgeSecret) return err('EDGE_FN_SECRET is not configured in server env.', 'config');

    const { data: startedLog, error: startedLogError } = await admin
      .from('api_health_log')
      .insert({
        provider: preferredProvider,
        status: 'partial',
        error_message: `__progress__${JSON.stringify({
          type: 'progress',
          mode: 'collect',
          phase: 'queued',
          done: 0,
          total: tickers.length,
          percent: 0,
          updated: 0,
          failed: 0,
          imported: 0,
          skipped: 0,
          elapsedMs: 0,
        })}`,
        triggered_by: ctx.email,
        duration_ms: null,
        tickers_updated: 0,
        tickers_failed: 0,
      })
      .select('id')
      .single();
    if (startedLogError || !startedLog) return err('Failed to create run progress log.', 'db_error');

    const payload = {
      triggered_by: ctx.email,
      preferred_provider: preferredProvider,
      target_tickers: tickers,
      run_log_id: Number((startedLog as { id: number }).id),
    };
    const started = Date.now();

    void admin.functions
      .invoke('collect-stock-data', {
        body: payload,
        headers: { 'x-edge-secret': edgeSecret },
      })
      .then(async (invokeRes) => {
        const body = ((invokeRes.data as Record<string, unknown>) ?? {}) as {
          error?: string;
          status?: DataCollectionRunResult['status'];
          updated?: number;
          failed?: number;
          durationMs?: number;
        };
        if (invokeRes.error) {
          const details = await readInvokeErrorDetails(invokeRes.error);
          const message = details.message ?? body.error ?? invokeRes.error.message ?? 'Edge function invocation failed.';
          await admin
            .from('api_health_log')
            .update({ status: 'error', error_message: `[manual] ${message}`, duration_ms: Date.now() - started, run_at: new Date().toISOString() })
            .eq('id', Number((startedLog as { id: number }).id));
        }
      })
      .catch(async (e) => {
        const message = e instanceof Error ? e.message : String(e);
        await admin
          .from('api_health_log')
          .update({ status: 'error', error_message: `[manual] ${message}`, duration_ms: Date.now() - started, run_at: new Date().toISOString() })
          .eq('id', Number((startedLog as { id: number }).id));
      });

    return ok({ status: 'partial', updated: 0, failed: 0, imported: 0, skipped: 0, durationMs: 0, queued: true });
  });
}

async function readInvokeErrorDetails(error: unknown): Promise<{ status: number | null; message: string | null }> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (!ctx || typeof ctx !== 'object') return { status: null, message: null };
  const status =
    typeof (ctx as { status?: unknown }).status === 'number'
      ? ((ctx as { status: number }).status as number)
      : null;
  const textFn = (ctx as { text?: unknown }).text;
  if (typeof textFn !== 'function') return { status, message: null };
  try {
    const raw = await (ctx as { text: () => Promise<string> }).text();
    if (!raw) return { status, message: null };
    try {
      const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
      const message =
        typeof parsed.error === 'string'
          ? parsed.error
          : typeof parsed.message === 'string'
            ? parsed.message
            : raw.slice(0, 500);
      return { status, message };
    } catch {
      return { status, message: raw.slice(0, 500) };
    }
  } catch {
    return { status, message: null };
  }
}
