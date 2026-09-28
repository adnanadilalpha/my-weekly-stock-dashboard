/**
 * MWS uses a single Supabase project (production).
 * Preferred env names keep the `_PROD` suffix for compatibility with existing deploys;
 * unsuffixed names are also accepted.
 */

export type EnvironmentTarget = 'prod';

export function getAppEnv(): EnvironmentTarget {
  return 'prod';
}

function readClientUrl() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL_PROD ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    ''
  );
}

function readClientAnonKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_PROD ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ''
  );
}

function readServerServiceRole() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY_PROD ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ''
  );
}

export function getSupabaseConfig(options?: { requireServiceRole?: boolean }) {
  const url = readClientUrl();
  const anonKey = readClientAnonKey();
  const serviceRoleKey = readServerServiceRole();

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase config. Set NEXT_PUBLIC_SUPABASE_URL_PROD and NEXT_PUBLIC_SUPABASE_ANON_KEY_PROD (or unsuffixed NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).',
    );
  }

  if (options?.requireServiceRole && !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY_PROD (or SUPABASE_SERVICE_ROLE_KEY).',
    );
  }

  return {
    target: 'prod' as const,
    url,
    anonKey,
    serviceRoleKey,
  };
}
