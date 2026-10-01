// Test harness: boots the real Express app on an ephemeral port against a
// FRESH PGlite database in a temp dir (one per test file / process), and
// talks to it with global fetch. No supertest.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';

/**
 * The web app shows { error } to the teacher verbatim, so every 4xx message
 * must be a plain-English sentence: capitalised, ending in punctuation, with
 * no camelCase field names, routes, snake_case or format jargon.
 */
export function assertPlainMessage(msg) {
  assert.equal(typeof msg, 'string', `error message is a string: ${JSON.stringify(msg)}`);
  assert.match(msg, /^[A-Z]/, `starts with a capital letter: "${msg}"`);
  assert.match(msg, /[.!?]$/, `is a full sentence: "${msg}"`);
  assert.doesNotMatch(msg, /\b[a-z]+[A-Z][A-Za-z]*\b/, `no camelCase field names: "${msg}"`);
  assert.doesNotMatch(msg, /\/|_|YYYY|\bnull\b|\bundefined\b|\bJSON\b|\binteger\b/, `no jargon: "${msg}"`);
}

export async function startApp() {
  const dir = await mkdtemp(path.join(tmpdir(), 'gurukhata-test-'));

  // Set BEFORE importing the app. Empty strings (not delete) so that
  // dotenv — which never overrides an existing key — can't pull a real
  // DATABASE_URL / GOOGLE_CLIENT_ID out of api/.env into the tests.
  process.env.DATABASE_URL = '';
  process.env.GOOGLE_CLIENT_ID = '';
  process.env.PGLITE_DATA_DIR = dir;
  process.env.DEV_AUTH = '1';
  process.env.JWT_SECRET = 'test-secret';
  process.env.ADMIN_DEV_NAMES = 'Root Admin';
  process.env.ADMIN_GOOGLE_SUBS = '';
  process.env.LOG_REQUESTS = '0';

  const { default: app } = await import('../src/server.js');
  const db = await import('../src/db.js');
  await db.initDb();

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, urlPath, { token, body, headers = {} } = {}) {
    const res = await fetch(base + urlPath, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, body: json, headers: res.headers };
  }

  async function login(name) {
    const r = await api('POST', '/api/auth/dev', { body: { name } });
    if (r.status !== 200) throw new Error(`dev login failed: ${r.status} ${JSON.stringify(r.body)}`);
    return { token: r.body.token, tutor: r.body.tutor };
  }

  async function close() {
    await new Promise((resolve) => server.close(resolve));
    await db.closeDb();
    await rm(dir, { recursive: true, force: true });
  }

  return { base, api, login, db, close };
}

/** Current month 'YYYY-MM' and day in IST, computed independently of src/. */
export function istNow() {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .split('-');
  return { year: Number(y), month: `${y}-${m}`, day: Number(d) };
}

/** 'YYYY-MM' n months before `month`. */
export function monthsBefore(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
