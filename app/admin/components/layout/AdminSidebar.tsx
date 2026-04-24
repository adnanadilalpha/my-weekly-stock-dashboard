'use client';

import {
  Activity,
  Bell,
  Database,
  DownloadCloud,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AdminPageKey } from '../AdminPanel';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { getUnreadAdminNotificationCountAction } from '../../_actions/notifications';
import { useAdmin } from '../../_lib/admin-context';

interface AdminSidebarProps {
  currentPage: AdminPageKey;
  onNavigate: (page: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

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

  const navItems: { id: AdminPageKey; label: string; icon: LucideIcon }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'ticker-management', label: 'Ticker Management', icon: Database },
    { id: 'ticker-import', label: 'Ticker Import', icon: DownloadCloud },
    { id: 'formula-manager', label: 'Formula Manager', icon: Activity },
    { id: 'api-settings', label: 'API & Data', icon: Settings },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  return (
    <>
      {mobileOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onCloseMobile}
          aria-label="Close admin menu overlay"
        />
      )}
      <aside
        className={`admin-navy fixed inset-y-0 left-0 z-40 flex h-full w-56 flex-col transition-transform md:static md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header with logo */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4 md:px-6">
          <div className="rounded-lg bg-white p-1">
            <Image src="/logo.png" alt="My Weekly Stock" width={24} height={24} className="h-6 w-6 object-contain" />
          </div>
          <span className="text-base font-semibold text-white">MWS Admin</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-2 px-4 pt-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`relative flex h-10 w-full items-center gap-3 rounded-md px-3 text-left transition-colors ${
                  isActive
                    ? 'bg-[#15803d]/15 text-white'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={18} strokeWidth={1.75} />
                <span className={`text-sm ${isActive ? 'font-semibold' : 'font-normal'}`}>
                  {item.label}
                </span>
                {item.id === 'notifications' && unreadNotifications > 0 && (
                  <span className="ml-auto min-w-[1.25rem] rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-amber-950">
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom: profile + logout */}
        <div className="px-4 pb-4 pt-2">
          <button
            type="button"
            onClick={() => onNavigate('settings-profile')}
            className="mb-2 flex w-full items-center gap-3 rounded-md bg-white/5 px-3 py-3 text-left hover:bg-white/10"
          >
            <div className="admin-green-bg flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white" title={emailDisplay}>
                {emailDisplay || 'Admin User'}
              </div>
              <div className="truncate text-xs text-white/60">Settings &amp; Profile</div>
            </div>
            <Settings size={16} strokeWidth={1.75} className="text-white/70" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center gap-3 border-t border-white/10 px-6 py-4 text-left text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
        >
          <LogOut size={18} strokeWidth={1.75} />
          <span>Logout</span>
        </button>
      </aside>
    </>
  );
}
