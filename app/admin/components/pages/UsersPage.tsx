'use client';

import { Edit2, FileSpreadsheet, Filter, KeyRound, Search, Shield, Trash2, UserPlus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  bulkCreateUsersAction,
  createAdminWithPasswordAction,
  createUserAction,
  deleteUserAction,
  listUsersAction,
  updateAuthorizedUserPasswordAction,
  updateUserRoleAction,
  type AdminUserRow,
  type BulkCreateRowInput,
  type BulkCreateUserResultItem,
  type UserStats,
} from '../../_actions/users';
import { useAdmin } from '../../_lib/admin-context';
import { useDebouncedValue } from '../../_lib/use-debounced-value';
import { useLiveAdminRefresh } from '../../_lib/use-live-admin-refresh';

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

export default function UsersPage() {
  const { admin, getAccessToken } = useAdmin();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 250);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [passwordUser, setPasswordUser] = useState<AdminUserRow | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<AdminUserRow | null>(null);
  const [busy, setBusy] = useState(false);

  const listKey = `${debouncedSearch}|${roleFilter}`;
  const lastListKeyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
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
    channelName: 'admin-users-live',
    getAccessToken,
    refresh: load,
    pollingMs: 30_000,
    throttleMs: 3_000,
    realtime: [{ schema: 'public', table: 'authorized_users' }],
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = page + 1 < totalPages;

  const statCards = [
    { label: 'Total Users', value: stats?.total ?? 0, extra: `${stats?.admins ?? 0} admin${(stats?.admins ?? 0) === 1 ? '' : 's'}` },
    { label: 'Admins', value: stats?.admins ?? 0, extra: 'Full access' },
    { label: 'Added This Week', value: stats?.addedThisWeek ?? 0, extra: 'Last 7 days' },
  ];

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
        {statCards.map((s, i) => (
          <div
            key={s.label}
            className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
          >
            <div className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {loading ? '—' : s.value}
            </div>
            <div className="mt-2 text-sm font-medium text-muted-foreground">{s.label}</div>
            <div
              className={`mt-2 text-xs font-semibold ${
                i === 0
                  ? 'text-violet-600 dark:text-violet-400'
                  : i === 1
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-sky-600 dark:text-sky-400'
              }`}
            >
              {s.extra}
            </div>
          </div>
        ))}
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-muted/40 px-4 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">Authorized Users</h3>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Only listed emails can log in via magic link.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
              >
                <UserPlus size={16} />
                Add Users
              </button>
              <button
                onClick={() => setShowAdminModal(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                <Shield size={16} />
                Add Admin
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-xs">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by email…"
                className="h-10 w-full rounded-lg border border-border bg-card py-2 pl-9 pr-4 text-sm text-foreground shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="user">User</option>
              </select>
              <button
                onClick={load}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
              >
                <Filter size={15} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive md:px-6 dark:border-destructive/30 dark:bg-destructive/15">
            {error}
          </div>
        )}

        <div className="hidden min-w-0 overflow-x-auto md:block">
          <table className="w-full min-w-[780px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left">
                <th className="whitespace-nowrap border-b border-border bg-muted/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-6 sm:text-[11px]">
                  Email
                </th>
                <th className="whitespace-nowrap border-b border-border bg-muted/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-6 sm:text-[11px]">
                  Role
                </th>
                <th className="whitespace-nowrap border-b border-border bg-muted/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-6 sm:text-[11px]">
                  Joined
                </th>
                <th className="whitespace-nowrap border-b border-border bg-muted/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-6 sm:text-[11px]">
                  Updated
                </th>
                <th className="whitespace-nowrap border-b border-border bg-muted/50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:px-6 sm:text-[11px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="px-4 py-8 text-sm text-muted-foreground sm:px-6" colSpan={5}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && users.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-sm text-muted-foreground sm:px-6" colSpan={5}>
                    No users match.
                  </td>
                </tr>
              )}
              {users.map((u) => {
                const isSelf = u.email.toLowerCase() === admin?.email;
                return (
                  <tr
                    key={u.id}
                    className="border-b border-border transition-colors last:border-b-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3.5 sm:px-6 sm:py-4">
                      <div className="font-medium text-foreground">{u.email}</div>
                      {isSelf && <div className="text-xs text-muted-foreground">(you)</div>}
                    </td>
                    <td className="px-4 py-3.5 sm:px-6 sm:py-4">
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
                    <td className="px-4 py-3.5 text-muted-foreground sm:px-6 sm:py-4">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-3.5 text-muted-foreground sm:px-6 sm:py-4">{formatDate(u.updated_at)}</td>
                    <td className="px-4 py-3.5 sm:px-6 sm:py-4">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => setEditing(u)}
                          className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted"
                          title="Edit role"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPasswordUser(u)}
                          className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted"
                          title="Set password"
                        >
                          <KeyRound size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(u)}
                          disabled={isSelf}
                          className="rounded-lg p-2 text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-30 dark:text-rose-400"
                          title={isSelf ? 'Cannot delete your own account' : 'Delete user'}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {loading && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Loading…
            </div>
          )}
          {!loading && users.length === 0 && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No users match.
            </div>
          )}
          {!loading &&
            users.map((u) => {
              const isSelf = u.email.toLowerCase() === admin?.email;
              return (
                <div key={u.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
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
                  <div className="mt-3 flex items-center justify-end gap-1 text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => setEditing(u)}
                      className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted"
                      title="Edit role"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPasswordUser(u)}
                      className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted"
                      title="Set password"
                    >
                      <KeyRound size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(u)}
                      disabled={isSelf}
                      className="rounded-lg p-2 text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-30 dark:text-rose-400"
                      title={isSelf ? 'Cannot delete your own account' : 'Delete user'}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-4 py-4 text-sm md:flex-row md:items-center md:justify-between md:px-6">
          <div className="text-muted-foreground">
            Page <span className="font-semibold text-foreground">{page + 1}</span> of{' '}
            <span className="font-semibold text-foreground">{totalPages}</span> · Showing{' '}
            <span className="font-semibold text-foreground">{users.length}</span> of{' '}
            <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span> matching
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canPrev || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!canNext || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              Next
            </button>
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

      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onFinished={async () => {
            setShowAddModal(false);
            await load();
          }}
          busy={busy}
          setBusy={setBusy}
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

type AddTab = 'emails' | 'spreadsheet';

function AddUserModal({
  onClose,
  onFinished,
  busy,
  setBusy,
}: ModalBaseProps & { onFinished: () => Promise<void> }) {
  const { getAccessToken } = useAdmin();
  const [tab, setTab] = useState<AddTab>('emails');
  const [emailText, setEmailText] = useState('');
  const defaultRole: Role = 'User';
  const [error, setError] = useState<string | null>(null);
  const [bulkResults, setBulkResults] = useState<BulkCreateUserResultItem[] | null>(null);
  const [bulkSummary, setBulkSummary] = useState<{
    created: number;
    duplicate: number;
    duplicateInFile: number;
    invalid: number;
    dbErrors: number;
    inviteFailed: number;
  } | null>(null);

  const [sheetPreview, setSheetPreview] = useState<BulkCreateRowInput[]>([]);
  const [sheetFileName, setSheetFileName] = useState<string | null>(null);
  const [sheetParseError, setSheetParseError] = useState<string | null>(null);
  const lastSheetFileRef = useRef<File | null>(null);

  const resetSheetPreview = () => {
    lastSheetFileRef.current = null;
    setSheetPreview([]);
    setSheetFileName(null);
    setSheetParseError(null);
  };

  const downloadSampleXlsx = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['email'],
      ['colleague@example.com'],
      ['another@example.com'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    XLSX.writeFile(wb, 'authorized-users-import-sample.xlsx');
  };

  const parseSpreadsheetFile = useCallback(async (file: File) => {
    setSheetParseError(null);
    setSheetPreview([]);
    setSheetFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) {
        setSheetParseError('The workbook has no sheets.');
        return;
      }
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      const parsed = sheetJsonToBulkRows(rows, defaultRole);
      if (parsed.rows.length === 0) {
        setSheetParseError(parsed.error ?? 'No rows with a valid email were found.');
        return;
      }
      if (parsed.error) setSheetParseError(parsed.error);
      setSheetPreview(parsed.rows);
    } catch (e) {
      setSheetParseError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  }, [defaultRole]);

  useEffect(() => {
    const f = lastSheetFileRef.current;
    if (f && tab === 'spreadsheet') void parseSpreadsheetFile(f);
  }, [defaultRole, tab, parseSpreadsheetFile]);

  const runBulk = async (rows: BulkCreateRowInput[]) => {
    setError(null);
    setBulkResults(null);
    setBulkSummary(null);
    if (rows.length === 0) {
      setError('Add at least one email.');
      return;
    }
    setBusy(true);
    try {
      const token = await getAccessToken();
      const res = await bulkCreateUsersAction(token, { rows });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBulkResults(res.data.results);
      setBulkSummary(res.data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBusy(false);
    }
  };

  const addFromEmails = async () => {
    const emails = parseEmailList(emailText);
    if (emails.length === 0) {
      setError('Enter one or more email addresses (comma, space, or newline separated).');
      return;
    }
    if (emails.length === 1) {
      setError(null);
      setBusy(true);
      try {
        const token = await getAccessToken();
        const res = await createUserAction(token, { email: emails[0], role: defaultRole });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        await onFinished();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error.');
      } finally {
        setBusy(false);
      }
      return;
    }
    const rows = emails.map((email) => ({ email, role: defaultRole }));
    await runBulk(rows);
  };

  const addFromSpreadsheet = async () => {
    await runBulk(sheetPreview);
  };

  const summaryLine =
    bulkSummary &&
    [
      bulkSummary.created ? `${bulkSummary.created} added` : null,
      bulkSummary.duplicate ? `${bulkSummary.duplicate} already existed` : null,
      bulkSummary.duplicateInFile ? `${bulkSummary.duplicateInFile} duplicate in file` : null,
      bulkSummary.invalid ? `${bulkSummary.invalid} invalid` : null,
      bulkSummary.dbErrors ? `${bulkSummary.dbErrors} failed` : null,
      bulkSummary.inviteFailed ? `${bulkSummary.inviteFailed} invite email issue` : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <ModalShell title="Add users" onClose={onClose} busy={busy} wide>
      {!bulkResults && (
        <>
          <p className="text-sm text-muted-foreground">
            Whitelist emails for magic-link login. Use multiple addresses at once, or import a spreadsheet.
          </p>
          <div className="mt-4 flex gap-1 rounded-xl border border-border bg-muted/50 p-1">
            <button
              type="button"
              onClick={() => {
                setTab('emails');
                resetSheetPreview();
              }}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                tab === 'emails' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Emails
            </button>
            <button
              type="button"
              onClick={() => setTab('spreadsheet')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                tab === 'spreadsheet' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Spreadsheet
            </button>
          </div>

          {/* Role is always User here — use "Add Admin" button for admin accounts */}

          {tab === 'emails' && (
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-foreground">Email addresses</span>
              <textarea
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
                placeholder={'one@example.com, two@example.com\nor one address per line'}
                rows={6}
                className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-foreground shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                autoFocus
              />
            </label>
          )}

          {tab === 'spreadsheet' && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={downloadSampleXlsx}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
                >
                  <FileSpreadsheet size={16} />
                  Download sample .xlsx
                </button>
                <span className="text-xs text-muted-foreground">
                  First sheet: columns <code className="rounded bg-muted px-1 font-mono text-foreground">email</code>{' '}
                  (required) and <code className="rounded bg-muted px-1 font-mono text-foreground">role</code> (optional:
                  Admin or User).
                </span>
              </div>
              <label className="block">
                <span className="text-sm font-semibold text-foreground">Upload .xlsx</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="mt-2 block w-full cursor-pointer rounded-lg border border-dashed border-border bg-card px-3 py-4 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) {
                      lastSheetFileRef.current = f;
                      void parseSpreadsheetFile(f);
                    }
                  }}
                />
              </label>
              {sheetParseError && (
                <p className="text-sm text-amber-800 dark:text-amber-200">{sheetParseError}</p>
              )}
              {sheetPreview.length > 0 && (
                <div className="max-h-40 overflow-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted/50">
                      <tr className="text-muted-foreground">
                        <th className="border-b border-border px-3 py-2 font-semibold">email</th>
                        <th className="border-b border-border px-3 py-2 font-semibold">role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheetPreview.slice(0, 50).map((r, i) => (
                        <tr key={`${r.email}-${i}`} className="border-b border-border last:border-b-0">
                          <td className="px-3 py-1.5 font-mono text-foreground">{r.email}</td>
                          <td className="px-3 py-1.5 text-foreground">{r.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sheetPreview.length > 50 && (
                    <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      Showing first 50 of {sheetPreview.length} rows.
                    </div>
                  )}
                </div>
              )}
              {sheetFileName && sheetPreview.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {sheetFileName}: <span className="font-medium text-foreground">{sheetPreview.length}</span> users ready
                  to import.
                </p>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
            >
              Cancel
            </button>
            {tab === 'emails' ? (
              <button
                type="button"
                onClick={() => void addFromEmails()}
                disabled={busy}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Add users'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void addFromSpreadsheet()}
                disabled={busy || sheetPreview.length === 0}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? 'Working…' : `Import ${sheetPreview.length || ''} users`.trim()}
              </button>
            )}
          </div>
        </>
      )}

      {bulkResults && bulkSummary && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">Import finished</p>
          {summaryLine && <p className="text-sm text-muted-foreground">{summaryLine}.</p>}
          <div className="max-h-56 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted/50">
                <tr className="text-muted-foreground">
                  <th className="border-b border-border px-3 py-2 font-semibold">email</th>
                  <th className="border-b border-border px-3 py-2 font-semibold">result</th>
                </tr>
              </thead>
              <tbody>
                {bulkResults.map((r, i) => (
                  <tr key={`${r.email}-${i}`} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5 font-mono text-foreground">{r.email}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={
                          r.status === 'created'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : r.status === 'created_invite_failed'
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-muted-foreground'
                        }
                      >
                        {bulkStatusLabel(r)}
                      </span>
                      {r.message && <div className="mt-0.5 text-[11px] text-muted-foreground">{r.message}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void onFinished()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function bulkStatusLabel(r: BulkCreateUserResultItem): string {
  switch (r.status) {
    case 'created':
      return 'Added';
    case 'created_invite_failed':
      return 'Added (invite email failed)';
    case 'duplicate':
      return 'Already exists';
    case 'duplicate_in_file':
      return 'Duplicate in file';
    case 'invalid':
      return 'Invalid';
    case 'db_error':
      return 'Error';
    default:
      return r.status;
  }
}

function parseEmailList(raw: string): string[] {
  const parts = raw
    .split(/[\s,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(p);
  }
  return out;
}

function normalizeSheetHeader(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase();
}

function findColumnKey(sampleRow: Record<string, unknown>, target: string): string | undefined {
  for (const k of Object.keys(sampleRow)) {
    if (normalizeSheetHeader(k) === target) return k;
  }
  return undefined;
}

function sheetJsonToBulkRows(
  json: Record<string, unknown>[],
  defaultRole: Role
): { rows: BulkCreateRowInput[]; error?: string } {
  if (json.length === 0) return { rows: [] };
  const emailKey = findColumnKey(json[0], 'email');
  if (!emailKey) {
    return { rows: [], error: 'Missing required column header: email' };
  }
  const roleKey = findColumnKey(json[0], 'role');
  const rows: BulkCreateRowInput[] = [];
  let badRoles = 0;

  for (const row of json) {
    const email = String(row[emailKey] ?? '').trim();
    if (!email) continue;
    const roleCell = roleKey ? String(row[roleKey] ?? '').trim() : '';
    const coerced = coerceRoleCell(roleCell, defaultRole);
    if (coerced === null) {
      badRoles += 1;
      continue;
    }
    rows.push({ email, role: coerced });
  }

  const errorParts: string[] = [];
  if (badRoles) errorParts.push(`${badRoles} row(s) skipped: role must be Admin or User (or leave blank for default).`);
  return { rows, error: errorParts.length ? errorParts.join(' ') : undefined };
}

function coerceRoleCell(raw: string, fallback: Role): 'Admin' | 'User' | null {
  if (!raw) return fallback;
  const t = raw.trim().toLowerCase();
  if (t === 'admin') return 'Admin';
  if (t === 'user') return 'User';
  return null;
}

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
