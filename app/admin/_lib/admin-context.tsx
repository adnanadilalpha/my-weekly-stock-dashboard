'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { AdminSession } from './use-admin-session';

const AdminSessionContext = createContext<AdminSession | null>(null);

export function AdminSessionProvider({ value, children }: { value: AdminSession; children: ReactNode }) {
  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

/** Must be called from a component rendered inside AdminSessionProvider. */
export function useAdmin(): AdminSession {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) {
    throw new Error('useAdmin must be used within AdminSessionProvider.');
  }
  return ctx;
}
