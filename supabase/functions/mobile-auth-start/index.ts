/**
 * Mobile magic-link start (allowlist + Resend email, same template family as web).
 *
 * POST JSON: { email: string, redirectTo?: string }
 * Secrets:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto on Edge)
 *   RESEND_API_KEY, RESEND_EMAIL_FROM (optional)
 *   ENABLE_RESEND=true (same gate as web)
 *   PUBLIC_WEB_APP_URL (logo/assets host for the HTML email, e.g. https://your-app.vercel.app)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const { email, redirectTo } = await req.json();
    if (!email || typeof email !== 'string') {
      return json({ error: 'Email is required' }, 400);
    }
    const emailLower = email.toLowerCase().trim();
    const redirect =
      typeof redirectTo === 'string' && redirectTo.length > 0
        ? redirectTo
        : 'mws://auth-callback';

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!url || !serviceKey) {
      return json({ error: 'Server misconfigured' }, 500);
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authorizedUsers, error: checkError } = await admin
      .from('authorized_users')
      .select('email')
      .ilike('email', emailLower)
      .limit(1);

    if (checkError) {
      console.error('authorized_users check failed', checkError);
      return json({ error: 'Unable to verify authorization' }, 500);
    }
    if (!authorizedUsers?.length) {
      return json({ error: 'Email not authorized' }, 403);
    }

    const useResend =
      (Deno.env.get('ENABLE_RESEND') ?? '').toLowerCase() === 'true' &&
      !!Deno.env.get('RESEND_API_KEY');

    // Prefer Resend (same as web). Fall back to Supabase OTP only if Resend is off.
    if (!useResend) {
      console.warn(
        'ENABLE_RESEND/RESEND_API_KEY not set — falling back to Supabase built-in email',
      );
      const { error: otpError } = await admin.auth.signInWithOtp({
        email: emailLower,
        options: {
          emailRedirectTo: redirect,
          shouldCreateUser: true,
        },
      });
      if (otpError) {
        console.error('signInWithOtp failed', otpError);
        return json({ error: otpError.message }, 500);
      }
      return json({ ok: true, provider: 'supabase' });
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: emailLower,
      options: {
        redirectTo: redirect,
      },
    });

    const magicLink = linkData?.properties?.action_link;
    if (linkError || !magicLink) {
      console.error('generateLink failed', linkError);
      return json({ error: linkError?.message || 'Failed to generate magic link' }, 500);
    }

    const webAppUrl = (
      Deno.env.get('PUBLIC_WEB_APP_URL') ||
      Deno.env.get('NEXT_PUBLIC_APP_URL') ||
      ''
    ).replace(/\/$/, '');
    const logoUrl = webAppUrl
      ? `${webAppUrl}/logo-on-light.svg`
      : '';

    const emailHtml = buildEmailHtml({ magicLink, logoUrl });
    const emailText = `
Sign in to My Weekly Stock

Click the link below to securely sign in:
${magicLink}

This link expires in 1 hour for security reasons.

If you didn't request this email, you can safely ignore it.
`.trim();

    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const resendFromEmail =
      Deno.env.get('RESEND_EMAIL_FROM') || 'My Weekly Stock <onboarding@resend.dev>';

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
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
      const errorData = await resendResponse.json().catch(() => ({}));
      console.error('Resend API error:', errorData);
      return json(
        { error: (errorData as { message?: string }).message || 'Failed to send email via Resend' },
        resendResponse.status,
      );
    }

    console.log('Mobile magic link sent via Resend', { to: emailLower, redirect });
    return json({ ok: true, provider: 'resend' });
  } catch (e) {
    console.error(e);
    return json({ error: 'Invalid request' }, 400);
  }
});

function buildEmailHtml(input: { magicLink: string; logoUrl: string }): string {
  const { magicLink, logoUrl } = input;
  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="My Weekly Stock" width="220" height="55" style="display: block; margin: 0 auto 12px; max-width: 220px; height: auto; border: 0; background: #ffffff; padding: 10px 14px; border-radius: 10px;" />`
    : `<div style="margin: 0 auto 12px; color: #ffffff; font-size: 22px; font-weight: 700;">My Weekly Stock</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to My Weekly Stock</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: #0a0a0a; padding: 40px 40px 36px; text-align: center;">
              ${logoBlock}
              <p style="margin: 0; color: rgba(255, 255, 255, 0.75); font-size: 15px; font-weight: 400;">Your Stock Market Dashboard</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 48px 40px;">
              <h2 style="margin: 0 0 12px; color: #0f172a; font-size: 26px; font-weight: 700; line-height: 1.3;">Welcome back!</h2>
              <p style="margin: 0 0 32px; color: #475569; font-size: 16px; line-height: 1.6;">
                Click the button below to securely sign in to My Weekly Stock. This magic link will expire in <strong>1 hour</strong> for your security.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px 0 32px;">
                    <a href="${magicLink}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);">
                      Open My Weekly Stock →
                    </a>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding: 24px 0; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 16px; color: #64748b; font-size: 14px; line-height: 1.5;">
                      <strong style="color: #334155;">Button not working?</strong><br>
                      Copy and paste this link into your browser or open it on your phone:
                    </p>
                    <p style="margin: 0; padding: 12px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                      <a href="${magicLink}" style="color: #3b82f6; text-decoration: none; word-break: break-all; font-size: 13px; font-family: 'Courier New', monospace;">${magicLink}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px; background: linear-gradient(to bottom, #f8fafc 0%, #f1f5f9 100%); border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px; color: #475569; font-size: 14px; font-weight: 600; text-align: center;">Secure Authentication</p>
              <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5; text-align: center;">
                This link expires in 1 hour. If you didn't request this email, you can safely ignore it.
              </p>
              <p style="margin: 16px 0 0; color: #94a3b8; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} My Weekly Stock. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
