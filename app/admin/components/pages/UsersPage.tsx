'use client';

import { Edit2, KeyRound, ListChecks, RefreshCw, Shield, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdminAlert,
  AdminGhostButton,
  AdminIconButton,
  AdminKpi,
  AdminOutlineButton,
  AdminPageHeader,
  AdminSearchInput,
  adminPageStack,
  adminSelect,
  adminSurface,
  adminTd,
  adminTh,
} from '../ui/admin-ui';
import {
  createAdminWithPasswordAction,
  deleteUserAction,
  listUsersAction,
  updateAuthorizedUserPasswordAction,
  updateUserRoleAction,
  type AdminUserRow,
  type UserStats,
} from '../../_actions/users';
import { useAdmin } from '../../_lib/admin-context';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import { useLiveAdminRefresh } from '../../_lib/use-live-admin-refresh';
import ReconcileSubscribersModal from './ReconcileSubscribersModal';

const PAGE_SIZE = 50;

type Role = 'Admin' | 'User';
type RoleFilter = 'all' | 'admin' | 'user';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return iso;
  }
}

const USERS_REALTIME = [{ schema: 'public', table: 'authorized_users' }] as const;

export default function UsersPage({ dataActive = true }: { dataActive?: boolean }) {
  const { admin, getAccessToken } = useAdmin();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const liveSearch = searchQuery.trim();
  const debouncedSearch = useDebouncedValue(liveSearch, 150);
  const isSearchPending = liveSearch !== debouncedSearch;
  const searchBusy = isSearchPending || (loading && Boolean(liveSearch));
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [passwordUser, setPasswordUser] = useState<AdminUserRow | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<AdminUserRow | null>(null);
  const [busy, setBusy] = useState(false);

  const listKey = `${debouncedSearch}|${roleFilter}`;
  const lastListKeyRef = useRef<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await listUsersAction(token, {
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch,
        roleFilter,
      });
      if (res.ok) {
        setUsers(res.data.users);
        setStats(res.data.stats);
        setTotalCount(res.data.totalCount);
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [getAccessToken, page, debouncedSearch, roleFilter]);

  useEffect(() => {
    if (lastListKeyRef.current !== listKey) {
      lastListKeyRef.current = listKey;
      if (page !== 0) {
        setPage(0);
        return;
      }
    }
    void load();
  }, [load, listKey, page]);

  useLiveAdminRefresh({
    enabled: dataActive,
    channelName: 'admin-users-live',
    getAccessToken,
    refresh: () => void load({ silent: true }),
    pollingMs: 60_000,
    throttleMs: 8_000,
    realtime: [...USERS_REALTIME],
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = page + 1 < totalPages;

  const visibleUsers = (() => {
    if (!liveSearch) return users;
    if (isSearchPending || loading) {
      const q = liveSearch.toLowerCase();
      return users.filter((u) => u.email.toLowerCase().includes(q));
    }
    return users;
  })();

  const statCards = [
    { label: 'Total Users', value: stats?.total ?? 0 },
    { label: 'Admins', value: stats?.admins ?? 0 },
    { label: 'Added This Week', value: stats?.addedThisWeek ?? 0 },
  ];

  return (
    <div className={adminPageStack}>
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
        {statCards.map((s) => (
          <AdminKpi key={s.label} label={s.label} value={loading ? '—' : s.value} />
        ))}
      </div>

      <div className={`${adminSurface} min-h-0 min-w-0 flex-1`}>
        <div className="flex flex-col gap-4 px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
          <AdminPageHeader
            title="User List"
            description="Only listed emails can log in via magic link."
            actions={
              <>
                <AdminOutlineButton icon={ListChecks} onClick={() => setShowReconcileModal(true)}>
                  Subscribers
                </AdminOutlineButton>
                <AdminGhostButton icon={Shield} onClick={() => setShowAdminModal(true)}>
                  Add Admin
                </AdminGhostButton>
              </>
            }
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <AdminSearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by email…"
              busy={searchBusy}
              hint={
                liveSearch && !searchBusy
                  ? totalCount === 0
                    ? 'No matches'
                    : `${totalCount.toLocaleString()} match${totalCount === 1 ? '' : 'es'}`
                  : null
              }
              onClear={() => setSearchQuery('')}
            />
            <div className="flex items-center gap-2">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                className={`${adminSelect} sm:w-40`}
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="user">User</option>
              </select>
              <AdminGhostButton icon={RefreshCw} onClick={() => void load()}>
                Refresh
              </AdminGhostButton>
            </div>
          </div>
        </div>

        {error && (
          <div className="px-4 pb-4 sm:px-6">
            <AdminAlert tone="error">{error}</AdminAlert>
          </div>
        )}

        <div className="hidden min-w-0 overflow-x-auto md:block">
          <table className="w-full min-w-195 border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left">
                <th className={adminTh}>Email</th>
                <th className={adminTh}>Role</th>
                <th className={adminTh}>Joined</th>
                <th className={adminTh}>Updated</th>
                <th className={adminTh}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && !liveSearch && users.length === 0 && (
                <tr>
                  <td className={`${adminTd} py-8 text-muted-foreground`} colSpan={5}>
                    Loading…
                  </td>
                </tr>
              )}
              {searchBusy && visibleUsers.length === 0 && (
                <tr>
                  <td className={`${adminTd} py-8 text-muted-foreground`} colSpan={5}>
                    Searching…
                  </td>
                </tr>
              )}
              {!searchBusy && !loading && visibleUsers.length === 0 && (
                <tr>
                  <td className={`${adminTd} py-8 text-muted-foreground`} colSpan={5}>
                    {liveSearch ? 'No matches.' : 'No users match.'}
                  </td>
                </tr>
              )}
              {visibleUsers.map((u) => {
                const isSelf = u.email.toLowerCase() === admin?.email;
                return (
                  <tr key={u.id} className="transition-colors hover:bg-muted/30">
                    <td className={adminTd}>
                      <div className="font-medium text-foreground">{u.email}</div>
                      {isSelf && <div className="text-xs text-muted-foreground">(you)</div>}
                    </td>
                    <td className={adminTd}>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                          u.role === 'Admin'
                            ? 'border border-emerald-500/25 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                            : 'border border-border bg-muted/60 text-muted-foreground'
                        }`}
                      >
                        <Shield size={12} /> {u.role ?? 'User'}
                      </span>
                    </td>
                    <td className={`${adminTd} text-muted-foreground`}>{formatDate(u.created_at)}</td>
                    <td className={`${adminTd} text-muted-foreground`}>{formatDate(u.updated_at)}</td>
                    <td className={adminTd}>
                      <div className="flex items-center gap-1.5">
                        <AdminIconButton icon={Edit2} onClick={() => setEditing(u)} title="Edit role" />
                        <AdminIconButton icon={KeyRound} onClick={() => setPasswordUser(u)} title="Set password" />
                        <AdminIconButton
                          icon={Trash2}
                          tone="danger"
                          onClick={() => setConfirmingDelete(u)}
                          disabled={isSelf}
                          title={isSelf ? 'Cannot delete your own account' : 'Delete user'}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {loading && !liveSearch && users.length === 0 && (
            <div className="rounded-xl border border-border/80 p-4 text-sm text-muted-foreground">
              Loading…
            </div>
          )}
          {searchBusy && visibleUsers.length === 0 && (
            <div className="rounded-xl border border-border/80 p-4 text-sm text-muted-foreground">
              Searching…
            </div>
          )}
          {!searchBusy && !loading && visibleUsers.length === 0 && (
            <div className="rounded-xl border border-border/80 p-4 text-sm text-muted-foreground">
              {liveSearch ? 'No matches.' : 'No users match.'}
            </div>
          )}
          {visibleUsers.map((u) => {
              const isSelf = u.email.toLowerCase() === admin?.email;
              return (
                <div key={u.id} className="rounded-xl border border-border/80 bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{u.email}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatDate(u.created_at)}</span>
                        <span aria-hidden>·</span>
                        <span>Updated {formatDate(u.updated_at)}</span>
                        {isSelf && (
                          <>
                            <span aria-hidden>·</span>
                            <span>(you)</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                        u.role === 'Admin'
                          ? 'border border-emerald-500/25 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                          : 'border border-border bg-muted/60 text-muted-foreground'
                      }`}
                    >
                      <Shield size={12} /> {u.role ?? 'User'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1.5">
                    <AdminIconButton icon={Edit2} onClick={() => setEditing(u)} title="Edit role" />
                    <AdminIconButton icon={KeyRound} onClick={() => setPasswordUser(u)} title="Set password" />
                    <AdminIconButton
                      icon={Trash2}
                      tone="danger"
                      onClick={() => setConfirmingDelete(u)}
                      disabled={isSelf}
                      title={isSelf ? 'Cannot delete your own account' : 'Delete user'}
                    />
                  </div>
                </div>
              );
            })}
        </div>

        <div className="flex flex-col gap-2 border-t border-border/60 px-4 py-4 text-sm md:flex-row md:items-center md:justify-between md:px-6">
          <div className="text-muted-foreground">
            Page <span className="font-semibold text-foreground">{page + 1}</span> of{' '}
            <span className="font-semibold text-foreground">{totalPages}</span> · Showing{' '}
            <span className="font-semibold text-foreground">{visibleUsers.length}</span> of{' '}
            <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span> matching
          </div>
          <div className="flex gap-2">
            <AdminGhostButton
              disabled={!canPrev || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </AdminGhostButton>
            <AdminOutlineButton
              disabled={!canNext || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </AdminOutlineButton>
          </div>
        </div>
      </div>

      {showAdminModal && (
        <AddAdminModal
          busy={busy}
          setBusy={setBusy}
          onClose={() => setShowAdminModal(false)}
          onFinished={async () => {
            setShowAdminModal(false);
            await load();
          }}
        />
      )}

      {showReconcileModal && (
        <ReconcileSubscribersModal
          onClose={() => setShowReconcileModal(false)}
          onChanged={async () => {
            await load({ silent: true });
          }}
        />
      )}

      {editing && (
        <EditRoleModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
          busy={busy}
          setBusy={setBusy}
        />
      )}

      {passwordUser && (
        <SetPasswordModal
          user={passwordUser}
          onClose={() => setPasswordUser(null)}
          onSaved={async () => {
            setPasswordUser(null);
            await load();
          }}
          busy={busy}
          setBusy={setBusy}
        />
      )}

      {confirmingDelete && (
        <ConfirmDeleteModal
          user={confirmingDelete}
          onClose={() => setConfirmingDelete(null)}
          onDeleted={async () => {
            setConfirmingDelete(null);
            await load();
          }}
          busy={busy}
          setBusy={setBusy}
        />
      )}
    </div>
  );
}

type ModalBaseProps = {
  onClose: () => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
};

function SetPasswordModal({
  user,
  onClose,
  onSaved,
  busy,
  setBusy,
}: ModalBaseProps & { user: AdminUserRow; onSaved: () => Promise<void> }) {
  const { getAccessToken } = useAdmin();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const p = password.trim();
    if (p.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (p !== confirmPassword.trim()) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const token = await getAccessToken();
      const res = await updateAuthorizedUserPasswordAction(token, { id: user.id, newPassword: p });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title={`Set password: ${user.email}`} onClose={onClose} busy={busy}>
      <p className="text-sm text-muted-foreground">
        Sets the login password for this account in Supabase Auth. The user can sign in with email and password
        immediately afterward.
      </p>
      <label className="mt-4 block">
        <span className="text-sm font-semibold text-foreground">New password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <label className="mt-3 block">
        <span className="text-sm font-semibold text-foreground">Confirm password</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <ModalFooter onCancel={onClose} onConfirm={() => void submit()} busy={busy} confirmLabel="Save password" />
    </ModalShell>
  );
}

function EditRoleModal({
  user,
  onClose,
  onSaved,
  busy,
  setBusy,
}: ModalBaseProps & { user: AdminUserRow; onSaved: () => Promise<void> }) {
  const { getAccessToken } = useAdmin();
  const [role, setRole] = useState<Role>((user.role === 'Admin' ? 'Admin' : 'User'));
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const token = await getAccessToken();
      const res = await updateUserRoleAction(token, { id: user.id, role });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title={`Edit: ${user.email}`} onClose={onClose} busy={busy}>
      <label className="block">
        <span className="text-sm font-semibold text-foreground">Role</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm"
        >
          <option value="User">User</option>
          <option value="Admin">Admin</option>
        </select>
      </label>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <ModalFooter onCancel={onClose} onConfirm={save} busy={busy} confirmLabel="Save" />
    </ModalShell>
  );
}

function ConfirmDeleteModal({
  user,
  onClose,
  onDeleted,
  busy,
  setBusy,
}: ModalBaseProps & { user: AdminUserRow; onDeleted: () => Promise<void> }) {
  const { getAccessToken } = useAdmin();
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setError(null);
    setBusy(true);
    try {
      const token = await getAccessToken();
      const res = await deleteUserAction(token, { id: user.id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Delete User" onClose={onClose} busy={busy}>
      <p className="text-sm text-foreground">
        Remove <strong>{user.email}</strong> from authorized users? They will lose access immediately.
      </p>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <ModalFooter onCancel={onClose} onConfirm={confirm} busy={busy} confirmLabel="Delete" destructive />
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  busy,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  busy: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div
        className={`w-full overflow-hidden rounded-2xl border border-border bg-card shadow-lg ${wide ? 'max-w-2xl' : 'max-w-md'}`}
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-4 sm:px-6">
          <h4 className="text-base font-semibold text-foreground">{title}</h4>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({
  onCancel,
  onConfirm,
  busy,
  confirmLabel,
  destructive,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
  confirmLabel: string;
  destructive?: boolean;
}) {
  return (
    <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className={`rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors disabled:opacity-50 ${
          destructive
            ? 'bg-destructive hover:bg-destructive/90'
            : 'bg-primary hover:bg-primary/90'
        }`}
      >
        {busy ? 'Working…' : confirmLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Admin Modal — creates a fully-verified Supabase auth user with password
// ---------------------------------------------------------------------------
function AddAdminModal({
  onClose,
  onFinished,
  busy,
  setBusy,
}: ModalBaseProps & { onFinished: () => Promise<void> }) {
  const { getAccessToken } = useAdmin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim()) { setError('Email is required.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setBusy(true);
    try {
      const token = await getAccessToken();
      const res = await createAdminWithPasswordAction(token, { email: email.trim(), password });
      if (!res.ok) { setError(res.error); return; }
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <ModalShell title="Admin Added" onClose={onClose} busy={false}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
            <Shield size={24} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-sm font-semibold text-foreground">Admin account created</p>
          <p className="text-xs text-muted-foreground">
            <strong>{email}</strong> is now a verified admin and can log in immediately with the password you set.
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => void onFinished()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Done
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Add Admin" onClose={onClose} busy={busy}>
      <p className="text-sm text-muted-foreground">
        Creates a verified admin account directly in Supabase — no email confirmation needed. The admin can log in immediately with the password you set.
      </p>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-foreground">Email address</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            autoFocus
            className="mt-2 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-foreground">Password</span>
          <p className="mt-0.5 text-xs text-muted-foreground">Minimum 8 characters.</p>
          <div className="relative mt-2">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              placeholder="Set a strong password"
              className="h-10 w-full rounded-lg border border-border bg-card px-3 pr-10 text-sm text-foreground shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <Shield size={14} />
          {busy ? 'Creating…' : 'Create Admin'}
        </button>
      </div>
    </ModalShell>
  );
}
