'use client';

import { Bell, Inbox } from 'lucide-react';

export default function NotificationsPage() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <div className="admin-card flex min-w-0 flex-col items-center justify-center rounded-2xl px-6 py-14 text-center shadow-sm md:px-8 md:py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Inbox size={28} strokeWidth={1.5} aria-hidden />
        </div>
        <p className="admin-text-main mt-5 text-base font-semibold">You&apos;re all caught up</p>
        <p className="admin-text-muted mt-2 text-sm leading-relaxed">
          When imports finish, API runs complete, or settings need attention, they&apos;ll show here.
        </p>

      </div>
    </div>
  );
}
