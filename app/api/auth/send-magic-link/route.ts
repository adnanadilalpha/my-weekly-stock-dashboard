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
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/auth/callback`;
    
    // Check if Resend is enabled - if not, use Supabase's built-in email
    const useResend = process.env.ENABLE_RESEND === 'true' && process.env.RESEND_API_KEY;
    
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
  <title>Sign in to MyWeekly Stock</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); border-radius: 12px 12px 0 0;">
              <div style="display: inline-block; padding: 16px; background-color: rgba(255, 255, 255, 0.2); border-radius: 16px; margin-bottom: 16px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
              </div>
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">MyWeekly Stock</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 24px; font-weight: 600;">Sign in to your account</h2>
              <p style="margin: 0 0 32px; color: #64748b; font-size: 16px; line-height: 1.6;">
                Click the button below to securely sign in to your MyWeekly Stock dashboard. This link will expire in 1 hour.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; margin: 32px 0;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${magicLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                      Sign In to Dashboard
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 24px 0 0; color: #94a3b8; font-size: 14px; line-height: 1.5;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${magicLink}" style="color: #3b82f6; text-decoration: none; word-break: break-all;">${magicLink}</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px; background-color: #f8fafc; border-radius: 0 0 12px 12px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px; color: #64748b; font-size: 14px; text-align: center;">
                This link expires in 1 hour for security reasons.
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 12px; text-align: center;">
                If you didn't request this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Bottom spacing -->
        <table role="presentation" style="width: 100%; margin-top: 24px;">
          <tr>
            <td style="text-align: center; padding: 20px;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                © ${new Date().getFullYear()} MyWeekly Stock. All rights reserved.
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
        
        // Handle Resend domain verification error
        if (errorData.statusCode === 403 && errorData.message?.includes('verify a domain')) {
          return NextResponse.json(
            { 
              error: 'Email service needs domain verification. Please verify your domain at resend.com/domains or contact administrator.',
              details: errorData.message
            },
            { status: 403 }
          );
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
