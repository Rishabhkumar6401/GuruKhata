// Runtime configuration read from env. Functions (not constants) so values
// are read at call time — tests set env before importing the app anyway.

// Used ONLY when JWT_SECRET is unset AND DEV_AUTH=1. Never valid in prod:
// with DEV_AUTH unset and no JWT_SECRET, auth refuses to work at all.
const DEV_JWT_SECRET = 'gurukhata-dev-only-insecure-jwt-secret';

export const devAuthEnabled = () => process.env.DEV_AUTH === '1';

/** @returns {string|null} the JWT signing secret, or null if auth is unconfigured */
export function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (devAuthEnabled()) return DEV_JWT_SECRET;
  return null;
}

const list = (v) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const adminGoogleSubs = () => list(process.env.ADMIN_GOOGLE_SUBS);
export const adminDevNames = () => list(process.env.ADMIN_DEV_NAMES).map((s) => s.toLowerCase());

export function corsOrigins() {
  const origins = list(process.env.CORS_ORIGINS);
  return origins.length ? origins : ['http://localhost:5173'];
}

/**
 * Fatal configuration problems; [] = safe to start. Pure (takes the env) so
 * tests call it directly. server.js refuses to boot when this is non-empty.
 *
 *  - DEV_AUTH=1 (name-only login + a PUBLIC fallback JWT secret) is local-dev
 *    only. A real database (DATABASE_URL) or Lambda (AWS_LAMBDA_FUNCTION_NAME,
 *    set by the Lambda runtime itself) means "not local" -> refuse.
 *  - A real database without JWT_SECRET -> refuse (auth could never work).
 * Empty strings count as unset (the test harness sets DATABASE_URL='').
 * DEV_AUTH is matched exactly like devAuthEnabled() ('1' and nothing else).
 * @returns {string[]}
 */
export function configErrors(env = process.env) {
  const errors = [];
  if (env.DEV_AUTH === '1' && (env.DATABASE_URL || env.AWS_LAMBDA_FUNCTION_NAME)) {
    const where = [env.DATABASE_URL && 'DATABASE_URL', env.AWS_LAMBDA_FUNCTION_NAME && 'AWS_LAMBDA_FUNCTION_NAME']
      .filter(Boolean)
      .join(' and ');
    errors.push(
      `DEV_AUTH=1 is set together with ${where}. DEV_AUTH enables name-only login with no password ` +
        'and is for local development with PGlite only. Unset DEV_AUTH (or unset DATABASE_URL to run locally).'
    );
  }
  if (env.DATABASE_URL && !env.JWT_SECRET) {
    errors.push(
      'DATABASE_URL is set but JWT_SECRET is not. Set JWT_SECRET to a long random value, e.g. ' +
        `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  return errors;
}

/** Throws (with every problem listed) when configErrors() is non-empty. */
export function assertSafeConfig(env = process.env) {
  const errors = configErrors(env);
  if (errors.length) {
    const err = new Error(`[config] FATAL: refusing to start:\n  - ${errors.join('\n  - ')}`);
    err.code = 'UNSAFE_CONFIG';
    throw err;
  }
}

/** Loud boot-time warnings about auth configuration. Called once from server.js. */
export function logAuthConfig() {
  if (!process.env.JWT_SECRET && devAuthEnabled()) {
    console.warn(
      '\n' +
        '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n' +
        '!! [auth] WARNING: JWT_SECRET is not set — using a FIXED, PUBLIC dev      !!\n' +
        '!! secret because DEV_AUTH=1. Anyone can forge tokens. LOCAL DEV ONLY.    !!\n' +
        '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n'
    );
  } else if (!jwtSecret()) {
    console.error(
      '[auth] ERROR: JWT_SECRET is not set (and DEV_AUTH is not 1). All /api/auth/* routes ' +
        'and every authenticated route will answer 500 until JWT_SECRET is configured.'
    );
  }
  if (devAuthEnabled()) {
    console.warn('[auth] DEV_AUTH=1 — POST /api/auth/dev is ENABLED (name-only login). Never set this in production.');
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    console.warn('[auth] GOOGLE_CLIENT_ID is not set — POST /api/auth/google will answer 500.');
  }
}
