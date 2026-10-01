// Database helper — one `query(text, params) -> { rows, rowCount }` interface
// over two drivers:
//
//   DATABASE_URL set   -> pg Pool (production / Neon). Apply db/schema.sql
//                         yourself: psql "$DATABASE_URL" -f db/schema.sql
//   DATABASE_URL unset -> PGlite (real Postgres compiled to WASM), persisted to
//                         api/.pglite-data (override with PGLITE_DATA_DIR).
//                         db/schema.sql is applied automatically on first use
//                         (it is idempotent, so it runs on every boot and also
//                         picks up later ALTER TABLE ... IF NOT EXISTS lines).
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
// req.tutor.id. A missing tutor_id filter = one tutor seeing another tutor's
// students and money. A row owned by someone else must look exactly like a
// row that does not exist (404). No exceptions outside admin routes (which
// are behind requireAdmin and audited in admin_log).
// ============================================================================
//
// Both drivers are LAZY: nothing connects until the first query, so the
// server boots and serves /health with no database at all.
//
// Type note: pg returns BIGINT/COUNT as strings, PGlite as numbers; NUMERIC is
// a string in both. Callers normalise with Number() (see lib/mappers.js) and
// cast COUNT(*) to ::int in SQL.

import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(here, '../../db/schema.sql');
const DEFAULT_PGLITE_DIR = path.resolve(here, '../.pglite-data');

export const driverName = process.env.DATABASE_URL ? 'pg' : 'pglite';

function pgliteDir() {
  return process.env.PGLITE_DATA_DIR || DEFAULT_PGLITE_DIR;
}

if (driverName === 'pg') {
  console.log('[db] driver: pg (DATABASE_URL is set)');
} else {
  console.log(
    `[db] driver: PGlite (DATABASE_URL is unset) — local WASM Postgres at ${pgliteDir()}. ` +
      'Set DATABASE_URL to use a real Postgres/Neon instead.'
  );
}

let driverPromise = null;

async function createPgDriver() {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  // Don't let an idle-client error crash the process.
  pool.on('error', (err) => {
    console.error('[db] idle client error', err);
  });
  const wrap = (r) => ({ rows: r.rows, rowCount: r.rowCount ?? 0 });
  return {
    async query(text, params) {
      return wrap(await pool.query(text, params));
    },
    async transaction(fn) {
      const client = await pool.connect();
      let broken = null;
      try {
        await client.query('BEGIN');
        const result = await fn({ query: async (text, params) => wrap(await client.query(text, params)) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        // A client whose ROLLBACK fails is in an unknown state: destroy it, don't pool it.
        await client.query('ROLLBACK').catch((rbErr) => {
          broken = rbErr;
        });
        throw err;
      } finally {
        client.release(broken || undefined);
      }
    },
    close: () => pool.end(),
  };
}

async function createPgliteDriver() {
  let PGlite;
  try {
    ({ PGlite } = await import('@electric-sql/pglite'));
  } catch (err) {
    throw new Error(
      'DATABASE_URL is unset and @electric-sql/pglite is not installed ' +
        '(it is a devDependency — run `npm install` in api/), or set DATABASE_URL.',
      { cause: err }
    );
  }
  const dir = pgliteDir();
  if (!dir.startsWith('memory://')) mkdirSync(dir, { recursive: true });
  const db = await PGlite.create(dir);
  const schema = await readFile(SCHEMA_PATH, 'utf8');
  await db.exec(schema);
  console.log(`[db] PGlite ready (schema applied from ${SCHEMA_PATH})`);
  const wrap = (r) => ({ rows: r.rows, rowCount: r.affectedRows ?? r.rows.length });
  return {
    async query(text, params) {
      return wrap(await db.query(text, params));
    },
    // PGlite is a single connection: transaction() holds it exclusively, so
    // queries from other requests wait until COMMIT/ROLLBACK (never interleave).
    transaction: (fn) => db.transaction((tx) => fn({ query: async (text, params) => wrap(await tx.query(text, params)) })),
    close: () => db.close(),
  };
}

function getDriver() {
  if (!driverPromise) {
    const p = driverName === 'pg' ? createPgDriver() : createPgliteDriver();
    driverPromise = p;
    // A failed init must not be cached forever — retry on the next query.
    p.catch(() => {
      if (driverPromise === p) driverPromise = null;
    });
  }
  return driverPromise;
}

/** Eagerly initialise the driver (applies the schema on PGlite). */
export async function initDb() {
  await getDriver();
}

/**
 * Run a parameterized query. Always use $1, $2… params — never interpolate.
 * @param {string} text - SQL with $n placeholders
 * @param {Array} [params]
 * @returns {Promise<{ rows: object[], rowCount: number }>}
 */
export async function query(text, params) {
  const driver = await getDriver();
  return driver.query(text, params);
}

/**
 * Run fn(tx) in ONE transaction: COMMIT when it resolves, ROLLBACK when it
 * throws. tx.query has the same (text, params) -> { rows, rowCount } shape as
 * query(). Use tx.query (never the global query) inside fn.
 * @template T
 * @param {(tx: { query: typeof query }) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function transaction(fn) {
  const driver = await getDriver();
  return driver.transaction(fn);
}

/** Close the pool / PGlite instance (tests, graceful shutdown). */
export async function closeDb() {
  if (!driverPromise) return;
  const driver = await driverPromise;
  driverPromise = null;
  await driver.close();
}
