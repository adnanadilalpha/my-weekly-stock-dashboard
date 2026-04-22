'use client';

import { CheckCircle2, RefreshCw, Save, Zap, Activity } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

export default function APISettings() {
  const { getAccessToken } = useAdmin();
  const [keys, setKeys] = useState<ApiKeyMetadata[]>([]);
  const [health, setHealth] = useState<ApiHealthRow[]>([]);
  const [metrics, setMetrics] = useState<ApiDashboardMetrics | null>(null);
  const [config, setConfig] = useState<AdminApiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
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
      if (cfgRes.ok) setConfig(cfgRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    load();
  }, [load]);

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
        accent: statusGreen ? 'text-green-700' : m?.statusLabel === 'Degraded' ? 'text-amber-700' : 'text-slate-600',
        iconWrap: statusGreen ? 'bg-green-700/10 text-green-700' : 'bg-slate-100 text-slate-600',
      },
      {
        label: 'Avg Response Time',
        value: avg,
        sub: 'Mean job duration (24h)',
        icon: Zap,
        accent: 'text-amber-700',
        iconWrap: 'bg-amber-500/10 text-amber-700',
      },
      {
        label: 'Requests Today',
        value: activity,
        sub: 'Ticker rows touched (24h)',
        icon: Activity,
        accent: 'text-violet-700',
        iconWrap: 'bg-violet-500/10 text-violet-700',
      },
      {
        label: 'Success Rate',
        value: rate,
        sub: 'OK runs / total runs (24h)',
        icon: CheckCircle2,
        accent: 'text-green-700',
        iconWrap: 'bg-green-700/10 text-green-700',
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
      await load();
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
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {flash && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{flash}</div>}

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="admin-card min-w-0 rounded-2xl p-6 shadow-sm">
              <div className={`inline-flex rounded-lg p-2 ${s.iconWrap}`}>
                <Icon size={20} strokeWidth={1.75} />
              </div>
              <p className={`mt-4 text-2xl font-bold tracking-tight ${s.accent}`}>{loading ? '—' : s.value}</p>
              <p className="admin-text-main mt-1 text-sm font-semibold">{s.label}</p>
              <p className="admin-text-muted text-xs">{s.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="admin-card flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl shadow-sm">
          <div className="admin-border border-b px-6 py-5">
            <h3 className="admin-text-main text-lg font-semibold">Data Provider Configuration</h3>
            <p className="admin-text-muted mt-1 text-sm">Configure your market data source</p>
          </div>
          <div className="flex flex-1 flex-col gap-4 p-6">
            <label className="block">
              <span className="admin-text-main text-sm font-semibold">Provider</span>
              <select
                disabled={!config || busy}
                value={config?.preferred_provider ?? 'finnhub'}
                onChange={(e) => setCfg('preferred_provider', e.target.value)}
                className="admin-border mt-2 w-full rounded-lg border px-3 py-2 text-sm"
              >
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <span className="admin-text-muted mt-1 block text-xs">Select your market data provider</span>
            </label>

            <label className="block">
              <span className="admin-text-main text-sm font-semibold">API Key</span>
              <input
                type="password"
                disabled={busy}
                placeholder={existingKey ? '•••••••• (replace key)' : 'Paste API key'}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="admin-border mt-2 w-full rounded-lg border px-3 py-2 font-mono text-sm"
              />
              <span className="admin-text-muted mt-1 block text-xs">
                {existingKey
                  ? `Stored: ${existingKey.key_fingerprint} · Encrypted at rest`
                  : 'Your provider API key (stored securely). Never returned to the browser.'}
              </span>
            </label>

            <label className="block">
              <span className="admin-text-main text-sm font-semibold">Refresh Interval</span>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={30}
                  max={86400}
                  disabled={!config || busy}
                  value={config?.refresh_interval_seconds ?? 900}
                  onChange={(e) => setCfg('refresh_interval_seconds', Number(e.target.value) || 900)}
                  className="admin-border w-full max-w-[200px] rounded-lg border px-3 py-2 text-sm"
                />
                <span className="admin-text-muted text-sm">seconds</span>
              </div>
              <span className="admin-text-muted mt-1 block text-xs">How often to fetch new market data (Edge schedule + this value for ops)</span>
            </label>

            <div className="mt-2 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onTestConnection()}
                className="admin-border admin-text-muted inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
              >
                <RefreshCw size={16} />
                Test Connection
              </button>
              <button
                type="button"
                disabled={busy || !config}
                onClick={() => void onSaveSettings()}
                className="admin-green-bg inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Save size={16} />
                {busy ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        </section>

        <section className="admin-card flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl shadow-sm">
          <div className="admin-border border-b px-6 py-5">
            <h3 className="admin-text-main text-lg font-semibold">Advanced Settings</h3>
            <p className="admin-text-muted mt-1 text-sm">Configure advanced data options</p>
          </div>
          <div className="flex flex-1 flex-col gap-4 p-6">
            {[
              ['auto_retry', 'Auto-retry on failure', 'Retry provider calls when a batch step fails', config?.auto_retry] as const,
              ['cache_responses', 'Cache responses', 'Reuse recent provider payloads where safe', config?.cache_responses] as const,
              ['realtime_updates', 'Real-time updates', 'Stream-style updates (reserved for future use)', config?.realtime_updates] as const,
            ].map(([key, title, desc, val]) => (
              <div key={key} className="admin-border-soft flex items-center justify-between gap-4 rounded-lg border px-4 py-4">
                <div className="min-w-0">
                  <p className="admin-text-main text-sm font-semibold">{title}</p>
                  <p className="admin-text-muted mt-1 text-xs">{desc}</p>
                </div>
                <button
                  type="button"
                  disabled={!config || busy}
                  onClick={() => setCfg(key as keyof AdminApiConfig, !val as never)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${val ? 'bg-green-700' : 'bg-slate-200'}`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${val ? 'left-7' : 'left-1'}`}
                  />
                </button>
              </div>
            ))}

            <label className="block pt-2">
              <span className="admin-text-main text-sm font-semibold">Rate Limit (requests/minute)</span>
              <input
                type="number"
                min={1}
                max={100000}
                disabled={!config || busy}
                value={config?.rate_limit_rpm ?? 60}
                onChange={(e) => setCfg('rate_limit_rpm', Number(e.target.value) || 60)}
                className="admin-border mt-2 w-full max-w-xs rounded-lg border px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>
      </div>

      <section className="admin-card min-h-0 min-w-0 overflow-hidden rounded-2xl shadow-sm">
        <div className="admin-border flex flex-wrap items-center justify-between gap-3 border-b px-6 py-5">
          <div>
            <h3 className="admin-text-main text-lg font-semibold">Connection Status Log</h3>
            <p className="admin-text-muted mt-1 text-sm">History of completed collection and import runs</p>
          </div>
          <button type="button" onClick={() => void load()} className="admin-text-muted rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
            <RefreshCw size={14} className="inline mr-1" />
            Refresh
          </button>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="admin-navy text-left text-xs font-semibold uppercase tracking-wide text-white/90">
              <tr>
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">Provider</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Updated</th>
                <th className="px-6 py-3">Failed</th>
                <th className="px-6 py-3">Duration</th>
                <th className="px-6 py-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="px-6 py-8 text-sm admin-text-muted" colSpan={7}>Loading…</td></tr>
              )}
              {!loading && health.filter((r) => !isProgressRow(r.error_message)).length === 0 && (
                <tr><td className="px-6 py-8 text-sm admin-text-muted" colSpan={7}>No runs yet.</td></tr>
              )}
              {health.filter((r) => !isProgressRow(r.error_message)).map((r) => (
                <tr key={r.id} className="admin-border-soft border-t text-sm">
                  <td className="admin-text-muted px-6 py-4">{formatDateTime(r.run_at)}</td>
                  <td className="admin-text-main px-6 py-4 font-mono text-xs">{r.provider}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                      r.status === 'ok' ? 'admin-green bg-green-700/10' : r.status === 'partial' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'
                    }`}>{r.status}</span>
                  </td>
                  <td className="admin-text-main px-6 py-4">{fmtInt(r.tickers_updated)}</td>
                  <td className="admin-text-main px-6 py-4">{fmtInt(r.tickers_failed)}</td>
                  <td className="admin-text-muted px-6 py-4">{r.duration_ms ? `${r.duration_ms} ms` : '—'}</td>
                  <td className="admin-text-muted max-w-[280px] truncate px-6 py-4 text-xs" title={r.error_message ?? ''}>
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
