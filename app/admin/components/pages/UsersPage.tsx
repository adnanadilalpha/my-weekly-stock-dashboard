'use client';

import { Edit2, FileSpreadsheet, Filter, Search, Shield, Trash2, UserPlus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  bulkCreateUsersAction,
  createUserAction,
  deleteUserAction,
  listUsersAction,
  updateUserRoleAction,
  type AdminUserRow,
  type BulkCreateRowInput,
  type BulkCreateUserResultItem,
  type UserStats,
} from '../../_actions/users';
import { useAdmin } from '../../_lib/admin-context';
import { useDebouncedValue } from '../../_lib/use-debounced-value';

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
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 350);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
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

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = page + 1 < totalPages;

  const statCards = [
    { label: 'Total Users', value: stats?.total ?? 0, extra: `${stats?.admins ?? 0} admin${(stats?.admins ?? 0) === 1 ? '' : 's'}` },
    { label: 'Admins', value: stats?.admins ?? 0, extra: 'Full access' },
    { label: 'Added This Week', value: stats?.addedThisWeek ?? 0, extra: 'Last 7 days' },
  ];

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
        {statCards.map((s) => (
          <div key={s.label} className="admin-card min-w-0 rounded-2xl p-6 shadow-sm">
            <div className="admin-text-main text-3xl font-bold">{loading ? '—' : s.value}</div>
            <div className="admin-text-muted mt-2 text-sm">{s.label}</div>
            <div className="admin-green mt-2 text-xs font-semibold">{s.extra}</div>
          </div>
        ))}
      </div>

      <div className="admin-card min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl shadow-sm">
        <div className="admin-border border-b px-4 py-4 md:px-6 md:py-6">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="admin-text-main text-lg font-semibold">Authorized Users</h3>
              <p className="admin-text-muted mt-1 text-sm">Only listed emails can log in via magic link.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowAddModal(true)}
                className="admin-green-bg inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white"
              >
                <UserPlus size={16} />
                Add users
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto] md:gap-4">
            <div className="relative">
              <Search size={16} className="admin-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by email…"
                className="admin-border w-full rounded-lg border py-2 pl-9 pr-4 text-sm"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
              className="admin-border rounded-lg border px-3 py-2 text-sm"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
            <button
              onClick={load}
              className="admin-border admin-text-muted inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
            >
              <Filter size={15} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:px-6">{error}</div>
        )}

        <div className="hidden min-w-0 overflow-x-auto md:block">
          <table className="w-full min-w-[780px]">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Joined</th>
                <th className="px-6 py-3">Updated</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="px-6 py-8 text-sm admin-text-muted" colSpan={5}>Loading…</td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td className="px-6 py-8 text-sm admin-text-muted" colSpan={5}>No users match.</td></tr>
              )}
              {users.map((u) => {
                const isSelf = u.email.toLowerCase() === admin?.email;
                return (
                  <tr key={u.id} className="admin-border-soft border-t text-sm">
                    <td className="px-6 py-4">
                      <div className="admin-text-main font-medium">{u.email}</div>
                      {isSelf && <div className="admin-text-muted text-xs">(you)</div>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${u.role === 'Admin' ? 'admin-green bg-green-700/10' : 'admin-text-muted bg-slate-100'}`}>
                        <Shield size={12} /> {u.role ?? 'User'}
                      </span>
                    </td>
                    <td className="admin-text-muted px-6 py-4">{formatDate(u.created_at)}</td>
                    <td className="admin-text-muted px-6 py-4">{formatDate(u.updated_at)}</td>
                    <td className="px-6 py-4">
                      <div className="admin-text-muted flex items-center gap-2">
                        <button
                          onClick={() => setEditing(u)}
                          className="rounded p-2 hover:bg-slate-100"
                          title="Edit role"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => setConfirmingDelete(u)}
                          disabled={isSelf}
                          className="rounded p-2 text-red-600 hover:bg-red-50 disabled:opacity-30"
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

        <div className="admin-border flex flex-col gap-2 border-t px-4 py-4 text-sm md:flex-row md:items-center md:justify-between md:px-6">
          <div className="admin-text-muted">
            Page <span className="admin-text-main font-semibold">{page + 1}</span> of{' '}
            <span className="admin-text-main font-semibold">{totalPages}</span> · Showing{' '}
            <span className="admin-text-main font-semibold">{users.length}</span> of{' '}
            <span className="admin-text-main font-semibold">{totalCount.toLocaleString()}</span> matching
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canPrev || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="admin-border admin-text-muted rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!canNext || loading}
              onClick={() => setPage((p) => p + 1)}
              className="admin-green-bg rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

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
  const [defaultRole, setDefaultRole] = useState<Role>('User');
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
      ['email', 'role'],
      ['colleague@example.com', 'User'],
      ['manager@example.com', 'Admin'],
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
          <p className="admin-text-muted text-sm">
            Whitelist emails for magic-link login. Use multiple addresses at once, or import a spreadsheet.
          </p>
          <div className="mt-4 flex gap-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setTab('emails');
                resetSheetPreview();
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${
                tab === 'emails' ? 'bg-white text-slate-900 shadow-sm' : 'admin-text-muted'
              }`}
            >
              Emails
            </button>
            <button
              type="button"
              onClick={() => setTab('spreadsheet')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${
                tab === 'spreadsheet' ? 'bg-white text-slate-900 shadow-sm' : 'admin-text-muted'
              }`}
            >
              Spreadsheet
            </button>
          </div>

          <label className="mt-4 block">
            <span className="admin-text-main text-sm font-semibold">Default role</span>
            <p className="admin-text-muted mt-1 text-xs">Used for the email list, and for spreadsheet rows with an empty role cell.</p>
            <select
              value={defaultRole}
              onChange={(e) => setDefaultRole(e.target.value as Role)}
              className="admin-border mt-2 w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="User">User</option>
              <option value="Admin">Admin</option>
            </select>
          </label>

          {tab === 'emails' && (
            <label className="mt-4 block">
              <span className="admin-text-main text-sm font-semibold">Email addresses</span>
              <textarea
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
                placeholder={'one@example.com, two@example.com\nor one address per line'}
                rows={6}
                className="admin-border mt-2 w-full rounded-lg border px-3 py-2 text-sm font-mono"
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
                  className="admin-border admin-text-muted inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
                >
                  <FileSpreadsheet size={16} />
                  Download sample .xlsx
                </button>
                <span className="admin-text-muted text-xs">First sheet: columns <code className="rounded bg-slate-100 px-1">email</code> (required) and <code className="rounded bg-slate-100 px-1">role</code> (optional: Admin or User).</span>
              </div>
              <label className="block">
                <span className="admin-text-main text-sm font-semibold">Upload .xlsx</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="admin-border mt-2 block w-full cursor-pointer rounded-lg border border-dashed px-3 py-4 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-sm file:font-medium"
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
              {sheetParseError && <p className="text-sm text-amber-700">{sheetParseError}</p>}
              {sheetPreview.length > 0 && (
                <div className="admin-border max-h-40 overflow-auto rounded-lg border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="text-slate-500">
                        <th className="px-3 py-2 font-semibold">email</th>
                        <th className="px-3 py-2 font-semibold">role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheetPreview.slice(0, 50).map((r, i) => (
                        <tr key={`${r.email}-${i}`} className="admin-border-soft border-t">
                          <td className="px-3 py-1.5 font-mono">{r.email}</td>
                          <td className="px-3 py-1.5">{r.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sheetPreview.length > 50 && (
                    <div className="admin-text-muted border-t px-3 py-2 text-xs">Showing first 50 of {sheetPreview.length} rows.</div>
                  )}
                </div>
              )}
              {sheetFileName && sheetPreview.length > 0 && (
                <p className="admin-text-muted text-xs">
                  {sheetFileName}: <span className="admin-text-main font-medium">{sheetPreview.length}</span> users ready to import.
                </p>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="admin-border mt-6 flex flex-wrap justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="admin-border admin-text-muted rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            {tab === 'emails' ? (
              <button
                type="button"
                onClick={() => void addFromEmails()}
                disabled={busy}
                className="admin-green-bg rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Add users'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void addFromSpreadsheet()}
                disabled={busy || sheetPreview.length === 0}
                className="admin-green-bg rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Working…' : `Import ${sheetPreview.length || ''} users`.trim()}
              </button>
            )}
          </div>
        </>
      )}

      {bulkResults && bulkSummary && (
        <div className="space-y-3">
          <p className="admin-text-main text-sm font-semibold">Import finished</p>
          {summaryLine && <p className="admin-text-muted text-sm">{summaryLine}.</p>}
          <div className="admin-border max-h-56 overflow-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-slate-500">
                  <th className="px-3 py-2 font-semibold">email</th>
                  <th className="px-3 py-2 font-semibold">result</th>
                </tr>
              </thead>
              <tbody>
                {bulkResults.map((r, i) => (
                  <tr key={`${r.email}-${i}`} className="admin-border-soft border-t">
                    <td className="px-3 py-1.5 font-mono">{r.email}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={
                          r.status === 'created'
                            ? 'text-green-700'
                            : r.status === 'created_invite_failed'
                              ? 'text-amber-700'
                              : 'text-slate-600'
                        }
                      >
                        {bulkStatusLabel(r)}
                      </span>
                      {r.message && <div className="admin-text-muted mt-0.5 text-[11px]">{r.message}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="admin-border admin-text-muted rounded-lg border px-4 py-2 text-sm font-medium"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void onFinished()}
              className="admin-green-bg rounded-lg px-4 py-2 text-sm font-semibold text-white"
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
        <span className="admin-text-main text-sm font-semibold">Role</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="admin-border mt-2 w-full rounded-lg border px-3 py-2 text-sm"
        >
          <option value="User">User</option>
          <option value="Admin">Admin</option>
        </select>
      </label>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
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
      <p className="admin-text-main text-sm">
        Remove <strong>{user.email}</strong> from authorized users? They will lose access immediately.
      </p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`w-full rounded-xl bg-white shadow-xl ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="admin-border flex items-center justify-between border-b px-6 py-4">
          <h4 className="admin-text-main text-base font-semibold">{title}</h4>
          <button onClick={onClose} disabled={busy} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30">
            <X size={16} className="admin-text-muted" />
          </button>
        </div>
        <div className="p-6">{children}</div>
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
    <div className="admin-border mt-6 flex justify-end gap-3 border-t pt-4">
      <button
        onClick={onCancel}
        disabled={busy}
        className="admin-border admin-text-muted rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={busy}
        className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
          destructive ? 'bg-red-600' : 'admin-green-bg'
        }`}
      >
        {busy ? 'Working…' : confirmLabel}
      </button>
    </div>
  );
}
