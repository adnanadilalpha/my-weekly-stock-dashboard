'use client';

import { ArrowLeft, ChevronDown, FileSpreadsheet, Plus, Trash2, UserMinus, UserPlus, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AdminAlert,
  AdminGhostButton,
  AdminOutlineButton,
  AdminPrimaryButton,
  adminField,
} from '../ui/admin-ui';
import {
  createUserAction,
  diffSubscribersAction,
  reconcileAddUsersAction,
  reconcileRemoveUsersAction,
  type SubscriberDiffResult,
} from '../../_actions/users';
import { useAdmin } from '../../_lib/admin-context';

const ADD_CHUNK = 500;
const REMOVE_CHUNK = 500;

type Props = {
  onClose: () => void;
  onChanged: () => Promise<void>;
};

type Step = 'choose' | 'csv' | 'manual';
type PanelId = 'toAdd' | 'toRemove';

function normalizeSheetHeader(h: string): string {
  return String(h ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
}

function findEmailColumnKey(sampleRow: Record<string, unknown>): string | undefined {
  for (const k of Object.keys(sampleRow)) {
    if (normalizeSheetHeader(k) === 'email') return k;
  }
  return undefined;
}

function parseSubscriberEmailsFromFile(file: File): Promise<{ emails: string[]; error?: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve({ emails: [], error: 'Could not read file.' });
    reader.onload = () => {
      try {
        const data = reader.result;
        if (!data) {
          resolve({ emails: [], error: 'Empty file.' });
          return;
        }
        const wb = XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          resolve({ emails: [], error: 'No sheet in workbook.' });
          return;
        }
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]!, {
          defval: '',
        });
        if (json.length === 0) {
          resolve({ emails: [], error: 'Sheet is empty.' });
          return;
        }
        const emailKey = findEmailColumnKey(json[0]!);
        if (!emailKey) {
          resolve({ emails: [], error: 'Missing required column header: Email' });
          return;
        }
        const seen = new Set<string>();
        const emails: string[] = [];
        for (const row of json) {
          const raw = String(row[emailKey] ?? '').trim().toLowerCase();
          if (!raw || !raw.includes('@') || seen.has(raw)) continue;
          seen.add(raw);
          emails.push(raw);
        }
        if (emails.length === 0) {
          resolve({ emails: [], error: 'No valid emails found in the Email column.' });
          return;
        }
        resolve({ emails });
      } catch (e) {
        resolve({ emails: [], error: e instanceof Error ? e.message : 'Failed to parse file.' });
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function AccordionPanel({
  id,
  openId,
  onToggle,
  title,
  count,
  hint,
  actions,
  children,
  tone = 'default',
}: {
  id: PanelId;
  openId: PanelId | null;
  onToggle: (id: PanelId | null) => void;
  title: string;
  count: number;
  hint: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'default' | 'danger';
}) {
  const open = openId === id;
  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        tone === 'danger' ? 'border-destructive/20' : 'border-border/80'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={() => onToggle(open ? null : id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            size={16}
            className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{title}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  tone === 'danger'
                    ? 'bg-destructive/10 text-destructive'
                    : count > 0
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {count}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        </button>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {open ? <div className="border-t border-border/60">{children}</div> : null}
    </div>
  );
}

export default function ReconcileSubscribersModal({ onClose, onChanged }: Props) {
  const { getAccessToken } = useAdmin();
  const [step, setStep] = useState<Step>('choose');
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadedEmails, setUploadedEmails] = useState<string[]>([]);
  const [diff, setDiff] = useState<SubscriberDiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);
  const [openPanel, setOpenPanel] = useState<PanelId | null>('toAdd');
  const [manualEmail, setManualEmail] = useState('');

  const clearCsv = () => {
    setFileName(null);
    setUploadedEmails([]);
    setDiff(null);
    setConfirmRemoveAll(false);
    setOpenPanel('toAdd');
  };

  const goChoose = () => {
    clearCsv();
    setManualEmail('');
    setError(null);
    setFlash(null);
    setStep('choose');
  };

  const runDiff = useCallback(
    async (emails: string[]) => {
      setBusy(true);
      setError(null);
      try {
        const token = await getAccessToken();
        const res = await diffSubscribersAction(token, { emails });
        if (!res.ok) {
          setError(res.error);
          setDiff(null);
          return;
        }
        setDiff(res.data);
        if (res.data.toAdd.length > 0) setOpenPanel('toAdd');
        else if (res.data.toRemove.length > 0) setOpenPanel('toRemove');
        else setOpenPanel(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Diff failed.');
        setDiff(null);
      } finally {
        setBusy(false);
      }
    },
    [getAccessToken]
  );

  const onFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setDiff(null);
    setConfirmRemoveAll(false);
    setError(null);
    setFlash(null);
    setBusy(true);
    const parsed = await parseSubscriberEmailsFromFile(file);
    if (parsed.error) {
      setError(parsed.error);
      setUploadedEmails([]);
      setBusy(false);
      setStep('csv');
      return;
    }
    setUploadedEmails(parsed.emails);
    setBusy(false);
    setStep('csv');
    await runDiff(parsed.emails);
  };

  const refreshAfterChange = async () => {
    if (uploadedEmails.length > 0) await runDiff(uploadedEmails);
    await onChanged();
  };

  const addEmails = async (emails: string[]) => {
    if (emails.length === 0) return;
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const token = await getAccessToken();
      let created = 0;
      let duplicate = 0;
      let invalid = 0;
      let dbErrors = 0;
      for (let i = 0; i < emails.length; i += ADD_CHUNK) {
        const chunk = emails.slice(i, i + ADD_CHUNK);
        const res = await reconcileAddUsersAction(token, { emails: chunk });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        created += res.data.summary.created;
        duplicate += res.data.summary.duplicate;
        invalid += res.data.summary.invalid;
        dbErrors += res.data.summary.dbErrors;
      }
      setFlash(
        `Added ${created} user${created === 1 ? '' : 's'}` +
          (duplicate ? ` · ${duplicate} already existed` : '') +
          (invalid ? ` · ${invalid} invalid` : '') +
          (dbErrors ? ` · ${dbErrors} errors` : '')
      );
      await refreshAfterChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed.');
    } finally {
      setBusy(false);
    }
  };

  const addManual = async () => {
    const email = manualEmail.trim();
    if (!email) {
      setError('Enter an email address.');
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const token = await getAccessToken();
      const res = await createUserAction(token, { email, role: 'User' });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFlash(`${res.data.email} added.`);
      setManualEmail('');
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed.');
    } finally {
      setBusy(false);
    }
  };

  const removeIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    setFlash(null);
    setConfirmRemoveAll(false);
    try {
      const token = await getAccessToken();
      let removed = 0;
      let skipped = 0;
      const reasons: string[] = [];
      for (let i = 0; i < ids.length; i += REMOVE_CHUNK) {
        const chunk = ids.slice(i, i + REMOVE_CHUNK);
        const res = await reconcileRemoveUsersAction(token, { ids: chunk });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        removed += res.data.removed;
        skipped += res.data.skipped;
        reasons.push(...res.data.skippedReasons);
      }
      setFlash(
        `Removed ${removed} user${removed === 1 ? '' : 's'}` +
          (skipped ? ` · ${skipped} skipped` : '') +
          (reasons[0] ? ` (${reasons[0]})` : '')
      );
      await refreshAfterChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed.');
    } finally {
      setBusy(false);
    }
  };

  const title =
    step === 'manual' ? 'Add email' : step === 'csv' ? 'Review CSV' : 'Subscribers';
  const subtitle =
    step === 'manual'
      ? 'Add one person to the allowlist.'
      : step === 'csv'
        ? 'Fix mismatches, then go back anytime.'
        : 'Upload a subscriber export, or add one email.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {step !== 'choose' ? (
              <button
                type="button"
                onClick={goChoose}
                disabled={busy}
                className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <ArrowLeft size={12} />
                Back
              </button>
            ) : null}
            <h4 className="text-base font-semibold text-foreground">{title}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {error && <AdminAlert tone="error">{error}</AdminAlert>}
          {flash && <AdminAlert tone="success">{flash}</AdminAlert>}

          {step === 'choose' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-border/80 bg-muted/15 px-4 py-5 transition-colors hover:bg-muted/30">
                <FileSpreadsheet size={20} className="text-muted-foreground" />
                <div>
                  <div className="text-sm font-semibold text-foreground">Upload CSV</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Compare Substack export to access
                  </div>
                </div>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = '';
                    void onFile(f);
                  }}
                />
              </label>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setFlash(null);
                  setManualEmail('');
                  setStep('manual');
                }}
                className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card px-4 py-5 text-left transition-colors hover:bg-muted/30 disabled:opacity-50"
              >
                <Plus size={20} className="text-muted-foreground" />
                <div>
                  <div className="text-sm font-semibold text-foreground">Add manually</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">One email at a time</div>
                </div>
              </button>
            </div>
          )}

          {step === 'manual' && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void addManual();
              }}
            >
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">Email</span>
                <input
                  type="email"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder="user@example.com"
                  disabled={busy}
                  className={adminField}
                  autoComplete="off"
                  autoFocus
                />
              </label>
              <div className="flex justify-end gap-2">
                <AdminGhostButton type="button" disabled={busy} onClick={goChoose}>
                  Cancel
                </AdminGhostButton>
                <AdminPrimaryButton type="submit" icon={Plus} disabled={busy || !manualEmail.trim()}>
                  {busy ? 'Adding…' : 'Add'}
                </AdminPrimaryButton>
              </div>
            </form>
          )}

          {step === 'csv' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 px-3 py-2.5">
                <FileSpreadsheet size={16} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {fileName ?? 'Subscriber file'}
                  </div>
                  {uploadedEmails.length > 0 ? (
                    <div className="text-xs text-muted-foreground">
                      {uploadedEmails.length.toLocaleString()} emails
                    </div>
                  ) : null}
                </div>
                <label className="shrink-0">
                  <span className="cursor-pointer text-xs font-medium text-primary hover:underline">
                    Replace
                  </span>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      e.target.value = '';
                      void onFile(f);
                    }}
                  />
                </label>
              </div>

              {busy && !diff ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Comparing…</p>
              ) : null}

              {diff ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    File {diff.uploadedCount.toLocaleString()} · System {diff.systemCount.toLocaleString()} ·
                    Matched {diff.matchedCount.toLocaleString()}
                    {diff.protectedAdminCount > 0
                      ? ` · ${diff.protectedAdminCount} admin${diff.protectedAdminCount === 1 ? '' : 's'} kept`
                      : ''}
                  </p>

                  {diff.toAdd.length === 0 && diff.toRemove.length === 0 ? (
                    <div className="rounded-xl border border-border/80 px-4 py-6 text-center">
                      <p className="text-sm font-medium text-foreground">All in sync</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Everyone in the file already has access, and no extras to remove.
                      </p>
                    </div>
                  ) : (
                    <>
                      <AccordionPanel
                        id="toAdd"
                        openId={openPanel}
                        onToggle={setOpenPanel}
                        title="Need access"
                        count={diff.toAdd.length}
                        hint="In the file, not in the system yet"
                        actions={
                          <AdminOutlineButton
                            icon={UserPlus}
                            disabled={busy || diff.toAdd.length === 0}
                            onClick={() => void addEmails(diff.toAdd.map((r) => r.email))}
                          >
                            Add all
                          </AdminOutlineButton>
                        }
                      >
                        <ul className="max-h-52 divide-y divide-border/60 overflow-y-auto">
                          {diff.toAdd.length === 0 ? (
                            <li className="px-4 py-5 text-sm text-muted-foreground">
                              Everyone in the file already has access.
                            </li>
                          ) : (
                            diff.toAdd.map((row) => (
                              <li
                                key={row.email}
                                className="flex items-center justify-between gap-3 px-4 py-2.5"
                              >
                                <span className="min-w-0 truncate text-sm text-foreground">
                                  {row.email}
                                </span>
                                <AdminGhostButton
                                  icon={Plus}
                                  disabled={busy}
                                  className="shrink-0"
                                  onClick={() => void addEmails([row.email])}
                                >
                                  Add
                                </AdminGhostButton>
                              </li>
                            ))
                          )}
                        </ul>
                      </AccordionPanel>

                      <AccordionPanel
                        id="toRemove"
                        openId={openPanel}
                        onToggle={setOpenPanel}
                        title="Not subscribed"
                        count={diff.toRemove.length}
                        hint="In the system, missing from the file"
                        tone="danger"
                        actions={
                          !confirmRemoveAll ? (
                            <AdminGhostButton
                              icon={UserMinus}
                              disabled={busy || diff.toRemove.length === 0}
                              className="border-destructive/30 text-destructive hover:bg-destructive/8"
                              onClick={() => {
                                setOpenPanel('toRemove');
                                setConfirmRemoveAll(true);
                              }}
                            >
                              Remove all
                            </AdminGhostButton>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <AdminGhostButton
                                disabled={busy}
                                onClick={() => setConfirmRemoveAll(false)}
                              >
                                Cancel
                              </AdminGhostButton>
                              <AdminPrimaryButton
                                icon={Trash2}
                                disabled={busy}
                                className="bg-destructive hover:bg-destructive/90"
                                onClick={() => void removeIds(diff.toRemove.map((r) => r.id))}
                              >
                                Confirm
                              </AdminPrimaryButton>
                            </div>
                          )
                        }
                      >
                        <ul className="max-h-52 divide-y divide-border/60 overflow-y-auto">
                          {diff.toRemove.length === 0 ? (
                            <li className="px-4 py-5 text-sm text-muted-foreground">
                              No non-admin users outside the subscriber file.
                            </li>
                          ) : (
                            diff.toRemove.map((row) => (
                              <li
                                key={row.id}
                                className="flex items-center justify-between gap-3 px-4 py-2.5"
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-sm text-foreground">{row.email}</div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {row.role ?? 'User'}
                                  </div>
                                </div>
                                <AdminGhostButton
                                  icon={Trash2}
                                  disabled={busy}
                                  className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/8"
                                  onClick={() => void removeIds([row.id])}
                                >
                                  Remove
                                </AdminGhostButton>
                              </li>
                            ))
                          )}
                        </ul>
                      </AccordionPanel>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-border px-5 py-3">
          <AdminGhostButton disabled={busy} onClick={onClose}>
            Done
          </AdminGhostButton>
        </div>
      </div>
    </div>
  );
}
