'use client';

import { Bell, Shield, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getProfileSettingsAction, saveProfileSettingsAction } from '../../_actions/settings-profile';
import { useAdmin } from '../../_lib/admin-context';

export default function SettingsProfilePage() {
  const { getAccessToken } = useAdmin();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Administrator');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
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
      setTwoFactorEnabled(res.data.preferences.two_factor_enabled);
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
    load();
  }, [load]);

  const save = useCallback(
    async (opts?: { includePassword?: boolean }) => {
      if (loading) return;
      setSaving(true);
      setError(null);
      setFlash(null);
      try {
        const token = await getAccessToken();
        const res = await saveProfileSettingsAction(token, {
          fullName,
          email,
          preferences: {
            two_factor_enabled: twoFactorEnabled,
            email_alerts: emailAlerts,
            weekly_summary: weeklySummary,
            system_updates: systemUpdates,
          },
          newPassword: opts?.includePassword ? newPassword : undefined,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setFullName(res.data.fullName);
        setEmail(res.data.email);
        setRole(res.data.role);
        if (opts?.includePassword) {
          setCurrentPassword('');
          setNewPassword('');
        }
        setFlash('Settings saved.');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error.');
      } finally {
        setSaving(false);
      }
    },
    [loading, getAccessToken, fullName, email, twoFactorEnabled, emailAlerts, weeklySummary, systemUpdates, newPassword]
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <p className="admin-text-muted max-w-2xl text-sm">
        Manage your account settings and preferences.
      </p>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {flash && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{flash}</div>}

      <div className="flex min-w-0 flex-col gap-6">
        <section className="admin-card min-w-0 overflow-hidden rounded-2xl shadow-sm">
          <div className="admin-border flex items-center gap-3 border-b px-6 py-4">
            <User size={16} className="text-green-700" />
            <h3 className="admin-text-main text-lg font-semibold">Profile Settings</h3>
          </div>
          <div className="space-y-6 p-6">
            <label className="block space-y-2">
              <span className="admin-text-main block text-sm font-semibold leading-none">Full Name</span>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={() => void save()}
                disabled={loading || saving}
                className="admin-border h-10 w-full max-w-md rounded-lg border px-3 text-sm"
              />
            </label>
            <label className="block space-y-2">
              <span className="admin-text-main block text-sm font-semibold leading-none">Email Address</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => void save()}
                disabled={loading || saving}
                className="admin-border h-10 w-full max-w-md rounded-lg border px-3 text-sm"
              />
            </label>
            <div className="space-y-2">
              <span className="admin-text-main block text-sm font-semibold leading-none">Role</span>
              <div className="inline-flex rounded-md bg-slate-100 px-3 py-1 text-sm text-slate-600">{role}</div>
            </div>
          </div>
        </section>

        <section className="admin-card min-w-0 overflow-hidden rounded-2xl shadow-sm">
          <div className="admin-border flex items-center gap-3 border-b px-6 py-4">
            <Shield size={16} className="text-green-700" />
            <h3 className="admin-text-main text-lg font-semibold">Security</h3>
          </div>
          <div className="space-y-6 p-6">
            <label className="block space-y-2">
              <span className="admin-text-main block text-sm font-semibold leading-none">Current Password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                disabled={loading || saving}
                className="admin-border h-10 w-full max-w-md rounded-lg border px-3 text-sm"
              />
            </label>
            <label className="block space-y-2">
              <span className="admin-text-main block text-sm font-semibold leading-none">New Password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onBlur={() => {
                  if (newPassword.trim()) void save({ includePassword: true });
                }}
                placeholder="Enter new password"
                disabled={loading || saving}
                className="admin-border h-10 w-full max-w-md rounded-lg border px-3 text-sm"
              />
            </label>
            <div className="flex max-w-md flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="admin-text-main text-sm font-semibold">Two-Factor Authentication</p>
                <p className="admin-text-muted mt-1 text-sm">Add an extra layer of security to your account</p>
              </div>
              <button
                onClick={() => {
                  setTwoFactorEnabled((v) => !v);
                  setTimeout(() => {
                    void save();
                  }, 0);
                }}
                disabled={loading || saving}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${twoFactorEnabled ? 'bg-green-700' : 'bg-slate-200'}`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${twoFactorEnabled ? 'left-7' : 'left-1'}`}
                />
              </button>
            </div>
          </div>
        </section>

        <section className="admin-card min-w-0 overflow-hidden rounded-2xl shadow-sm">
          <div className="admin-border flex items-center gap-3 border-b px-6 py-4">
            <Bell size={16} className="text-green-700" />
            <h3 className="admin-text-main text-lg font-semibold">Notifications</h3>
          </div>
          <div className="space-y-4 p-6">
            {[
              ['Email Alerts', 'Receive important account and security alerts', emailAlerts, setEmailAlerts],
              ['Weekly Summary', 'Get weekly admin activity summary', weeklySummary, setWeeklySummary],
              ['System Updates', 'Notify me when major updates are released', systemUpdates, setSystemUpdates],
            ].map(([title, desc, value, setter]) => (
              <div key={title as string} className="admin-border-soft flex items-center justify-between gap-4 rounded-lg border px-4 py-4">
                <div>
                  <p className="admin-text-main text-sm font-semibold">{title as string}</p>
                  <p className="admin-text-muted text-xs">{desc as string}</p>
                </div>
                <button
                  onClick={() => {
                    (setter as Dispatch<SetStateAction<boolean>>)(!(value as boolean));
                    setTimeout(() => {
                      void save();
                    }, 0);
                  }}
                  disabled={loading || saving}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${(value as boolean) ? 'bg-green-700' : 'bg-slate-200'}`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${(value as boolean) ? 'left-7' : 'left-1'}`}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

