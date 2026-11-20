'use client';

import { Smartphone, Shield, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  getProfileSettingsAction,
  saveProfileSettingsAction,
  type AdminPreferences,
} from '../../_actions/settings-profile';
import {
  getStoreReviewSettingsAction,
  setStoreReviewLoginEnabledAction,
  type StoreReviewSettings,
} from '../../_actions/users';
import { useAdmin } from '../../_lib/admin-context';
import {
  AdminAlert,
  AdminOutlineButton,
  AdminPrimaryButton,
  adminField,
  adminPageStack,
  adminSurface,
  adminSurfacePad,
} from '../ui/admin-ui';

function formatRoleLabel(role: string): string {
  if (role === 'Admin') return 'Administrator';
  if (role === 'User') return 'User';
  return role || '—';
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function SettingsProfilePage() {
  const { getAccessToken } = useAdmin();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [preferences, setPreferences] = useState<AdminPreferences>({
    email_alerts: true,
    weekly_summary: true,
    system_updates: true,
  });
  const [storeReview, setStoreReview] = useState<StoreReviewSettings | null>(null);
  const [storeReviewBusy, setStoreReviewBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const [res, reviewRes] = await Promise.all([
        getProfileSettingsAction(token),
        getStoreReviewSettingsAction(token),
      ]);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFullName(res.data.fullName);
      setEmail(res.data.email);
      setRole(res.data.role);
      setPreferences(res.data.preferences);
      if (reviewRes.ok) setStoreReview(reviewRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  const toggleStoreReview = useCallback(async () => {
    if (!storeReview || storeReviewBusy) return;
    setStoreReviewBusy(true);
    setError(null);
    setFlash(null);
    try {
      const token = await getAccessToken();
      const res = await setStoreReviewLoginEnabledAction(token, !storeReview.enabled);
      if (res.ok) {
        setStoreReview(res.data);
        setFlash(
          res.data.enabled
            ? 'Store review sign-in enabled.'
            : 'Store review sign-in disabled.'
        );
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update store review setting.');
    } finally {
      setStoreReviewBusy(false);
    }
  }, [getAccessToken, storeReview, storeReviewBusy]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (opts?: { includePassword?: boolean }) => {
      if (loading) return;
      setSaving(true);
      setError(null);
      setFlash(null);
      try {
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
        setPreferences(res.data.preferences);
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
      preferences,
      newPassword,
      confirmNewPassword,
      currentPassword,
    ]
  );

  return (
    <div className={adminPageStack}>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Account, security, and review access.
      </p>
      {error && <AdminAlert>{error}</AdminAlert>}
      {flash && <AdminAlert tone="success">{flash}</AdminAlert>}

      <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
        <section className={`${adminSurface} min-w-0`}>
          <div className="flex items-center gap-2.5 border-b border-black/6 px-5 py-4 sm:px-6">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User size={15} strokeWidth={1.75} />
            </div>
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Profile</h3>
          </div>
          <div className={`space-y-5 ${adminSurfacePad}`}>
            <label className="block space-y-2">
              <span className="block text-sm font-medium text-foreground">Full name</span>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading || saving}
                autoComplete="name"
                className={`${adminField} max-w-md`}
              />
            </label>
            <label className="block space-y-2">
              <span className="block text-sm font-medium text-foreground">Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading || saving}
                autoComplete="email"
                type="email"
                className={`${adminField} max-w-md`}
              />
            </label>
            <div className="space-y-2">
              <span className="block text-sm font-medium text-foreground">Role</span>
              <div className="inline-flex rounded-full border border-black/8 bg-muted/50 px-3 py-1 text-sm text-muted-foreground">
                {formatRoleLabel(role)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <AdminPrimaryButton onClick={() => void save()} disabled={loading || saving}>
                {saving ? 'Saving…' : 'Save profile'}
              </AdminPrimaryButton>
            </div>
          </div>
        </section>

        <section className={`${adminSurface} min-w-0`}>
          <div className="flex items-center gap-2.5 border-b border-black/6 px-5 py-4 sm:px-6">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Shield size={15} strokeWidth={1.75} />
            </div>
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Security</h3>
          </div>
          <div className={`space-y-5 ${adminSurfacePad}`}>
            <label className="block space-y-2">
              <span className="block text-sm font-medium text-foreground">Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Required to change password"
                disabled={loading || saving}
                autoComplete="current-password"
                className={`${adminField} max-w-md`}
              />
            </label>
            <label className="block space-y-2">
              <span className="block text-sm font-medium text-foreground">New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                disabled={loading || saving}
                autoComplete="new-password"
                className={`${adminField} max-w-md`}
              />
            </label>
            <label className="block space-y-2">
              <span className="block text-sm font-medium text-foreground">Confirm new password</span>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Re-enter new password"
                disabled={loading || saving}
                autoComplete="new-password"
                className={`${adminField} max-w-md`}
              />
            </label>
            <AdminOutlineButton onClick={() => void save({ includePassword: true })} disabled={loading || saving}>
              {saving ? 'Updating…' : 'Update password'}
            </AdminOutlineButton>
          </div>
        </section>

        <section className={`${adminSurface} min-w-0`}>
          <div className="flex items-center gap-2.5 border-b border-black/6 px-5 py-4 sm:px-6">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Smartphone size={15} strokeWidth={1.75} />
            </div>
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Store review</h3>
          </div>
          <div className={`space-y-4 ${adminSurfacePad}`}>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Instant mobile login for Apple / Google review accounts. Turn off after review so those emails
              cannot bypass the allowlist.
            </p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {(storeReview?.emails ?? [
                'weeklystockapple@icloud.com',
                'weeklystockgoogle@gmail.com',
              ]).map((addr) => (
                <li key={addr} className="font-mono">
                  {addr}
                </li>
              ))}
            </ul>
            {storeReview?.updatedAt && (
              <p className="text-[11px] text-muted-foreground">
                Last changed {formatDate(storeReview.updatedAt)}
                {storeReview.updatedBy ? ` · ${storeReview.updatedBy}` : ''}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {storeReview?.enabled ? (
                <AdminPrimaryButton
                  role="switch"
                  aria-checked
                  disabled={storeReviewBusy || loading || storeReview == null}
                  onClick={() => void toggleStoreReview()}
                >
                  {storeReviewBusy ? 'Saving…' : 'Enabled — tap to turn off'}
                </AdminPrimaryButton>
              ) : (
                <AdminOutlineButton
                  role="switch"
                  aria-checked={false}
                  disabled={storeReviewBusy || loading || storeReview == null}
                  onClick={() => void toggleStoreReview()}
                >
                  {storeReviewBusy ? 'Saving…' : 'Disabled — tap to turn on'}
                </AdminOutlineButton>
              )}
              <p className="text-xs text-muted-foreground sm:text-right">
                {storeReview?.enabled
                  ? 'Reviewers can sign in instantly on mobile'
                  : 'Review emails require allowlist + magic link'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
