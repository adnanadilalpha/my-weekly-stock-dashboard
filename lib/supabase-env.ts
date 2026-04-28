type EnvironmentTarget = 'dev' | 'prod';

const nodeEnv = process.env.NODE_ENV ?? 'development';

export function getAppEnv(): EnvironmentTarget {
  const configured = (
    process.env.NEXT_PUBLIC_APP_ENV ??
    process.env.APP_ENV ??
    ''
  ).toLowerCase();
  if (configured === 'dev' || configured === 'prod') {
    return configured;
  }

  // Safe default: local/dev runs point to dev data.
  return nodeEnv === 'production' ? 'prod' : 'dev';
}

function readClientUrl(target: EnvironmentTarget) {
  if (target === 'prod') {
    return (
      process.env.NEXT_PUBLIC_SUPABASE_URL_PROD ??
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      ''
    );
  }

  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL_DEV ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    ''
  );
}

function readClientAnonKey(target: EnvironmentTarget) {
  if (target === 'prod') {
    return (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_PROD ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      ''
    );
  }

  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ''
  );
}

function readServerServiceRole(target: EnvironmentTarget) {
  if (target === 'prod') {
    return (
      process.env.SUPABASE_SERVICE_ROLE_KEY_PROD ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      ''
    );
  }

  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY_DEV ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ''
  );
}

function assertProdSafety(target: EnvironmentTarget) {
  if (target !== 'prod') return;

  // This guard runs in both server and browser bundles. Browser code only
  // receives NEXT_PUBLIC_* env vars, so support both forms explicitly.
  const allowProdFromLocal =
    process.env.ALLOW_PROD_FROM_LOCAL === 'true' ||
    process.env.NEXT_PUBLIC_ALLOW_PROD_FROM_LOCAL === 'true';
  if (nodeEnv !== 'production' && !allowProdFromLocal) {
    throw new Error(
      'Refusing to use production Supabase outside production runtime. Set ALLOW_PROD_FROM_LOCAL=true only when intentionally testing prod.'
    );
  }
}

export function getSupabaseConfig(options?: { requireServiceRole?: boolean }) {
  const target = getAppEnv();
  assertProdSafety(target);

  const suffix = target === 'prod' ? 'PROD' : 'DEV';
  const url = readClientUrl(target);
  const anonKey = readClientAnonKey(target);
  const serviceRoleKey = readServerServiceRole(target);

  if (!url || !anonKey) {
    throw new Error(
      `Missing Supabase config for APP_ENV=${target}. Set NEXT_PUBLIC_SUPABASE_URL_${suffix} and NEXT_PUBLIC_SUPABASE_ANON_KEY_${suffix}.`
    );
  }

  if (options?.requireServiceRole && !serviceRoleKey) {
    throw new Error(
      `Missing SUPABASE_SERVICE_ROLE_KEY_${suffix} for APP_ENV=${target}.`
    );
  }

  return {
    target,
    url,
    anonKey,
    serviceRoleKey,
  };
}
