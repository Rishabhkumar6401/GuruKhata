// Database helper — lazy pg Pool over DATABASE_URL (Neon Postgres).
//
// ============================================================================
// MULTI-TENANT RULE #1 — EVERY QUERY IS SCOPED BY tutor_id.
//
// Every table hangs off a tutor (directly via tutor_id, or through its
// student/due). ANY query that reads or writes tenant data MUST filter by the
// authenticated tutor's id, e.g.:
//
//     SELECT * FROM students WHERE tutor_id = $1 AND id = $2
//
// Never trust an id from the client without joining/filtering it back to
// req.user.tutor_id. A missing tutor_id filter = one tutor seeing another
// tutor's students and money. No exceptions outside admin routes (which are
// behind requireAdmin and audited in admin_log).
// ============================================================================
//
// The pool is LAZY on purpose: the server must boot and serve /health even
// when DATABASE_URL is unset. We only construct the Pool (and therefore only
// connect) on the first query.

import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn(
    '[db] WARNING: DATABASE_URL is not set. The server will boot and /health will work, ' +
      'but any database query will fail until it is configured (see api/.env.example).'
  );
}

let pool = null;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — cannot query the database.');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // Don't let an idle-client error crash the process.
    pool.on('error', (err) => {
      console.error('[db] idle client error', err);
    });
  }
  return pool;
}

/**
 * Run a parameterized query. Always use $1, $2… params — never interpolate.
 * @param {string} text - SQL with $n placeholders
 * @param {Array} [params]
 * @returns {Promise<import('pg').QueryResult>}
 */
export function query(text, params) {
  return getPool().query(text, params);
}
