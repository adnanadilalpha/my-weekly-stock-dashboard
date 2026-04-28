import type { AdminPageKey } from '../AdminPanel';
import { Menu } from 'lucide-react';

interface TopBarProps {
  currentPage: AdminPageKey;
  onMenuClick: () => void;
}

export default function TopBar({ currentPage, onMenuClick }: TopBarProps) {
  const pageNames: Record<AdminPageKey, string> = {
    dashboard: 'Dashboard',
    users: 'User Management',
    'formula-manager': 'Formula Manager',
    'ticker-management': 'Ticker Management',
    'ticker-import': 'Ticker Import',
    'api-settings': 'API & Data Settings',
    notifications: 'Notifications',
    'settings-profile': 'Settings',
  };

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="admin-navy flex h-16 shrink-0 items-center border-b border-white/10 px-4 md:px-8">
      <div className="flex w-full min-w-0 flex-row items-center gap-3">
        <button
          onClick={onMenuClick}
          className="shrink-0 rounded-md border border-white/15 p-2 text-white md:hidden"
          aria-label="Open admin menu"
        >
          <Menu size={18} />
        </button>
        <div className="flex min-w-0 flex-1 flex-row items-center justify-between gap-4">
          <h1 className="truncate text-xl font-semibold tracking-tight text-white md:text-2xl">
            {pageNames[currentPage]}
          </h1>
          <p className="shrink-0 text-right text-sm text-white/60 sm:text-base">{dateLabel}</p>
        </div>
      </div>
    </header>
  );
}
