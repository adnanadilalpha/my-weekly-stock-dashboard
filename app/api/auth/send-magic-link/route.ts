import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '@/lib/supabase-env';

const {
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
  serviceRoleKey: supabaseServiceRoleKey,
} = getSupabaseConfig();

// Server-side Supabase client with service role for admin operations (if available)
const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Fallback anon client (used only if service role is unavailable)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MOBILE_DEEP_LINK = 'mws://auth-callback';

/** App Store / Play Store review accounts — mobile only; never skip on web. */
const MOBILE_STORE_REVIEW_EMAILS = new Set([
  'weeklystockapple@icloud.com',
  'weeklystockgoogle@gmail.com',
]);

function isMobileRedirect(value: string): boolean {
  return value === MOBILE_DEEP_LINK || value.startsWith(`${MOBILE_DEEP_LINK}?`);
}

function isMobileStoreReviewEmail(email: string): boolean {
  return MOBILE_STORE_REVIEW_EMAILS.has(email.toLowerCase().trim());
}

/** Mobile deep-link or same-site auth callback only — never arbitrary redirects. */
function resolveRedirectTo(
  requested: unknown,
  fallbackWebCallback: string,
): string {
  if (typeof requested !== 'string' || !requested.trim()) return fallbackWebCallback;
  const value = requested.trim();
  if (isMobileRedirect(value)) {
    return value.split('#')[0];
  }
  try {
    const u = new URL(value);
    const hostOk =
      u.hostname === 'app.myweeklystock.com' ||
      u.hostname === 'www.myweeklystock.com' ||
      u.hostname.endsWith('.vercel.app') ||
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1';
    if (hostOk && u.pathname.startsWith('/auth/callback')) {
      return `${u.origin}${u.pathname}${u.search}`;
    }
  } catch {
    // ignore
  }
  return fallbackWebCallback;
}

/**
 * Supabase action_link always goes through https verify, then redirects to Site URL
 * when custom schemes like mws:// are not on the allowlist — so mobile would open web.
 *
 * Email clients need an https:// href. We use /auth/callback?client=mobile which
 * immediately hands off to mws://auth-callback (app verifies the OTP).
 */
function buildMobileDeepLink(hashedToken: string): string {
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type: 'email',
  });
  return `${MOBILE_DEEP_LINK}?${params.toString()}`;
}

