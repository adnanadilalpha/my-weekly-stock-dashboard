'use client';

import { Bell, Shield, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  getProfileSettingsAction,
  saveProfileSettingsAction,
  type AdminPreferences,
} from '../../_actions/settings-profile';
import { useAdmin } from '../../_lib/admin-context';

const FIELD_STYLE =
  'block h-10 w-full max-w-md rounded-lg border border-input bg-input-background px-3 text-sm text-foreground shadow-sm outline-none ring-offset-background transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30 dark:scheme-dark';

function formatRoleLabel(role: string): string {
  if (role === 'Admin') return 'Administrator';
  if (role === 'User') return 'User';
  return role || '—';
}

export default function SettingsProfilePage() {
  const { getAccessToken } = useAdmin();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(true);
  const [systemUpdates, setSystemUpdates] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await getProfileSettingsAction(token);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFullName(res.data.fullName);
      setEmail(res.data.email);
      setRole(res.data.role);
      setEmailAlerts(res.data.preferences.email_alerts);
      setWeeklySummary(res.data.preferences.weekly_summary);
      setSystemUpdates(res.data.preferences.system_updates);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (opts?: {
      includePassword?: boolean;
      preferencesPayload?: AdminPreferences;
    }) => {
      if (loading) return;
      setSaving(true);
      setError(null);
      setFlash(null);
      try {
        const preferences: AdminPreferences =
          opts?.preferencesPayload ?? {
            email_alerts: emailAlerts,
            weekly_summary: weeklySummary,
            system_updates: systemUpdates,
          };

        if (opts?.includePassword) {
          if (!newPassword.trim()) {
            setError('Enter a new password.');
            return;
          }
          if (newPassword !== confirmNewPassword) {
            setError('New passwords do not match.');
            return;
          }
          if (!currentPassword.trim()) {
            setError('Enter your current password.');
            return;
          }
        }

        const token = await getAccessToken();
        const res = await saveProfileSettingsAction(token, {
          fullName,
          email,
          preferences,
          newPassword: opts?.includePassword ? newPassword : undefined,
          currentPassword: opts?.includePassword ? currentPassword : undefined,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setFullName(res.data.fullName);
        setEmail(res.data.email);
        setRole(res.data.role);
        setEmailAlerts(res.data.preferences.email_alerts);
        setWeeklySummary(res.data.preferences.weekly_summary);
        setSystemUpdates(res.data.preferences.system_updates);
        if (opts?.includePassword) {
          setCurrentPassword('');
          setNewPassword('');
          setConfirmNewPassword('');
        }
        setFlash(opts?.includePassword ? 'Password updated.' : 'Settings saved.');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error.');
      } finally {
        setSaving(false);
      }
    },
    [
      loading,
      getAccessToken,
      fullName,
      email,
      emailAlerts,
      weeklySummary,
      systemUpdates,
      newPassword,
      confirmNewPassword,
      currentPassword,
    ]
  );

  const saveProfile = () => void save();

  const savePassword = () => void save({ includePassword: true });

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Manage your account settings and preferences.
      </p>
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}
      {flash && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-100">
          {flash}
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-6">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-6 py-4">
            <User size={16} className="text-emerald-700 dark:text-emerald-400" />
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Profile Settings</h3>
          </div>
          <div className="space-y-6 p-6">
            <label className="block space-y-2">
              <span className="block text-sm font-semibold leading-none text-foreground">Full Name</span>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading || saving}
                autoComplete="name"
                className={FIELD_STYLE}
              />
            </label>
            <label className="block space-y-2">
              <span className="block text-sm font-semibold leading-none text-foreground">Email Address</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading || saving}
                autoComplete="email"
                type="email"
                className={FIELD_STYLE}
              />
            </label>
            <div className="space-y-2">
              <span className="block text-sm font-semibold leading-none text-foreground">Role</span>
              <div className="inline-flex rounded-md border border-border bg-muted px-3 py-1 text-sm text-muted-foreground">
                {formatRoleLabel(role)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={saveProfile}
                disabled={loading || saving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-6 py-4">
            <Shield size={16} className="text-emerald-700 dark:text-emerald-400" />
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Security</h3>
          </div>
          <div className="space-y-6 p-6">
            <label className="block space-y-2">
              <span className="block text-sm font-semibold leading-none text-foreground">Current Password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Required to change password"
                disabled={loading || saving}
                autoComplete="current-password"
                className={FIELD_STYLE}
              />
            </label>
            <label className="block space-y-2">
              <span className="block text-sm font-semibold leading-none text-foreground">New Password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                disabled={loading || saving}
                autoComplete="new-password"
                className={FIELD_STYLE}
              />
            </label>
            <label className="block space-y-2">
              <span className="block text-sm font-semibold leading-none text-foreground">Confirm New Password</span>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Re-enter new password"
                disabled={loading || saving}
                autoComplete="new-password"
                className={FIELD_STYLE}
              />
            </label>
            <button
              type="button"
              onClick={savePassword}
              disabled={loading || saving}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
            >
              {saving ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-6 py-4">
            <Bell size={16} className="text-emerald-700 dark:text-emerald-400" />
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Notifications</h3>
          </div>
          <div className="space-y-4 p-6">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Email Alerts</p>
                <p className="text-xs text-muted-foreground">
                  In-app feed for sign-ins, new allowlist users, and pipeline events (email delivery can use this flag
                  later).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !emailAlerts;
                  setEmailAlerts(next);
                  void save({
                    preferencesPayload: {
                      email_alerts: next,
                      weekly_summary: weeklySummary,
                      system_updates: systemUpdates,
                    },
                  });
                }}
                disabled={loading || saving}
                className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${emailAlerts ? 'border-emerald-500/30 bg-emerald-500' : 'border-border bg-muted'}`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${emailAlerts ? 'left-6' : 'left-1'}`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Weekly Summary</p>
                <p className="text-xs text-muted-foreground">Get weekly admin activity summary</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !weeklySummary;
                  setWeeklySummary(next);
                  void save({
                    preferencesPayload: {
                      email_alerts: emailAlerts,
                      weekly_summary: next,
                      system_updates: systemUpdates,
                    },
                  });
                }}
                disabled={loading || saving}
                className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${weeklySummary ? 'border-emerald-500/30 bg-emerald-500' : 'border-border bg-muted'}`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${weeklySummary ? 'left-6' : 'left-1'}`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground">System Updates</p>
                <p className="text-xs text-muted-foreground">Notify me when major updates are released</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !systemUpdates;
                  setSystemUpdates(next);
                  void save({
                    preferencesPayload: {
                      email_alerts: emailAlerts,
                      weekly_summary: weeklySummary,
                      system_updates: next,
                    },
                  });
                }}
                disabled={loading || saving}
                className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${systemUpdates ? 'border-emerald-500/30 bg-emerald-500' : 'border-border bg-muted'}`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${systemUpdates ? 'left-6' : 'left-1'}`}
                />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
