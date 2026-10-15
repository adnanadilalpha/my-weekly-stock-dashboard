'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const MOBILE_DEEP_LINK = 'mws://auth-callback';

function buildDeepLink(tokenHash: string, type: string): string {
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type: type === 'magiclink' ? 'email' : type || 'email',
  });
  return `${MOBILE_DEEP_LINK}?${params.toString()}`;
}

function MobileCallbackContent() {
  const searchParams = useSearchParams();
  const [opened, setOpened] = useState(false);

  const tokenHash = searchParams.get('token_hash')?.trim() ?? '';
  const type = searchParams.get('type')?.trim() || 'email';

  const deepLink = useMemo(() => {
    if (!tokenHash) return null;
    return buildDeepLink(tokenHash, type);
  }, [tokenHash, type]);

  useEffect(() => {
    if (!deepLink) return;
    // Hand off to the installed native app; do not verify on the web.
    window.location.href = deepLink;
    setOpened(true);
  }, [deepLink]);

  if (!tokenHash) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 px-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-slate-900">Link invalid</h1>
          <p className="mt-2 text-sm text-slate-600">
            This sign-in link is missing required parameters. Request a new magic link from the
            My Weekly Stock app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 px-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-slate-900">
          {opened ? 'Opening the app…' : 'Continue in the app'}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          If the My Weekly Stock app does not open automatically, tap the button below.
        </p>
        {deepLink ? (
          <a
            href={deepLink}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Open My Weekly Stock
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default function MobileAuthCallback() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
          <p className="text-sm font-medium text-slate-600">Preparing app sign-in…</p>
        </div>
      }
    >
      <MobileCallbackContent />
    </Suspense>
  );
}
