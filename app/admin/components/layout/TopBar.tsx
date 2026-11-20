import type { AdminPageKey } from '../AdminPanel';
import { Menu } from 'lucide-react';

interface TopBarProps {
  currentPage: AdminPageKey;
  onMenuClick: () => void;
}

const pageMeta: Record<AdminPageKey, { title: string; subtitle?: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Analytics' },
  portfolio: { title: 'Portfolio', subtitle: 'Recap performance' },
  users: { title: 'Users', subtitle: 'Allowlist & access' },
  'formula-manager': { title: 'Formulas', subtitle: 'Scoring & ratings' },
  'ticker-management': { title: 'Tickers', subtitle: 'Universe & refresh' },
  'api-settings': { title: 'API & Data', subtitle: 'Providers & pipeline' },
  notifications: { title: 'Activity', subtitle: 'Ops feed' },
  'settings-profile': { title: 'Settings', subtitle: 'Account & preferences' },
};

export default function TopBar({ currentPage, onMenuClick }: TopBarProps) {
  const meta = pageMeta[currentPage];

  return (
    <header className="admin-topbar sticky top-0 z-20 flex h-16 shrink-0 items-center border-b border-black/6 px-4 md:px-8">
      <div className="mx-auto flex w-full max-w-7xl min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white/80 text-foreground md:hidden"
          aria-label="Open admin menu"
        >
          <Menu size={18} strokeWidth={1.75} />
        </button>
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            {meta.title}
          </h1>
          {meta.subtitle ? (
            <p className="truncate text-[12px] text-muted-foreground md:hidden">{meta.subtitle}</p>
          ) : null}
        </div>
        {meta.subtitle ? (
          <p className="ml-auto hidden text-[13px] text-muted-foreground md:block">{meta.subtitle}</p>
        ) : null}
      </div>
    </header>
  );
}
