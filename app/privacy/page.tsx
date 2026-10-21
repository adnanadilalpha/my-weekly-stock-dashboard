import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { MwsLogo } from '@/app/components/brand/mws-logo';

export const metadata: Metadata = {
  title: 'Privacy Policy · My Weekly Stock',
  description:
    'How My Weekly Stock (MWS) collects, uses, and protects your information across the web and mobile apps.',
  robots: { index: true, follow: true },
};

const LAST_UPDATED = 'October 21, 2026';
const CONTACT_EMAIL = 'contact@myweeklystock.com';

const SECTIONS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: 'overview',
    title: '1. Overview',
    body: (
      <>
        <p>
          My Weekly Stock (“MWS,” “we,” “us,” or “our”) provides market analysis tools,
          portfolio tracking, and related features through our website and mobile
          applications (together, the “Service”).
        </p>
        <p>
          This Privacy Policy explains what information we collect, how we use it, when
          we share it, and the choices you have. It is written for users of MWS and for
          app-store reviewers (including Apple App Store and Google Play).
        </p>
        <p>
          By using the Service, you agree to this policy. If you do not agree, please do
          not use MWS.
        </p>
      </>
    ),
  },
  {
    id: 'scope',
    title: '2. Who this covers',
    body: (
      <>
        <p>This policy applies to:</p>
        <ul>
          <li>The MWS web app (including app.myweeklystock.com and related domains)</li>
          <li>The MWS iOS app</li>
          <li>The MWS Android app</li>
          <li>Sign-in emails and related account communications we send</li>
        </ul>
        <p>
          It does not cover third-party websites or services that we link to (for
          example, market data sources or your email provider). Those have their own
          privacy practices.
        </p>
      </>
    ),
  },
  {
    id: 'collect',
    title: '3. Information we collect',
    body: (
      <>
        <p>We collect only what we need to run and improve MWS.</p>
        <h3>Account and identity</h3>
        <ul>
          <li>
            <strong>Email address</strong> — used to verify access and send a secure
            magic-link sign-in (no password is stored by MWS for standard user login).
          </li>
          <li>
            <strong>Authentication records</strong> — session tokens and account
            identifiers managed by our auth provider so you can stay signed in securely.
          </li>
        </ul>
        <h3>Information you provide in the product</h3>
        <ul>
          <li>
            <strong>Portfolios and holdings</strong> — books, tickers, quantities, cost
            basis, and related notes you enter.
          </li>
          <li>
            <strong>Preferences</strong> — watchlists, hub customizations, and display
            settings.
          </li>
          <li>
            <strong>Ask MWS / chat</strong> — questions and messages you send to the
            in-app assistant, and responses returned to you.
          </li>
        </ul>
        <h3>Usage and device information</h3>
        <ul>
          <li>
            <strong>Product activity</strong> — high-level events such as pages viewed
            and features used, to understand reliability and improve the Service.
          </li>
          <li>
            <strong>Technical logs</strong> — approximate timestamps, error diagnostics,
            and similar operational data needed to keep the Service secure and working.
          </li>
          <li>
            <strong>Mobile app data</strong> — standard device and app identifiers needed
            for push notifications (if you enable them) and app functionality. We do not
            sell this data.
          </li>
        </ul>
        <h3>What we do not sell</h3>
        <p>
          We do not sell your personal information. We do not use your portfolio or chat
          content for third-party advertising.
        </p>
      </>
    ),
  },
  {
    id: 'use',
    title: '4. How we use information',
    body: (
      <>
        <p>We use information to:</p>
        <ul>
          <li>Create and secure your account, and sign you in</li>
          <li>Provide dashboards, charts, portfolio tools, and Ask MWS</li>
          <li>Remember your preferences and restore your session</li>
          <li>Send transactional emails (for example, magic links)</li>
          <li>Send optional product or push notifications you opt into</li>
          <li>Diagnose outages, prevent abuse, and improve performance</li>
          <li>Meet legal, security, and app-store obligations</li>
        </ul>
        <p>
          Market prices, ratings, and similar analysis data shown in MWS are shared
          product content — not your personal data — unless you add personal notes or
          holdings around them.
        </p>
      </>
    ),
  },
  {
    id: 'share',
    title: '5. How we share information',
    body: (
      <>
        <p>
          We share personal information only with service providers who help us operate
          MWS, and only as needed for that purpose:
        </p>
        <ul>
          <li>
            <strong>Infrastructure &amp; database / auth</strong> — hosting and
            authentication (for example, Supabase and our web host)
          </li>
          <li>
            <strong>Email delivery</strong> — sending magic-link and account emails
          </li>
          <li>
            <strong>AI processing</strong> — when you use Ask MWS, your question and the
            minimum context needed to answer may be sent to our AI providers to generate a
            response
          </li>
          <li>
            <strong>Legal / safety</strong> — if required by law, or to protect users,
            the Service, or our rights
          </li>
        </ul>
        <p>
          We do not share your personal account data with advertisers. If the business is
          ever transferred (merger, acquisition), user data may move with it under
          continued confidentiality obligations.
        </p>
      </>
    ),
  },
  {
    id: 'retention',
    title: '6. Retention',
    body: (
      <>
        <p>
          We keep personal data while your account is active and as needed to provide the
          Service. If you delete your account, we remove or anonymize personal data
          associated with that account (portfolios, preferences, chat history, activity
          tied to your user id, and your auth identity), subject to short-term backups and
          any records we must keep for legal or security reasons.
        </p>
        <p>
          Shared market and universe data used by all users is not deleted when you close
          your account, because it is not your personal data.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: '7. Security',
    body: (
      <>
        <p>
          We use industry-standard safeguards appropriate for an online service,
          including encrypted transport (HTTPS), access controls, and restricted
          administrative access. No method of transmission or storage is 100% secure; we
          work to protect your information but cannot guarantee absolute security.
        </p>
        <p>
          Access to MWS may be limited to authorized emails. Please protect your inbox —
          magic links grant access to your account.
        </p>
      </>
    ),
  },
  {
    id: 'rights',
    title: '8. Your choices and rights',
    body: (
      <>
        <p>Depending on where you live, you may have rights to:</p>
        <ul>
          <li>Access the personal data we hold about you</li>
          <li>Correct inaccurate information</li>
          <li>Delete your account and associated personal data</li>
          <li>Export or receive a copy of certain data you provided</li>
          <li>Object to or restrict certain processing</li>
        </ul>
        <p>
          <strong>Account deletion:</strong> Signed-in users can request deletion of
          their account and personal data through the in-app / in-product account deletion
          flow (or by contacting us). Deletion removes your personal portfolios,
          preferences, chat history, activity tied to your account, allowlist access, and
          auth identity. It does not remove shared market data used by other users.
        </p>
        <p>
          To exercise other privacy rights, email us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the email on your
          account. We may need to verify your identity before responding.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: '9. Children',
    body: (
      <p>
        MWS is not directed to children under 13 (or the minimum age required in your
        country), and we do not knowingly collect personal information from children. If
        you believe a child has provided us personal information, contact us and we will
        take appropriate steps to delete it.
      </p>
    ),
  },
  {
    id: 'international',
    title: '10. International processing',
    body: (
      <p>
        We and our service providers may process information in the United States and
        other countries where we operate. Those locations may have different data
        protection laws than your home country. By using MWS, you understand that your
        information may be transferred to and processed in these locations as described
        in this policy.
      </p>
    ),
  },
  {
    id: 'ai',
    title: '11. Ask MWS (AI features)',
    body: (
      <>
        <p>
          Ask MWS is an optional assistant that answers questions using MWS market context
          and, when relevant, information you have already stored in your account (such as
          holdings). Prompts and responses may be processed by third-party AI providers
          solely to generate your answer and operate the feature.
        </p>
        <p>
          Ask MWS does not provide personalized investment advice. Outputs can be wrong or
          incomplete — always do your own research.
        </p>
      </>
    ),
  },
  {
    id: 'disclaimer',
    title: '12. Important product notice',
    body: (
      <p>
        MWS provides educational market analysis and portfolio tools. Nothing in the
        Service is a recommendation to buy, sell, or hold any security. You are solely
        responsible for your investment decisions.
      </p>
    ),
  },
  {
    id: 'changes',
    title: '13. Changes to this policy',
    body: (
      <p>
        We may update this Privacy Policy from time to time. When we do, we will change
        the “Last updated” date at the top of this page. Continued use of MWS after an
        update means you accept the revised policy. For material changes, we may provide
        additional notice in the product or by email when appropriate.
      </p>
    ),
  },
  {
    id: 'contact',
    title: '14. Contact',
    body: (
      <>
        <p>
          Privacy questions or requests:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p>
          Operator: My Weekly Stock (MWS)
          <br />
          Web: app.myweeklystock.com
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
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
          Legal
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600">
          How My Weekly Stock collects, uses, and protects information across web and
          mobile — written for users and for Apple / Google app review.
        </p>
        <p className="mt-4 text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>

        <nav
          aria-label="On this page"
          className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            On this page
          </p>
          <ol className="mt-3 columns-1 gap-x-8 space-y-1.5 text-sm text-slate-700 sm:columns-2">
            {SECTIONS.map((s) => (
              <li key={s.id} className="break-inside-avoid">
                <a
                  href={`#${s.id}`}
                  className="text-slate-700 underline-offset-2 hover:text-slate-950 hover:underline"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                {section.title}
              </h2>
              <div className="privacy-prose mt-3 space-y-3 text-[15px] leading-relaxed text-slate-700 [&_a]:font-medium [&_a]:text-blue-700 [&_a]:underline-offset-2 hover:[&_a]:underline [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-900 [&_li]:mt-1.5 [&_strong]:font-semibold [&_strong]:text-slate-900 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
                {section.body}
              </div>
            </section>
          ))}
        </div>
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
