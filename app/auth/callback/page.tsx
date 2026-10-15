'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase-client';

const SUPPORTED_EMAIL_OTP_TYPES: EmailOtpType[] = [
  'signup',
  'invite',
  'recovery',
  'email_change',
  'email',
];

function isSupportedEmailOtpType(value: string): value is EmailOtpType {
  return SUPPORTED_EMAIL_OTP_TYPES.includes(value as EmailOtpType);
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobileDeepLink, setMobileDeepLink] = useState<string | null>(null);

  const client = searchParams.get('client');
  const tokenHash = searchParams.get('token_hash');
  const isMobileHandoff = client === 'mobile' && !!tokenHash;

  const otpType: EmailOtpType = useMemo(() => {
    const otpTypeParam = searchParams.get('type');
    const normalizedOtpType = otpTypeParam === 'magiclink' ? 'email' : otpTypeParam;
    return normalizedOtpType && isSupportedEmailOtpType(normalizedOtpType)
      ? normalizedOtpType
      : 'email';
  }, [searchParams]);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (error) {
          console.error('Auth error:', error, errorDescription);
          router.push('/?error=auth_failed');
          return;
        }

        // Mobile app magic links: hand token to the native app. Do NOT create a web session.
        if (isMobileHandoff && tokenHash) {
          const params = new URLSearchParams({
            token_hash: tokenHash,
            type: otpType,
          });
          const deepLink = `mws://auth-callback?${params.toString()}`;
          setMobileDeepLink(deepLink);
          window.location.href = deepLink;
          return;
        }

        const code = searchParams.get('code');

        if (code) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.error('Error exchanging code:', exchangeError);
            router.push('/?error=auth_failed');
            return;
          }

          if (data.session) {
            router.push('/');
            return;
          }
        }

        if (tokenHash) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });

          if (verifyError) {
            console.error('Error verifying magic link:', verifyError);
            router.push('/?error=auth_failed');
            return;
          }

          router.push('/');
          return;
        }

        if (typeof window !== 'undefined' && window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          const hashError = hashParams.get('error');

          if (hashError) {
            console.error('Auth error:', hashError);
            router.push('/?error=auth_failed');
            return;
          }

          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (sessionError) {
              console.error('Error setting session:', sessionError);
              router.push('/?error=auth_failed');
              return;
            }

            router.push('/');
            return;
          }
        }

        router.push('/');
      } catch (err) {
        console.error('Error handling auth callback:', err);
        router.push('/?error=auth_failed');
      }
    };

    handleAuthCallback();
  }, [router, searchParams, isMobileHandoff, tokenHash, otpType]);

  if (isMobileHandoff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 px-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-slate-900">Opening the app…</h1>
          <p className="mt-2 text-sm text-slate-600">
            If My Weekly Stock does not open automatically, tap the button below. Stay in the app —
            do not continue in the browser.
          </p>
          {mobileDeepLink ? (
            <a
              href={mobileDeepLink}
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Open My Weekly Stock
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
      <div className="flex flex-col items-center space-y-4">
        <svg className="h-8 w-8 animate-spin text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="font-medium text-slate-600">Completing sign in...</p>
      </div>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
          <div className="flex flex-col items-center space-y-4">
            <svg className="h-8 w-8 animate-spin text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="font-medium text-slate-600">Loading...</p>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
