'use client';

import { CheckCircle2, RefreshCw, Save, Zap, Activity } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getAdminApiConfigAction,
  getApiDashboardMetricsAction,
  listApiHealthAction,
  listApiKeysAction,
  saveAdminApiConfigAction,
  saveApiKeyAction,
  testApiConnectionAction,
  type AdminApiConfig,
  type ApiDashboardMetrics,
  type ApiHealthRow,
  type ApiKeyMetadata,
} from '../../_actions/api-settings';
import { useAdmin } from '../../_lib/admin-context';
import { useLiveAdminRefresh } from '../../_lib/use-live-admin-refresh';

const PROVIDER_OPTIONS = [
  { id: 'finnhub', label: 'Finnhub' },
  { id: 'twelve_data', label: 'Twelve Data' },
  { id: 'fmp', label: 'Financial Modeling Prep (FMP)' },
  { id: 'alpha_vantage', label: 'Alpha Vantage' },
  { id: 'polygon', label: 'Polygon.io' },
  { id: 'yahoo', label: 'Yahoo Finance (free, no key needed)' },
] as const;

const FIELD_STYLE =
  'block w-full rounded-lg border border-input bg-input-background px-3 py-2 text-sm text-foreground shadow-sm outline-none ring-offset-background transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30 dark:scheme-dark';