function buildMobileBridgeLink(appUrl: string, hashedToken: string): string {
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type: 'email',
    client: 'mobile',
  });
  return `${appUrl.replace(/\/$/, '')}/auth/callback?${params.toString()}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, redirectTo: requestedRedirect } = body ?? {};

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const emailLower = email.toLowerCase().trim();
    const requestedRedirectEarly =
      typeof requestedRedirect === 'string' ? requestedRedirect.trim() : '';
    const isMobileAuthRequest = isMobileRedirect(requestedRedirectEarly);

    // App Store / Play review accounts may sign in on mobile without authorized_users.
    // Web dashboard still requires the allowlist for every email (including these).
    const skipAuthorizedUsersCheck =
      isMobileAuthRequest && isMobileStoreReviewEmail(emailLower);

    if (!skipAuthorizedUsersCheck) {
      // Check if email is authorized. Prefer service-role so this does not depend
      // on public/anon read policies for authorized_users.
      const authClient = supabaseAdmin ?? supabase;
      const { data: authorizedUsers, error: checkError } = await authClient
        .from('authorized_users')
        .select('email, role')
        .ilike('email', emailLower)
        .limit(1);

      if (checkError) {
        console.error('Error checking authorization:', checkError);
        return NextResponse.json(
          { error: 'Unable to verify authorization' },
          { status: 500 }
        );
      }

      if (!authorizedUsers || authorizedUsers.length === 0) {
        return NextResponse.json(
          { error: 'Email not authorized' },
          { status: 403 }
        );
      }
    } else {
      console.log('Skipping authorized_users check for mobile store review email');
    }

    // Generate magic link with Supabase
    // Get the app URL - prioritize request headers and origin for production
    let appUrl: string | undefined;
    
    // Priority 1: Check x-forwarded-host header (Vercel/proxies set this)
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
    if (forwardedHost && !forwardedHost.includes('localhost') && !forwardedHost.includes('127.0.0.1')) {
      appUrl = `${forwardedProto}://${forwardedHost}`;
    }
    
    // Priority 2: Check referer header (where the request came from)
    if (!appUrl || appUrl.includes('localhost')) {
      const referer = request.headers.get('referer');
      if (referer) {
        try {
          const refererUrl = new URL(referer);
          if (refererUrl.origin && !refererUrl.origin.includes('localhost') && !refererUrl.origin.includes('127.0.0.1')) {
            appUrl = refererUrl.origin;
          }
        } catch (e) {
          // Invalid referer URL, continue
        }
      }
    }
    
    // Priority 3: Check request URL origin
    if (!appUrl || appUrl.includes('localhost')) {
      try {
        const requestUrl = new URL(request.url);
        const requestOrigin = requestUrl.origin;
        if (requestOrigin && !requestOrigin.includes('localhost') && !requestOrigin.includes('127.0.0.1')) {
          appUrl = requestOrigin;
        }
      } catch (e) {
        // URL parsing failed, continue to fallbacks
      }
    }
    
    // Priority 4: Check host header
    if (!appUrl || appUrl.includes('localhost')) {
      const host = request.headers.get('host');
      if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
        // Determine protocol based on host or default to https for production
        const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
        appUrl = `${protocol}://${host}`;
      }
    }
    
    // Priority 5: Fallback to environment variables
    if (!appUrl || appUrl.includes('localhost')) {
      if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')) {
        appUrl = process.env.NEXT_PUBLIC_APP_URL;
      } else if (process.env.VERCEL_URL) {
        appUrl = `https://${process.env.VERCEL_URL}`;
      }
    }
    
    // Last resort: localhost for development
    if (!appUrl || appUrl.includes('localhost')) {
      appUrl = 'http://localhost:3000';
    }
    
    const redirectTo = resolveRedirectTo(requestedRedirect, `${appUrl}/auth/callback`);
    console.log('Magic link redirect URL:', redirectTo); // Debug log
    console.log('URL detection details:', {
      forwardedHost: request.headers.get('x-forwarded-host'),
      forwardedProto: request.headers.get('x-forwarded-proto'),
      referer: request.headers.get('referer'),
      host: request.headers.get('host'),
      requestUrl: request.url,
      finalAppUrl: appUrl,
      requestedRedirect: typeof requestedRedirect === 'string' ? requestedRedirect : null,
    });
    
    // Use Resend if explicitly enabled AND API key is available, otherwise use Supabase's built-in email
    // Default to Supabase unless ENABLE_RESEND=true is explicitly set
    const useResend = process.env.ENABLE_RESEND === 'true' && !!process.env.RESEND_API_KEY;
    
    console.log('Email sending configuration:', {
      ENABLE_RESEND: process.env.ENABLE_RESEND,
      hasResendApiKey: !!process.env.RESEND_API_KEY,
      useResend,
      hasServiceRoleKey: !!supabaseServiceRoleKey,
    });
    
    let magicLink: string;
    let mobileBridgeLink: string | null = null;
    const forMobileApp = isMobileRedirect(redirectTo);

    // Mobile must never use Supabase's built-in email — that template always redirects
    // to the web Site URL. Always generate a token and send a custom Resend email.
    if (forMobileApp) {
      if (!useResend || !supabaseAdmin) {
        console.error('Mobile magic link requires ENABLE_RESEND + SUPABASE_SERVICE_ROLE_KEY');
        return NextResponse.json(
          {
            error:
              'Mobile sign-in is not configured. Enable Resend and set SUPABASE_SERVICE_ROLE_KEY.',
          },
          { status: 500 }
        );
      }

      const { data: otpData, error: signInError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: emailLower,
        options: {
          // Keep web-safe redirect for Supabase metadata; email will not use action_link.
          redirectTo: `${appUrl}/auth/callback`,
        },
      });

      const hashedToken = otpData?.properties?.hashed_token;
      if (signInError || !hashedToken) {
        console.error('Error generating mobile magic link:', signInError);
        return NextResponse.json(
          { error: signInError?.message || 'Failed to generate mobile magic link' },
          { status: 500 }
        );
      }

      // HTTPS bridge is the email CTA (email clients block/strip mws:// hrefs).
      // Bridge page immediately opens mws:// — never signs the user into the web app.
      magicLink = buildMobileBridgeLink(appUrl, hashedToken);
      mobileBridgeLink = buildMobileDeepLink(hashedToken);
      console.log('Mobile magic link ready (HTTPS bridge → app deep link)');
    } else if (useResend) {
      console.log('Using Resend for email delivery');
      if (!supabaseAdmin) {
        console.error('Service role key missing - cannot use Resend without it');
        return NextResponse.json(
          { error: 'Service role key required when using Resend. Please set SUPABASE_SERVICE_ROLE_KEY environment variable.' },
          { status: 500 }
        );
      }

      console.log('Generating magic link via Supabase Admin API (no email will be sent by Supabase)');
      const { data: otpData, error: signInError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: emailLower,
        options: {
          redirectTo: redirectTo,
        },
      });

      if (signInError || !otpData?.properties?.action_link) {
        console.error('Error generating magic link with admin API:', signInError);
        return NextResponse.json(
          { error: signInError?.message || 'Failed to generate magic link' },
          { status: 500 }
        );
      }

      magicLink = otpData.properties.action_link;
      console.log('Magic link generated successfully, will send via Resend');
    } else {
      console.log('Using Supabase built-in email delivery');
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: emailLower,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      });

      if (signInError) {
        console.error('Error generating OTP:', signInError);
        return NextResponse.json(
          { error: signInError.message || 'Failed to send magic link' },
          { status: 500 }
        );
      }

      console.log('OTP sent via Supabase email');
      return NextResponse.json({ success: true });
    }

    const ctaLabel = forMobileApp ? 'Open My Weekly Stock App →' : 'Sign In to Dashboard →';
    const introCopy = forMobileApp
      ? 'Click the button below to securely sign in to the My Weekly Stock mobile app. This magic link will expire in <strong>1 hour</strong> for your security.'
      : 'Click the button below to securely access your My Weekly Stock dashboard. This magic link will expire in <strong>1 hour</strong> for your security.';

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Sign in to My Weekly Stock</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <!-- Wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Main Container -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);">
          
          <!-- Header with Gradient -->
          <tr>
            <td style="background: #0a0a0a; padding: 40px 40px 36px; text-align: center;">
              <!-- Icon Container -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <img src="${appUrl.replace(/\/$/, '')}/logo-on-light.svg" alt="My Weekly Stock" width="220" height="55" style="display: block; margin: 0 auto 12px; max-width: 220px; height: auto; border: 0; background: #ffffff; padding: 10px 14px; border-radius: 10px;" />
                    <p style="margin: 0; color: rgba(255, 255, 255, 0.75); font-size: 15px; font-weight: 400;">Your Stock Market Dashboard</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content Section -->
          <tr>
            <td style="padding: 48px 40px;">
              <h2 style="margin: 0 0 12px; color: #0f172a; font-size: 26px; font-weight: 700; line-height: 1.3;">Welcome back!</h2>
              <p style="margin: 0 0 32px; color: #475569; font-size: 16px; line-height: 1.6;">
                ${introCopy}
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px 0 32px;">
                    <a href="${magicLink}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4); transition: all 0.2s;">
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Divider -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding: 24px 0; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 16px; color: #64748b; font-size: 14px; line-height: 1.5;">
                      <strong style="color: #334155;">Button not working?</strong><br>
                      ${forMobileApp
                        ? 'Open this link on your phone to finish signing in to the app:'
                        : 'Copy and paste this link into your browser:'}
                    </p>
                    <p style="margin: 0; padding: 12px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                      <a href="${magicLink}" style="color: #3b82f6; text-decoration: none; word-break: break-all; font-size: 13px; font-family: 'Courier New', monospace;">${magicLink}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Security Footer -->
          <tr>
            <td style="padding: 32px 40px; background: linear-gradient(to bottom, #f8fafc 0%, #f1f5f9 100%); border-top: 1px solid #e2e8f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

                <tr>
                  <td align="center">
                    <p style="margin: 0 0 8px; color: #475569; font-size: 14px; font-weight: 600;">Secure Authentication</p>
                    <p style="margin: 0 0 16px; color: #64748b; font-size: 13px; line-height: 1.5;">
                      This link expires in 1 hour for security reasons.<br>
                      If you didn't request this email, you can safely ignore it.
                    </p>
                    <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                      © ${new Date().getFullYear()} My Weekly Stock. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <!-- Bottom Spacing -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="padding: 24px 0; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                Powered by Supabase Authentication
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const emailText = `
Sign in to My Weekly Stock

${forMobileApp ? 'Click the link below to securely sign in to the mobile app:' : 'Click the link below to securely sign in to your dashboard:'}
${magicLink}
${mobileBridgeLink ? `\nDirect app link:\n${mobileBridgeLink}\n` : ''}
This link expires in 1 hour for security reasons.

If you didn't request this email, you can safely ignore it.
    `;

    // Send email via Resend (only if enabled)
    if (useResend) {
      // Send email via Resend
      const resendApiKey = process.env.RESEND_API_KEY;
      const resendFromEmail = process.env.RESEND_EMAIL_FROM || 'My Weekly Stock <onboarding@resend.dev>';
      
      console.log('Sending email via Resend:', {
        from: resendFromEmail,
        to: emailLower,
      });
      
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: resendFromEmail,
          to: emailLower,
          subject: 'Sign in to My Weekly Stock',
          html: emailHtml,
          text: emailText,
        }),
      });

      if (!resendResponse.ok) {
        const errorData = await resendResponse.json();
        console.error('Resend API error:', errorData);
        
        return NextResponse.json(
          { error: errorData.message || 'Failed to send email via Resend' },
          { status: resendResponse.status }
        );
      }

      const resendData = await resendResponse.json();
      console.log('Email sent successfully via Resend:', resendData);
      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error('Error in send-magic-link:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
