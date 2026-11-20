'use client';

import { RefreshCw, Save } from 'lucide-react';
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
import {
  AdminAlert,
  AdminGhostButton,
  AdminKpi,
  AdminOutlineButton,
  AdminPrimaryButton,
  adminField,
  adminPageStack,
  adminSelect,
  adminSurface,
  adminSurfacePad,
  adminTd,
  adminTh,
} from '../ui/admin-ui';

const PROVIDER_OPTIONS = [
  { id: 'finnhub', label: 'Finnhub' },
  { id: 'twelve_data', label: 'Twelve Data' },
  { id: 'fmp', label: 'Financial Modeling Prep (FMP)' },
  { id: 'alpha_vantage', label: 'Alpha Vantage' },
  { id: 'polygon', label: 'Polygon.io' },
  { id: 'yahoo', label: 'Yahoo Finance (free, no key needed)' },
] as const;

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

const API_SETTINGS_REALTIME = [
  { schema: 'public', table: 'api_health_log' },
  { schema: 'public', table: 'api_keys' },
  { schema: 'public', table: 'admin_api_config' },
] as const;

export default function APISettings({ dataActive = true }: { dataActive?: boolean }) {
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
    enabled: dataActive,
    channelName: 'admin-api-settings-live',
    getAccessToken,
    refresh: () => void load({ silent: true }),
    pollingMs: 60_000,
    throttleMs: 8_000,
    realtime: [...API_SETTINGS_REALTIME],
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
    return [
      { label: 'API Status', value: status, sub: 'Current pipeline health' },
      { label: 'Avg Response Time', value: avg, sub: 'Mean job duration (24h)' },
      { label: 'Requests Today', value: activity, sub: 'Ticker rows touched (24h)' },
      { label: 'Success Rate', value: rate, sub: 'OK runs / total runs (24h)' },
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
    <div className={adminPageStack}>
      {error && <AdminAlert>{error}</AdminAlert>}
      {flash && <AdminAlert tone="success">{flash}</AdminAlert>}

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((s) => (
          <AdminKpi key={s.label} label={s.label} value={loading ? '—' : s.value} hint={s.sub} />
        ))}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-2">
        <section className={`${adminSurface} flex min-h-0 min-w-0 flex-col`}>
          <div className="border-b border-border/80 px-5 py-4 sm:px-6">
            <h3 className="text-base font-semibold tracking-tight text-foreground">Data Provider Configuration</h3>
            <p className="mt-1 text-sm text-muted-foreground">Configure your market data source</p>
          </div>
          <div className={`flex flex-1 flex-col gap-5 ${adminSurfacePad}`}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Provider</span>
              <select
                disabled={!config || busy}
                value={config?.preferred_provider ?? 'finnhub'}
                onChange={(e) => setCfg('preferred_provider', e.target.value)}
                className={adminSelect}
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
                className={`${adminField} font-mono`}
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
                  className={`${adminField} max-w-50`}
                />
                <span className="text-sm text-muted-foreground">seconds</span>
              </div>
              <span className="block text-xs text-muted-foreground">How often to fetch new market data (Edge schedule + this value for ops)</span>
            </label>

            <div className="mt-1 flex flex-wrap gap-3 border-t border-border/70 pt-4">
              <AdminOutlineButton icon={RefreshCw} disabled={busy} onClick={() => void onTestConnection()}>
                Test Connection
              </AdminOutlineButton>
              <AdminPrimaryButton icon={Save} disabled={busy || !config} onClick={() => void onSaveSettings()}>
                {busy ? 'Saving…' : 'Save Settings'}
              </AdminPrimaryButton>
            </div>
          </div>
        </section>

        <section className={`${adminSurface} flex min-h-0 min-w-0 flex-col`}>
          <div className="border-b border-border/80 px-5 py-4 sm:px-6">
            <h3 className="text-base font-semibold tracking-tight text-foreground">Advanced Settings</h3>
            <p className="mt-1 text-sm text-muted-foreground">Configure advanced data options</p>
          </div>
          <div className={`flex flex-1 flex-col gap-4 ${adminSurfacePad}`}>
            {[
              ['auto_retry', 'Auto-retry on failure', 'Retry provider calls when a batch step fails', config?.auto_retry] as const,
              ['cache_responses', 'Cache responses', 'Reuse recent provider payloads where safe', config?.cache_responses] as const,
              ['realtime_updates', 'Real-time updates', 'Stream-style updates (reserved for future use)', config?.realtime_updates] as const,
            ].map(([key, title, desc, val]) => (
              <div key={key} className="flex items-center justify-between gap-4 rounded-xl border border-border/80 px-4 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
                </div>
                <button
                  type="button"
                  disabled={!config || busy}
                  onClick={() => setCfg(key as keyof AdminApiConfig, !val as never)}
                  className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${val ? 'border-primary/30 bg-primary' : 'border-border bg-muted'}`}
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
                className={`${adminField} max-w-xs`}
              />
            </label>
          </div>
        </section>
      </div>

      <section className={`${adminSurface} min-h-0 min-w-0`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">Connection Status Log</h3>
            <p className="mt-1 text-sm text-muted-foreground">History of completed collection and import runs</p>
          </div>
          <AdminGhostButton icon={RefreshCw} onClick={() => void load({ silent: true })}>
            Refresh
          </AdminGhostButton>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-180 border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={adminTh}>Timestamp</th>
                <th className={adminTh}>Provider</th>
                <th className={adminTh}>Status</th>
                <th className={adminTh}>Updated</th>
                <th className={adminTh}>Failed</th>
                <th className={adminTh}>Duration</th>
                <th className={adminTh}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className={`${adminTd} py-8 text-muted-foreground`} colSpan={7}>Loading…</td></tr>
              )}
              {!loading && health.filter((r) => !isProgressRow(r.error_message)).length === 0 && (
                <tr><td className={`${adminTd} py-8 text-muted-foreground`} colSpan={7}>No runs yet.</td></tr>
              )}
              {health.filter((r) => !isProgressRow(r.error_message)).map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-muted/30">
                  <td className={`${adminTd} text-muted-foreground`}>{formatDateTime(r.run_at)}</td>
                  <td className={`${adminTd} font-mono text-xs`}>{r.provider}</td>
                  <td className={adminTd}>
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                      r.status === 'ok'
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : r.status === 'partial'
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'bg-destructive/10 text-destructive'
                    }`}>{r.status}</span>
                  </td>
                  <td className={adminTd}>{fmtInt(r.tickers_updated)}</td>
                  <td className={adminTd}>{fmtInt(r.tickers_failed)}</td>
                  <td className={`${adminTd} text-muted-foreground`}>{r.duration_ms ? `${r.duration_ms} ms` : '—'}</td>
                  <td className={`${adminTd} max-w-70 truncate text-xs text-muted-foreground`} title={r.error_message ?? ''}>
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
