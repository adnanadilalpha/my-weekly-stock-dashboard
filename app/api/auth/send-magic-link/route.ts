import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Server-side Supabase client with service role for admin operations (if available)
const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Client-side Supabase for checking authorization
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const emailLower = email.toLowerCase().trim();

    // Check if email is authorized
    const { data: authorizedUsers, error: checkError } = await supabase
      .from('authorized_users')
      .select('email, role')
      .eq('email', emailLower)
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

    // Generate magic link with Supabase
    // Get the app URL - prioritize request origin (most reliable), then env vars
    let appUrl: string | undefined;
    
    // First, try to get from request URL (most reliable for production)
    try {
      const requestUrl = new URL(request.url);
      const requestOrigin = requestUrl.origin;
      if (requestOrigin && !requestOrigin.includes('localhost') && !requestOrigin.includes('127.0.0.1')) {
        appUrl = requestOrigin;
      }
    } catch (e) {
      // URL parsing failed, continue to fallbacks
    }
    
    // Fallback to environment variables
    if (!appUrl || appUrl.includes('localhost')) {
      if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')) {
        appUrl = process.env.NEXT_PUBLIC_APP_URL;
      } else if (process.env.VERCEL_URL) {
        appUrl = `https://${process.env.VERCEL_URL}`;
      } else {
        // Last resort: try request headers
        const host = request.headers.get('host');
        if (host && !host.includes('localhost')) {
          appUrl = `https://${host}`;
        } else {
          appUrl = 'http://localhost:3000';
        }
      }
    }
    
    // Ensure appUrl is always defined
    if (!appUrl) {
      appUrl = 'http://localhost:3000';
    }
    
    const redirectTo = `${appUrl}/auth/callback`;
    console.log('Magic link redirect URL:', redirectTo); // Debug log
    
    // Use Resend if explicitly enabled AND API key is available, otherwise use Supabase's built-in email
    // Default to Supabase unless ENABLE_RESEND=true is explicitly set
    const useResend = process.env.ENABLE_RESEND === 'true' && !!process.env.RESEND_API_KEY;
    
    let magicLink: string;

    if (useResend) {
      // Only generate magic link if using Resend (we need the link to send via Resend)
      // Try to use admin API if service role key is available
      if (supabaseAdmin) {
        try {
          const { data: otpData, error: signInError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: emailLower,
            options: {
              redirectTo: redirectTo,
            },
          });

          if (signInError || !otpData?.properties?.action_link) {
            console.error('Error generating magic link with admin API:', signInError);
            // Fallback to regular OTP
            throw new Error('Admin API failed, using fallback');
          }

          magicLink = otpData.properties.action_link;
        } catch (error) {
          // Fallback: Use regular OTP flow
          console.log('Using fallback OTP method');
          const { error: signInError } = await supabase.auth.signInWithOtp({
            email: emailLower,
            options: {
              emailRedirectTo: redirectTo,
              shouldCreateUser: false,
            },
          });

          if (signInError) {
            console.error('Error generating OTP:', signInError);
            return NextResponse.json(
              { error: signInError.message || 'Failed to generate magic link' },
              { status: 500 }
            );
          }

          // For fallback, we'll construct a link that will work with the callback
          magicLink = `${redirectTo}?email=${encodeURIComponent(emailLower)}`;
        }
      } else {
        // No service role key - use regular OTP
        const { error: signInError } = await supabase.auth.signInWithOtp({
          email: emailLower,
          options: {
            emailRedirectTo: redirectTo,
            shouldCreateUser: false,
          },
        });

        if (signInError) {
          console.error('Error generating OTP:', signInError);
          return NextResponse.json(
            { error: signInError.message || 'Failed to generate magic link' },
            { status: 500 }
          );
        }

        // Construct callback link - user will authenticate via the OTP sent by Supabase
        magicLink = `${redirectTo}?email=${encodeURIComponent(emailLower)}`;
      }
    } else {
      // Use Supabase's built-in email - just trigger the OTP
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: emailLower,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      });

      if (signInError) {
        console.error('Error generating OTP:', signInError);
        return NextResponse.json(
          { error: signInError.message || 'Failed to send magic link' },
          { status: 500 }
        );
      }

      // Supabase will send the email automatically, we don't need the magic link
      return NextResponse.json({ success: true });
    }
    
    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Sign in to MyWeekly Stock</title>
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
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #8b5cf6 100%); padding: 48px 40px 40px; text-align: center;">
              <!-- Icon Container -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <div style="display: inline-block; width: 64px; height: 64px; background-color: rgba(255, 255, 255, 0.25); border-radius: 20px; padding: 16px; backdrop-filter: blur(10px);">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                      </svg>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -1px; line-height: 1.2;">MyWeekly Stock</h1>
                    <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px; font-weight: 400;">Your Stock Market Dashboard</p>
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
                Click the button below to securely access your MyWeekly Stock dashboard. This magic link will expire in <strong>1 hour</strong> for your security.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 8px 0 32px;">
                    <a href="${magicLink}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4); transition: all 0.2s;">
                      Sign In to Dashboard →
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
                      Copy and paste this link into your browser:
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
                  <td align="center" style="padding-bottom: 16px;">
                    <div style="display: inline-block; width: 40px; height: 40px; background-color: #dbeafe; border-radius: 10px; padding: 10px;">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 8px; color: #475569; font-size: 14px; font-weight: 600;">Secure Authentication</p>
                    <p style="margin: 0 0 16px; color: #64748b; font-size: 13px; line-height: 1.5;">
                      This link expires in 1 hour for security reasons.<br>
                      If you didn't request this email, you can safely ignore it.
                    </p>
                    <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                      © ${new Date().getFullYear()} MyWeekly Stock. All rights reserved.
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
Sign in to MyWeekly Stock

Click the link below to securely sign in to your dashboard:
${magicLink}

This link expires in 1 hour for security reasons.

If you didn't request this email, you can safely ignore it.
    `;

    // Send email via Resend (only if enabled)
    if (useResend) {
      // Send email via Resend
      const resendApiKey = process.env.RESEND_API_KEY;
      
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'MyWeekly Stock <onboarding@resend.dev>',
          to: emailLower,
          subject: 'Sign in to MyWeekly Stock',
          html: emailHtml,
          text: emailText,
        }),
      });

      if (!resendResponse.ok) {
        const errorData = await resendResponse.json();
        console.error('Resend API error:', errorData);
        
        // Handle Resend domain verification error - fallback to Supabase
        if (errorData.statusCode === 403 && errorData.message?.includes('verify a domain')) {
          console.log('Resend domain not verified, falling back to Supabase email');
          // Fallback to Supabase's built-in email
          const { error: signInError } = await supabase.auth.signInWithOtp({
            email: emailLower,
            options: {
              emailRedirectTo: redirectTo,
              shouldCreateUser: false,
            },
          });

          if (signInError) {
            console.error('Error generating OTP with Supabase fallback:', signInError);
            return NextResponse.json(
              { error: signInError.message || 'Failed to send magic link' },
              { status: 500 }
            );
          }

          return NextResponse.json({ success: true, fallback: 'supabase' });
        }
        
        return NextResponse.json(
          { error: errorData.message || 'Failed to send email' },
          { status: resendResponse.status }
        );
      }

      return NextResponse.json({ success: true });
    } else {
      // Use Supabase's built-in email (default)
      // The magic link was already generated above, Supabase will send the email automatically
      // We just need to return success
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
