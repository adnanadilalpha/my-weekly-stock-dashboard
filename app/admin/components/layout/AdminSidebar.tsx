'use client';

import {
  Activity,
  Bell,
  Briefcase,
  Database,
  LayoutDashboard,
  LogOut,
  Settings2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AdminPageKey } from '../AdminPanel';
import { useEffect, useState } from 'react';
import { getUnreadAdminNotificationCountAction } from '../../_actions/notifications';
import { useAdmin } from '../../_lib/admin-context';
import { MwsLogo } from '@/app/components/brand/mws-logo';

interface AdminSidebarProps {
  currentPage: AdminPageKey;
  onNavigate: (page: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

type NavItem = { id: AdminPageKey; label: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

export default function AdminSidebar({
  currentPage,
  onNavigate,
  mobileOpen,
  onCloseMobile,
}: AdminSidebarProps) {
  const { admin, signOut, getAccessToken } = useAdmin();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const emailDisplay = admin?.email ?? '';
  const initial = emailDisplay.charAt(0).toUpperCase() || 'A';

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const token = await getAccessToken();
        const res = await getUnreadAdminNotificationCountAction(token);
        if (cancelled || !res.ok) return;
        setUnreadNotifications(res.data);
      } catch {
        if (!cancelled) setUnreadNotifications(0);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 45_000);
    const onDirty = () => void tick();
    window.addEventListener('mws-admin-notifications-dirty', onDirty);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('mws-admin-notifications-dirty', onDirty);
    };
  }, [getAccessToken, currentPage]);

  const groups: NavGroup[] = [
    {
      label: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
      ],
    },
    {
      label: 'Market',
      items: [
        { id: 'ticker-management', label: 'Tickers', icon: Database },
        { id: 'formula-manager', label: 'Formulas', icon: Activity },
        { id: 'api-settings', label: 'API & Data', icon: Settings2 },
      ],
    },
    {
      label: 'Access',
      items: [{ id: 'users', label: 'Users', icon: Users }],
    },
  ];

  return (
    <>
      {mobileOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] md:hidden"
          onClick={onCloseMobile}
          aria-label="Close admin menu overlay"
        />
      )}
      <aside
        className={`admin-navy fixed inset-y-0 left-0 z-40 flex h-full w-60 flex-col transition-transform duration-300 ease-out md:static md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 px-5">
          <MwsLogo variant="mark" onLight={false} className="h-8 w-8 rounded-[10px] shadow-sm" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[15px] font-semibold tracking-tight text-white">MWS</div>
            <div className="truncate text-[11px] font-medium text-white/40">Admin</div>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-1">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="admin-nav-label">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      data-active={isActive}
                      className="admin-nav-item"
                    >
                      <Icon size={17} strokeWidth={isActive ? 2 : 1.75} />
                      <span className={`text-[13.5px] ${isActive ? 'font-semibold' : 'font-medium'}`}>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/8 px-3 py-3">
          <button
            type="button"
            onClick={() => onNavigate('notifications')}
            data-active={currentPage === 'notifications'}
            className="admin-nav-item mb-1"
          >
            <Bell size={17} strokeWidth={currentPage === 'notifications' ? 2 : 1.75} />
            <span
              className={`text-[13.5px] ${
                currentPage === 'notifications' ? 'font-semibold' : 'font-medium'
              }`}
            >
              Activity
            </span>
            {unreadNotifications > 0 && (
              <span className="ml-auto min-w-5 rounded-full bg-emerald-400/95 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-emerald-950">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onNavigate('settings-profile')}
            className={`mb-1 flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2.5 text-left transition-colors ${
              currentPage === 'settings-profile'
                ? 'bg-white/10 text-white'
                : 'text-white/70 hover:bg-white/6 hover:text-white'
            }`}
          >
            <div className="admin-green-bg flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-[0_0_0_2px_rgba(255,255,255,0.08)]">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-white" title={emailDisplay}>
                {emailDisplay || 'Admin'}
              </div>
              <div className="truncate text-[11px] text-white/40">Settings</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-9 w-full items-center gap-3 rounded-[12px] px-3 text-left text-[13px] font-medium text-white/45 transition-colors hover:bg-white/6 hover:text-white"
          >
            <LogOut size={16} strokeWidth={1.75} />
            <span>Log out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
