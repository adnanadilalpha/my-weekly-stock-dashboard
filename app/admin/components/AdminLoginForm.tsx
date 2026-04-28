'use client';

import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase-client';

type Mode = 'signin' | 'forgot';

export default function AdminLoginForm() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const signInPromise = supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      const timeoutPromise = new Promise<{ error: Error }>((resolve) =>
        setTimeout(() => resolve({ error: new Error('Request timed out. Check your connection and Supabase configuration.') }), 15000)
      );
      const result = (await Promise.race([signInPromise, timeoutPromise])) as Awaited<typeof signInPromise> | { error: Error };
      if ('error' in result && result.error) {
        const msg = result.error.message;
        console.error('[admin-login] sign-in error:', result.error);
        setError(msg.includes('Invalid login') ? 'Invalid email or password.' : msg);
      }
      // On success, AdminGate re-runs via onAuthStateChange.
    } catch (e) {
      console.error('[admin-login] unexpected error:', e);
      setError(e instanceof Error ? e.message : 'Unexpected error.');
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/admin`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo,
      });
      if (error) {
        setError(error.message);
      } else {
        setInfo('If an account exists for that email, a password reset link has been sent.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center admin-page-bg px-4">
      <div className="admin-card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <h1 className="admin-text-main text-2xl font-semibold">Admin Sign In</h1>
          <p className="admin-text-muted mt-1 text-sm">
            {mode === 'signin' ? 'Enter your credentials to continue.' : 'Enter your email to receive a reset link.'}
          </p>
        </div>

        <form onSubmit={mode === 'signin' ? handleSignIn : handleForgot} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="admin-text-main mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="admin@example.com"
              spellCheck={false}
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="admin-input w-full rounded-lg px-3 py-2 text-sm"
              disabled={busy}
            />
          </div>

          {mode === 'signin' && (
            <div>
              <label htmlFor="admin-password" className="admin-text-main mb-1 block text-sm font-medium">
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="admin-input w-full rounded-lg px-3 py-2 pr-10 text-sm"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={busy}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="admin-text-muted absolute inset-y-0 right-0 flex w-10 items-center justify-center disabled:opacity-60"
                >
                  {showPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.11 1 12c.75-1.78 1.87-3.35 3.23-4.62" />
                      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.89 11 8a10.96 10.96 0 0 1-1.68 2.79" />
                      <path d="M14.12 14.12a3 3 0 0 1-4.24-4.24" />
                      <path d="m1 1 22 22" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path d="M2.06 12C3.79 7.89 8.06 4 13.06 4s9.27 3.89 11 8c-1.73 4.11-6 8-11 8s-9.27-3.89-11-8z" />
                      <circle cx="13.06" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-400">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="admin-green-bg w-full rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Send reset link'}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          {mode === 'signin' ? (
            <button
              type="button"
              className="admin-text-muted hover:underline"
              onClick={() => {
                setMode('forgot');
                setError(null);
                setInfo(null);
                setShowPassword(false);
              }}
            >
              Forgot password?
            </button>
          ) : (
            <button
              type="button"
              className="admin-text-muted hover:underline"
              onClick={() => {
                setMode('signin');
                setError(null);
                setInfo(null);
                setShowPassword(false);
              }}
            >
              Back to sign in
            </button>
          )}
        </div>

        <p className="admin-text-muted mt-6 text-center text-xs">
          Admin access is by invitation only. Contact an existing admin for access.
        </p>
      </div>
    </div>
  );
}
