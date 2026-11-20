'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Clarity from '@microsoft/clarity';

const PROJECT_ID = (process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ?? '').trim();

/** Opt-in on localhost so prod heatmaps stay clean. Set NEXT_PUBLIC_CLARITY_ENABLE_DEV=true to test. */
function shouldInitClarity(): boolean {
  if (!PROJECT_ID) return false;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  const isLocal =
    host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  if (isLocal) {
    return (process.env.NEXT_PUBLIC_CLARITY_ENABLE_DEV ?? '').toLowerCase().trim() === 'true';
  }
  return true;
}

/**
 * Microsoft Clarity — client-only, single init.
 * Tags surface (admin vs app) on route changes for filtering in the Clarity dashboard.
 */
export function MicrosoftClarity() {
  const pathname = usePathname();
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !shouldInitClarity()) return;
    started.current = true;
    Clarity.init(PROJECT_ID);
    // Cookie consent: project is assumed configured for standard analytics cookies.
    // If Clarity project requires explicit consent, call Clarity.consentV2() from your CMP.
    Clarity.consentV2({ ad_Storage: 'denied', analytics_Storage: 'granted' });
  }, []);

  useEffect(() => {
    if (!started.current || !pathname) return;
    const surface = pathname.startsWith('/admin') ? 'admin' : 'app';
    Clarity.setTag('surface', surface);
    Clarity.setTag('path', pathname);
  }, [pathname]);

  return null;
}