function fmtInt(n: number) {
  return n.toLocaleString('en-US');
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function isProgressRow(raw: string | null) {
  return raw != null && raw.includes('__progress__');
}

function sameAdminConfig(a: AdminApiConfig | null, b: AdminApiConfig | null) {
  if (!a || !b) return false;
  return (
    a.preferred_provider === b.preferred_provider &&
    a.refresh_interval_seconds === b.refresh_interval_seconds &&
    a.auto_retry === b.auto_retry &&
    a.cache_responses === b.cache_responses &&
    a.realtime_updates === b.realtime_updates &&
    a.rate_limit_rpm === b.rate_limit_rpm
  );
}

export default function APISettings() {
  const { getAccessToken } = useAdmin();
  const [keys, setKeys] = useState<ApiKeyMetadata[]>([]);
  const [health, setHealth] = useState<ApiHealthRow[]>([]);
  const [metrics, setMetrics] = useState<ApiDashboardMetrics | null>(null);
  const [config, setConfig] = useState<AdminApiConfig | null>(null);
  const [syncedConfig, setSyncedConfig] = useState<AdminApiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const configRef = useRef<AdminApiConfig | null>(null);
  const syncedConfigRef = useRef<AdminApiConfig | null>(null);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    syncedConfigRef.current = syncedConfig;
  }, [syncedConfig]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const [keysRes, healthRes, metricsRes, cfgRes] = await Promise.all([
        listApiKeysAction(token),
        listApiHealthAction(token, { limit: 50 }),
        getApiDashboardMetricsAction(token),
        getAdminApiConfigAction(token),
      ]);
      if (!keysRes.ok) setError(keysRes.error);
      else setKeys(keysRes.data);
      if (healthRes.ok) setHealth(healthRes.data as ApiHealthRow[]);
      if (metricsRes.ok) setMetrics(metricsRes.data);
      if (cfgRes.ok) {
        const hasLocalUnsavedConfig = !sameAdminConfig(configRef.current, syncedConfigRef.current);
        // Silent refreshes should not overwrite form edits in progress.
        if (!silent || !hasLocalUnsavedConfig) {
          setConfig(cfgRes.data);
        }
        setSyncedConfig(cfgRes.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void load({ silent: false });
  }, [load]);

  useLiveAdminRefresh({
    channelName: 'admin-api-settings-live',
    getAccessToken,
    refresh: () => void load({ silent: true }),
    pollingMs: 30_000,
    throttleMs: 3_000,
    realtime: [
      { schema: 'public', table: 'api_health_log' },
      { schema: 'public', table: 'api_keys' },
      { schema: 'public', table: 'admin_api_config' },
    ],
  });

  const keysByProvider = useMemo(() => {
    const map = new Map<string, ApiKeyMetadata>();
    for (const k of keys) map.set(k.provider, k);
    return map;
  }, [keys]);

  const preferred = config?.preferred_provider ?? 'finnhub';
  const existingKey = keysByProvider.get(preferred);

  const kpiCards = useMemo(() => {
    const m = metrics;
    const avg = m?.avgResponseMs != null ? `${fmtInt(m.avgResponseMs)}ms` : '—';
    const activity = m ? fmtInt(m.activity24h) : '—';
    const rate = m?.successRatePct != null ? `${m.successRatePct}%` : '—';
    const status = m?.statusLabel ?? 'No data';
    const statusGreen = status === 'Operational';
    return [
      {
        label: 'API Status',
        value: status,
        sub: 'Current pipeline health',
        icon: CheckCircle2,
        accent: statusGreen ? 'text-emerald-700 dark:text-emerald-400' : m?.statusLabel === 'Degraded' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
        iconWrap: statusGreen ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground',
      },
      {
        label: 'Avg Response Time',
        value: avg,
        sub: 'Mean job duration (24h)',
        icon: Zap,
        accent: 'text-amber-700 dark:text-amber-400',
        iconWrap: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
      },
      {
        label: 'Requests Today',
        value: activity,
        sub: 'Ticker rows touched (24h)',
        icon: Activity,
        accent: 'text-violet-700 dark:text-violet-400',
        iconWrap: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
      },
      {
        label: 'Success Rate',
        value: rate,
        sub: 'OK runs / total runs (24h)',
        icon: CheckCircle2,
        accent: 'text-emerald-700 dark:text-emerald-400',
        iconWrap: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
      },
    ];
  }, [metrics]);

  const onTestConnection = async () => {
    setError(null);
    setFlash(null);
    setBusy(true);
    try {
      const token = await getAccessToken();
      const res = await testApiConnectionAction(token, { provider: preferred });
      if (!res.ok) setError(res.error);
      else setFlash(res.data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  const onSaveSettings = async () => {
    if (!config) return;
    setError(null);
    setFlash(null);
    setBusy(true);
    try {
      const token = await getAccessToken();
      const cfgRes = await saveAdminApiConfigAction(token, {
        preferred_provider: config.preferred_provider,
        refresh_interval_seconds: config.refresh_interval_seconds,
        auto_retry: config.auto_retry,
        cache_responses: config.cache_responses,
        realtime_updates: config.realtime_updates,
        rate_limit_rpm: config.rate_limit_rpm,
      });
      if (!cfgRes.ok) {
        setError(cfgRes.error);
        return;
      }
      setConfig(cfgRes.data);
      setSyncedConfig(cfgRes.data);
      const trimmed = keyDraft.trim();
      if (trimmed) {
        const keyRes = await saveApiKeyAction(token, {
          provider: config.preferred_provider,
          key: trimmed,
          isActive: true,
        });
        if (!keyRes.ok) {
          setError(keyRes.error);
          return;
        }
        setKeyDraft('');
      }
      setFlash(trimmed ? 'Settings and API key saved.' : 'Settings saved.');
      await load({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  const setCfg = <K extends keyof AdminApiConfig>(k: K, v: AdminApiConfig[K]) => {
    setConfig((c) => (c ? { ...c, [k]: v } : c));
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {flash && <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-100">{flash}</div>}

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className={`inline-flex rounded-lg p-2 ${s.iconWrap}`}>
                <Icon size={20} strokeWidth={1.75} />
              </div>
              <p className={`mt-4 text-2xl font-bold tracking-tight ${s.accent}`}>{loading ? '—' : s.value}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted/40 px-6 py-5">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Data Provider Configuration</h3>
            <p className="mt-1 text-sm text-muted-foreground">Configure your market data source</p>
          </div>
          <div className="flex flex-1 flex-col gap-5 p-6">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">Provider</span>
              <select
                disabled={!config || busy}
                value={config?.preferred_provider ?? 'finnhub'}
                onChange={(e) => setCfg('preferred_provider', e.target.value)}
                className={FIELD_STYLE}
              >
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-muted-foreground">Select your market data provider</span>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">API Key</span>
              <input
                type="password"
                disabled={busy}
                placeholder={existingKey ? '•••••••• (replace key)' : 'Paste API key'}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={`${FIELD_STYLE} font-mono`}
              />
              <span className="block text-xs text-muted-foreground">
                {existingKey
                  ? `Stored: ${existingKey.key_fingerprint} · Encrypted at rest`
                  : 'Your provider API key (stored securely). Never returned to the browser.'}
              </span>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">Refresh Interval</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={30}
                  max={86400}
                  disabled={!config || busy}
                  value={config?.refresh_interval_seconds ?? 900}
                  onChange={(e) => setCfg('refresh_interval_seconds', Number(e.target.value) || 900)}
                  className={`${FIELD_STYLE} max-w-[200px]`}
                />
                <span className="text-sm text-muted-foreground">seconds</span>
              </div>
              <span className="block text-xs text-muted-foreground">How often to fetch new market data (Edge schedule + this value for ops)</span>
            </label>

            <div className="mt-1 flex flex-wrap gap-3 border-t border-border/70 pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onTestConnection()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
              >
                <RefreshCw size={16} />
                Test Connection
              </button>
              <button
                type="button"
                disabled={busy || !config}
                onClick={() => void onSaveSettings()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Save size={16} />
                {busy ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted/40 px-6 py-5">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Advanced Settings</h3>
            <p className="mt-1 text-sm text-muted-foreground">Configure advanced data options</p>
          </div>
          <div className="flex flex-1 flex-col gap-4 p-6">
            {[
              ['auto_retry', 'Auto-retry on failure', 'Retry provider calls when a batch step fails', config?.auto_retry] as const,
              ['cache_responses', 'Cache responses', 'Reuse recent provider payloads where safe', config?.cache_responses] as const,
              ['realtime_updates', 'Real-time updates', 'Stream-style updates (reserved for future use)', config?.realtime_updates] as const,
            ].map(([key, title, desc, val]) => (
              <div key={key} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-4 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
                </div>
                <button
                  type="button"
                  disabled={!config || busy}
                  onClick={() => setCfg(key as keyof AdminApiConfig, !val as never)}
                  className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${val ? 'border-emerald-500/30 bg-emerald-500' : 'border-border bg-muted'}`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${val ? 'left-6' : 'left-1'}`}
                  />
                </button>
              </div>
            ))}

            <label className="block space-y-2 pt-1">
              <span className="text-sm font-semibold text-foreground">Rate Limit (requests/minute)</span>
              <input
                type="number"
                min={1}
                max={100000}
                disabled={!config || busy}
                value={config?.rate_limit_rpm ?? 60}
                onChange={(e) => setCfg('rate_limit_rpm', Number(e.target.value) || 60)}
                className={`${FIELD_STYLE} max-w-xs`}
              />
            </label>
          </div>
        </section>
      </div>

      <section className="min-h-0 min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-6 py-5">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Connection Status Log</h3>
            <p className="mt-1 text-sm text-muted-foreground">History of completed collection and import runs</p>
          </div>
          <button type="button" onClick={() => void load({ silent: true })} className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50">
            <RefreshCw size={14} className="inline mr-1" />
            Refresh
          </button>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-0">
            <thead className="text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <tr>
                <th className="border-b border-border bg-muted/50 px-6 py-3">Timestamp</th>
                <th className="border-b border-border bg-muted/50 px-6 py-3">Provider</th>
                <th className="border-b border-border bg-muted/50 px-6 py-3">Status</th>
                <th className="border-b border-border bg-muted/50 px-6 py-3">Updated</th>
                <th className="border-b border-border bg-muted/50 px-6 py-3">Failed</th>
                <th className="border-b border-border bg-muted/50 px-6 py-3">Duration</th>
                <th className="border-b border-border bg-muted/50 px-6 py-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="border-b border-border px-6 py-8 text-sm text-muted-foreground" colSpan={7}>Loading…</td></tr>
              )}
              {!loading && health.filter((r) => !isProgressRow(r.error_message)).length === 0 && (
                <tr><td className="border-b border-border px-6 py-8 text-sm text-muted-foreground" colSpan={7}>No runs yet.</td></tr>
              )}
              {health.filter((r) => !isProgressRow(r.error_message)).map((r) => (
                <tr key={r.id} className="border-b border-border text-sm transition-colors hover:bg-muted/30">
                  <td className="px-6 py-4 text-muted-foreground">{formatDateTime(r.run_at)}</td>
                  <td className="px-6 py-4 font-mono text-xs text-foreground">{r.provider}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                      r.status === 'ok'
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : r.status === 'partial'
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'bg-destructive/10 text-destructive'
                    }`}>{r.status}</span>
                  </td>
                  <td className="px-6 py-4 text-foreground">{fmtInt(r.tickers_updated)}</td>
                  <td className="px-6 py-4 text-foreground">{fmtInt(r.tickers_failed)}</td>
                  <td className="px-6 py-4 text-muted-foreground">{r.duration_ms ? `${r.duration_ms} ms` : '—'}</td>
                  <td className="max-w-[280px] truncate px-6 py-4 text-xs text-muted-foreground" title={r.error_message ?? ''}>
                    {r.error_message ?? r.triggered_by ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
