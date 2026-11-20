'use client';

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import AdminLoginForm from './AdminLoginForm';
import AdminSidebar from './layout/AdminSidebar';
import TopBar from './layout/TopBar';
import Dashboard from './pages/Dashboard';
import PortfolioPage from './pages/PortfolioPage';
import UsersPage from './pages/UsersPage';
import FormulaManager from './pages/FormulaManager';
import TickerManagement from './pages/TickerManagement';
import APISettings from './pages/APISettings';
import NotificationsPage from './pages/NotificationsPage';
import SettingsProfilePage from './pages/SettingsProfilePage';
import { useAdminSession } from '../_lib/use-admin-session';
import { AdminSessionProvider } from '../_lib/admin-context';

export type AdminPageKey =
  | 'dashboard'
  | 'portfolio'
  | 'users'
  | 'formula-manager'
  | 'ticker-management'
  | 'api-settings'
  | 'notifications'
  | 'settings-profile';

function AdminGate({ children }: { children: (session: ReturnType<typeof useAdminSession>) => ReactElement }) {
  const session = useAdminSession();

  if (session.status === 'loading') {
    return (
      <div className="admin-page-bg flex h-screen w-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Verifying access…</div>
      </div>
    );
  }

  if (session.status === 'anon') {
    return <AdminLoginForm />;
  }

  if (session.status === 'not-admin') {
    return (
      <div className="admin-page-bg flex h-screen w-full items-center justify-center px-4">
        <div className="admin-card w-full max-w-md p-8 text-center">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Access denied</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account does not have admin privileges.
          </p>
          <button
            type="button"
            onClick={() => void session.signOut()}
            className="admin-green-bg mt-6 inline-flex h-9 items-center justify-center rounded-full px-5 text-sm font-semibold text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (session.status === 'error') {
    return (
      <div className="admin-page-bg flex h-screen w-full items-center justify-center px-4">
        <div className="admin-card w-full max-w-md p-8 text-center">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Something went wrong</h2>
          <p className="mt-2 text-sm text-muted-foreground">{session.error ?? 'Unknown error.'}</p>
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
    'portfolio',
    'users',
    'formula-manager',
    'ticker-management',
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
    if (visitedPages.has('portfolio')) {
      pages.push(pageShell('portfolio', <PortfolioPage dataActive={currentPage === 'portfolio'} />));
    }
    if (visitedPages.has('users')) {
      pages.push(pageShell('users', <UsersPage dataActive={currentPage === 'users'} />));
    }
    if (visitedPages.has('formula-manager')) {
      pages.push(pageShell('formula-manager', <FormulaManager />));
    }
    if (visitedPages.has('ticker-management')) {
      pages.push(
        pageShell('ticker-management', <TickerManagement dataActive={currentPage === 'ticker-management'} />)
      );
    }
    if (visitedPages.has('api-settings')) {
      pages.push(pageShell('api-settings', <APISettings dataActive={currentPage === 'api-settings'} />));
    }
    if (visitedPages.has('notifications')) {
      pages.push(pageShell('notifications', <NotificationsPage dataActive={currentPage === 'notifications'} />));
    }
    if (visitedPages.has('settings-profile')) pages.push(pageShell('settings-profile', <SettingsProfilePage />));
    return pages;
  }, [visitedPages, pageShell, currentPage]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[#0d1b2e]">
      <AdminSidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-none bg-transparent md:my-2 md:mr-2 md:rounded-[20px] md:shadow-[0_8px_40px_rgba(0,0,0,0.28)]">
        <div className="admin-page-bg flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:rounded-[20px]">
          <TopBar currentPage={currentPage} onMenuClick={() => setMobileSidebarOpen(true)} />
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 md:px-8 md:py-7">
            {pageContent}
          </main>
        </div>
      </div>
    </div>
  );
}

