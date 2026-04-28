'use client';

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import AdminLoginForm from './AdminLoginForm';
import AdminSidebar from './layout/AdminSidebar';
import TopBar from './layout/TopBar';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/UsersPage';
import FormulaManager from './pages/FormulaManager';
import TickerManagement from './pages/TickerManagement';
import TickerImportPage from './pages/TickerImportPage';
import APISettings from './pages/APISettings';
import NotificationsPage from './pages/NotificationsPage';
import SettingsProfilePage from './pages/SettingsProfilePage';
import { useAdminSession } from '../_lib/use-admin-session';
import { AdminSessionProvider } from '../_lib/admin-context';

export type AdminPageKey =
  | 'dashboard'
  | 'users'
  | 'formula-manager'
  | 'ticker-management'
  | 'ticker-import'
  | 'api-settings'
  | 'notifications'
  | 'settings-profile';

function AdminGate({ children }: { children: (session: ReturnType<typeof useAdminSession>) => ReactElement }) {
  const session = useAdminSession();

  if (session.status === 'loading') {
    return (
      <div className="flex h-screen w-full items-center justify-center admin-page-bg">
        <div className="admin-text-muted text-sm">Verifying access…</div>
      </div>
    );
  }

  if (session.status === 'anon') {
    return <AdminLoginForm />;
  }

  if (session.status === 'not-admin') {
    return (
      <div className="flex h-screen w-full items-center justify-center admin-page-bg">
        <div className="admin-card max-w-md p-6 text-center">
          <h2 className="admin-text-main text-xl font-semibold">Access denied</h2>
          <p className="admin-text-muted mt-2 text-sm">
            Your account does not have admin privileges.
          </p>
          <button
            type="button"
            onClick={() => void session.signOut()}
            className="admin-green-bg mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (session.status === 'error') {
    return (
      <div className="flex h-screen w-full items-center justify-center admin-page-bg">
        <div className="admin-card max-w-md p-6 text-center">
          <h2 className="admin-text-main text-xl font-semibold">Something went wrong</h2>
          <p className="admin-text-muted mt-2 text-sm">{session.error ?? 'Unknown error.'}</p>
        </div>
      </div>
    );
  }

  return children(session);
}

export function AdminPanel() {
  return (
    <AdminGate>
      {(session) => (
        <AdminSessionProvider value={session}>
          <AdminPanelInner />
        </AdminSessionProvider>
      )}
    </AdminGate>
  );
}

function AdminPanelInner() {
  const [currentPage, setCurrentPage] = useState<AdminPageKey>('dashboard');
  const [visitedPages, setVisitedPages] = useState<Set<AdminPageKey>>(() => new Set(['dashboard']));
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const validPages: AdminPageKey[] = [
    'dashboard',
    'users',
    'formula-manager',
    'ticker-management',
    'ticker-import',
    'api-settings',
    'notifications',
    'settings-profile',
  ];

  const handleNavigate = (page: string) => {
    if (!validPages.includes(page as AdminPageKey)) return;
    const next = page as AdminPageKey;
    setVisitedPages((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
    setCurrentPage(next);
    setMobileSidebarOpen(false);
  };

  const pageShell = useCallback((key: AdminPageKey, node: ReactElement) => {
    const hidden = currentPage !== key;
    return (
      <div key={key} className={hidden ? 'hidden' : 'flex min-h-0 min-w-0 flex-1 flex-col'} aria-hidden={hidden}>
        {node}
      </div>
    );
  }, [currentPage]);

  const pageContent = useMemo(() => {
    const pages: ReactElement[] = [];
    if (visitedPages.has('dashboard')) {
      pages.push(pageShell('dashboard', <Dashboard dataActive={currentPage === 'dashboard'} />));
    }
    if (visitedPages.has('users')) pages.push(pageShell('users', <UsersPage />));
    if (visitedPages.has('formula-manager')) pages.push(pageShell('formula-manager', <FormulaManager />));
    if (visitedPages.has('ticker-management')) pages.push(pageShell('ticker-management', <TickerManagement />));
    if (visitedPages.has('ticker-import')) pages.push(pageShell('ticker-import', <TickerImportPage />));
    if (visitedPages.has('api-settings')) pages.push(pageShell('api-settings', <APISettings />));
    if (visitedPages.has('notifications')) pages.push(pageShell('notifications', <NotificationsPage />));
    if (visitedPages.has('settings-profile')) pages.push(pageShell('settings-profile', <SettingsProfilePage />));
    return pages;
  }, [visitedPages, pageShell]);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AdminSidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar currentPage={currentPage} onMenuClick={() => setMobileSidebarOpen(true)} />
        <main className="admin-page-bg flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-6 pt-3 md:px-6 md:pb-8 md:pt-4">
          {pageContent}
        </main>
      </div>
    </div>
  );
}

