import type { Metadata } from 'next';
import Link from 'next/link';
import { MwsLogo } from '@/app/components/brand/mws-logo';

export const metadata: Metadata = {
  title: 'Support · My Weekly Stock',
  description:
    'Get help with My Weekly Stock — account access, the web app, and iOS / Android.',
  robots: { index: true, follow: true },
};

const SUPPORT_EMAIL = 'contact@myweeklystock.com';

const TOPICS: { title: string; body: string }[] = [
  {
    title: 'Sign-in & magic links',
    body: 'If you did not receive a magic link, check spam/junk, confirm you are using your authorized email, and request a new link from the sign-in screen. Links expire for security — request a fresh one if yours no longer works.',
  },
  {
    title: 'Web app',
    body: 'For dashboard, portfolio, or chart issues on the website, include the page you were on, what you expected, and a screenshot if you can.',
  },
  {
    title: 'iOS & Android',
    body: 'Include your device model, OS version, and app version. Note whether the issue happens on Wi‑Fi, cellular, or both.',
  },
  {
    title: 'Account & privacy',
    body: 'For account deletion or privacy requests, email us from the address on your MWS account. See our Privacy Policy for what we store and how deletion works.',
  },
];

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-linear-to-b from-slate-50 via-white to-slate-50 text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3 rounded-lg outline-offset-2">
            <MwsLogo variant="mark" className="h-9 w-9 rounded-xl" />
            <span className="text-sm font-semibold tracking-tight text-slate-900 sm:text-[15px]">
              My Weekly Stock
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Help
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Support
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600">
          We’re here to help with access, the web app, and the iOS / Android apps. Reach
          us by email — we read every message.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Email us
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('MWS Support')}`}
            className="mt-2 inline-block text-2xl font-semibold tracking-tight text-blue-700 underline-offset-4 hover:underline sm:text-3xl"
          >
            {SUPPORT_EMAIL}
          </a>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Typical reply time is within 1–2 business days. For faster help, include your
            account email, platform (web / iOS / Android), and a short description of the
            issue.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('MWS Support')}`}
            className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            Compose email
          </a>
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">
            Common topics
          </h2>
          <ul className="mt-5 space-y-4">
            {TOPICS.map((topic) => (
              <li
                key={topic.title}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
              >
                <h3 className="text-[15px] font-semibold text-slate-900">{topic.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{topic.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-slate-50/80 px-5 py-5">
          <h2 className="text-[15px] font-semibold text-slate-900">Privacy &amp; data</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            How we handle account data, chat, and deletion is described in our{' '}
            <Link href="/privacy" className="font-medium text-blue-700 underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        <p className="mt-8 text-sm text-slate-500">
          MWS is educational market analysis — not personalized investment advice.
        </p>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} My Weekly Stock</span>
          <div className="flex gap-4">
            <Link href="/support" className="hover:text-slate-800">
              Support
            </Link>
            <Link href="/privacy" className="hover:text-slate-800">
              Privacy
            </Link>
            <Link href="/" className="hover:text-slate-800">
              Home
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
