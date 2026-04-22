'use client';

import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase-client';

type Mode = 'signin' | 'forgot';

export default function AdminLoginForm() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
              type="email"
              autoComplete="email"
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
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="admin-input w-full rounded-lg px-3 py-2 text-sm"
                disabled={busy}
              />
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
