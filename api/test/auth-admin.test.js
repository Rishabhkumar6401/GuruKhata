import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, assertPlainMessage } from './helpers.js';

let t;
before(async () => {
  t = await startApp();
});
after(async () => {
  await t.close();
});

test('GET /health needs no auth', async () => {
  const r = await t.api('GET', '/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true });
});

test('dev login: same name (any case) = same tutor, default profile', async () => {
  const a = await t.api('POST', '/api/auth/dev', { body: { name: 'Sunita' } });
  assert.equal(a.status, 200);
  assert.equal(typeof a.body.token, 'string');
  assert.deepEqual(Object.keys(a.body.tutor).sort(), ['id', 'languagePref', 'name', 'phone', 'plan', 'role', 'upiId']);
  assert.equal(a.body.tutor.name, 'Sunita');
  assert.equal(a.body.tutor.role, 'tutor');
  assert.equal(a.body.tutor.plan, 'free');
  assert.equal(a.body.tutor.languagePref, 'en');
  assert.equal(typeof a.body.tutor.id, 'number');

  const b = await t.api('POST', '/api/auth/dev', { body: { name: '  sunita ' } });
  assert.equal(b.status, 200);
  assert.equal(b.body.tutor.id, a.body.tutor.id);

  const me = await t.api('GET', '/api/me', { token: b.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.tutor.id, a.body.tutor.id);
});

test('dev login validation', async () => {
  assert.equal((await t.api('POST', '/api/auth/dev', { body: {} })).status, 400);
  assert.equal((await t.api('POST', '/api/auth/dev', { body: { name: '' } })).status, 400);
  assert.equal((await t.api('POST', '/api/auth/dev', { body: { name: 'x'.repeat(61) } })).status, 400);
  const bad = await t.api('POST', '/api/auth/dev', { body: '{not json' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'Something went wrong with that request. Please try again.');
  assert.equal((await t.api('POST', '/api/auth/dev', { body: { name: '' } })).body.error, 'Name is required.');
});

test('dev login is 404 when DEV_AUTH is not 1', async () => {
  process.env.DEV_AUTH = '0';
  try {
    const r = await t.api('POST', '/api/auth/dev', { body: { name: 'Sunita' } });
    assert.equal(r.status, 404);
  } finally {
    process.env.DEV_AUTH = '1';
  }
});

test('google login: 500 with clear error when GOOGLE_CLIENT_ID unset', async () => {
  const r = await t.api('POST', '/api/auth/google', { body: { idToken: 'x' } });
  assert.equal(r.status, 500);
  assert.match(r.body.error, /GOOGLE_CLIENT_ID/);
});

test('google login: 400 without idToken, 401 for a bogus token', async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  try {
    assert.equal((await t.api('POST', '/api/auth/google', { body: {} })).status, 400);
    const r = await t.api('POST', '/api/auth/google', { body: { idToken: 'not-a-jwt' } });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'Google sign-in failed. Please try again.');
    const missing = await t.api('POST', '/api/auth/google', { body: {} });
    assert.equal(missing.body.error, 'Google sign-in failed. Please try again.');
  } finally {
    process.env.GOOGLE_CLIENT_ID = '';
  }
});

test('protected routes: 401 without / with a bad token', async () => {
  assert.equal((await t.api('GET', '/api/me')).status, 401);
  assert.equal((await t.api('GET', '/api/students', { token: 'garbage' })).status, 401);
  assert.equal((await t.api('GET', '/api/dues', { token: 'garbage' })).status, 401);
});

test('PATCH /api/me updates profile and validates', async () => {
  const { token } = await t.login('Profile Person');
  const r = await t.api('PATCH', '/api/me', {
    token,
    body: { name: 'Mrs. Sharma', phone: '+91 98765 43210', upiId: 'sharma@okaxis', languagePref: 'hi', role: 'admin' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.tutor.name, 'Mrs. Sharma');
  assert.equal(r.body.tutor.phone, '919876543210');
  assert.equal(r.body.tutor.upiId, 'sharma@okaxis');
  assert.equal(r.body.tutor.languagePref, 'hi');
  assert.equal(r.body.tutor.role, 'tutor', 'role must not be self-assignable');

  for (const body of [{ languagePref: 'fr' }, { phone: '12345' }, { upiId: 'no-at-sign' }, { name: '' }, { name: 'x'.repeat(61) }]) {
    const bad = await t.api('PATCH', '/api/me', { token, body });
    assert.equal(bad.status, 400, JSON.stringify(body));
    assertPlainMessage(bad.body.error);
  }

  // Name survives re-login (provider name doesn't overwrite the edited one).
  const again = await t.login('Profile Person');
  assert.equal(again.tutor.name, 'Mrs. Sharma');
});

test('admin: 403 for a tutor, 200 for a bootstrap admin (ADMIN_DEV_NAMES)', async () => {
  const tutor = await t.login('Plain Tutor');
  const forbidden = await t.api('GET', '/api/admin/stats', { token: tutor.token });
  assert.equal(forbidden.status, 403);
  assertPlainMessage(forbidden.body.error);
  assert.equal((await t.api('GET', '/api/admin/tutors', { token: tutor.token })).status, 403);

  const admin = await t.login('root admin');
  assert.equal(admin.tutor.role, 'admin');

  await t.api('POST', '/api/students', { token: tutor.token, body: { name: 'Kid', monthlyFee: 500 } });
  await t.api('GET', '/api/dues', { token: tutor.token });

  const stats = await t.api('GET', '/api/admin/stats', { token: admin.token });
  assert.equal(stats.status, 200);
  for (const k of ['tutors', 'activeTutors7d', 'students', 'duesThisMonth', 'paidThisMonth', 'remindersThisMonth']) {
    assert.equal(typeof stats.body[k], 'number', k);
  }
  assert.ok(stats.body.tutors >= 2);
  assert.ok(stats.body.duesThisMonth >= 1);

  const list = await t.api('GET', '/api/admin/tutors', { token: admin.token });
  assert.equal(list.status, 200);
  assert.equal(list.body.tutors[0].name, 'root admin', 'newest first');
  const plain = list.body.tutors.find((x) => x.id === tutor.tutor.id);
  assert.equal(plain.studentCount, 1);
  assert.equal(plain.plan, 'free');
  assert.ok(plain.createdAt && plain.lastActiveAt);
});

test('unknown route -> 404 JSON', async () => {
  const r = await t.api('GET', '/api/nope');
  assert.equal(r.status, 404);
  assert.equal(r.body.error, 'not found');
});

test('CORS: allowed origin echoed, others not', async () => {
  const ok = await t.api('GET', '/health', { headers: { origin: 'http://localhost:5173' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const no = await t.api('GET', '/health', { headers: { origin: 'https://evil.example' } });
  assert.equal(no.headers.get('access-control-allow-origin'), null);
});

test('F8: tutor phone accepts the Indian trunk prefix 0', async () => {
  const { token } = await t.login('Trunk Prefix Tutor');
  const r = await t.api('PATCH', '/api/me', { token, body: { phone: '098765 43210' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.tutor.phone, '9876543210');
  const bad = await t.api('PATCH', '/api/me', { token, body: { phone: '198765 43210' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'Phone number must be a 10-digit mobile number.');
});
