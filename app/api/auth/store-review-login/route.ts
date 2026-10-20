import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '@/lib/supabase-env';

/**
 * Mobile App Store / Play Store review sign-in.
 * These accounts exist in Supabase Auth but cannot receive email — so we mint a
 * session via admin generateLink + verifyOtp (no email sent).
 *
 * Web must not use this. Only the listed review emails are accepted.
 */

const STORE_REVIEW_EMAILS = new Set([
  'weeklystockapple@icloud.com',
  'weeklystockgoogle@gmail.com',
]);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const emailLower = String(body?.email ?? '')
      .toLowerCase()
      .trim();

    if (!emailLower || !STORE_REVIEW_EMAILS.has(emailLower)) {
      return NextResponse.json({ error: 'Not a store review account' }, { status: 403 });
    }

    const { url, anonKey, serviceRoleKey } = getSupabaseConfig();
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Store review sign-in is not configured (missing service role).' },
        { status: 500 },
      );
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anon = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: emailLower,
    });

    const hashedToken = linkData?.properties?.hashed_token;
    if (linkError || !hashedToken) {
      console.error('[store-review-login] generateLink failed', linkError);
      return NextResponse.json(
        { error: linkError?.message || 'Failed to create review session' },
        { status: 500 },
      );
    }

    const { data: sessionData, error: verifyError } = await anon.auth.verifyOtp({
      type: 'email',
      token_hash: hashedToken,
    });

    const session = sessionData?.session;
    if (verifyError || !session?.access_token || !session.refresh_token) {
      console.error('[store-review-login] verifyOtp failed', verifyError);
      return NextResponse.json(
        { error: verifyError?.message || 'Failed to verify review session' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at ?? null,
      email: session.user?.email ?? emailLower,
      user_id: session.user?.id ?? null,
    });
  } catch (e) {
    console.error('[store-review-login]', e);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
