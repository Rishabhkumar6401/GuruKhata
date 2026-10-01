import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, assertPlainMessage } from './helpers.js';

let t;
let A; // tutor A
let B; // tutor B
before(async () => {
  t = await startApp();
  A = await t.login('Tutor A');
  B = await t.login('Tutor B');
});
after(async () => {
  await t.close();
});

test('student CRUD', async () => {
  const c = await t.api('POST', '/api/students', {
    token: A.token,
    body: { name: ' Riya ', parentName: 'Mr. Gupta', parentPhone: '98765-43210', subject: 'Maths', monthlyFee: 1500.5, dueDay: 10 },
  });
  assert.equal(c.status, 201);
  assert.deepEqual(c.body.student, {
    id: c.body.student.id,
    name: 'Riya',
    parentName: 'Mr. Gupta',
    parentPhone: '9876543210',
    subject: 'Maths',
    monthlyFee: 1500.5,
    dueDay: 10,
    active: true,
  });
  const id = c.body.student.id;

  const d = await t.api('POST', '/api/students', { token: A.token, body: { name: 'aarav', monthlyFee: 800 } });
  assert.equal(d.status, 201);
  assert.equal(d.body.student.dueDay, 5, 'default dueDay');
  assert.equal(d.body.student.parentPhone, null);

  const list = await t.api('GET', '/api/students', { token: A.token });
  assert.equal(list.status, 200);
  assert.deepEqual(
    list.body.students.map((s) => s.name),
    ['aarav', 'Riya'],
    'sorted by name, case-insensitive'
  );

  const p = await t.api('PATCH', `/api/students/${id}`, {
    token: A.token,
    body: { monthlyFee: 2000, subject: '', parentPhone: '919876543210', id: 999 },
  });
  assert.equal(p.status, 200);
  assert.equal(p.body.student.id, id);
  assert.equal(p.body.student.monthlyFee, 2000);
  assert.equal(p.body.student.subject, null);
  assert.equal(p.body.student.parentPhone, '919876543210');

  const del = await t.api('DELETE', `/api/students/${id}`, { token: A.token });
  assert.equal(del.status, 204);
  const active = await t.api('GET', '/api/students', { token: A.token });
  assert.deepEqual(active.body.students.map((s) => s.name), ['aarav']);
  const all = await t.api('GET', '/api/students?active=all', { token: A.token });
  assert.equal(all.body.students.length, 2);
  assert.equal(all.body.students.find((s) => s.id === id).active, false);

  // reactivate via PATCH
  const re = await t.api('PATCH', `/api/students/${id}`, { token: A.token, body: { active: true } });
  assert.equal(re.body.student.active, true);
});

test('student validation 400s', async () => {
  const bad = [
    {},
    { name: 'x' }, // monthlyFee missing
    { name: '', monthlyFee: 100 },
    { name: 'x'.repeat(61), monthlyFee: 100 },
    { name: 'x', monthlyFee: -1 },
    { name: 'x', monthlyFee: 1_000_001 },
    { name: 'x', monthlyFee: 'abc' },
    { name: 'x', monthlyFee: 100, dueDay: 0 },
    { name: 'x', monthlyFee: 100, dueDay: 29 },
    { name: 'x', monthlyFee: 100, dueDay: 2.5 },
    { name: 'x', monthlyFee: 100, parentPhone: '12345' },
    { name: 'x', monthlyFee: 100, parentPhone: '449876543210' },
    { name: 'x', monthlyFee: 100, parentPhone: 'call me' },
  ];
  for (const body of bad) {
    const r = await t.api('POST', '/api/students', { token: A.token, body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assertPlainMessage(r.body.error);
  }
  const ok = await t.api('POST', '/api/students', {
    token: A.token,
    body: { name: 'Edge', monthlyFee: 1_000_000, dueDay: 28 },
  });
  assert.equal(ok.status, 201);
  const p = await t.api('PATCH', `/api/students/${ok.body.student.id}`, { token: A.token, body: { active: 'no' } });
  assert.equal(p.status, 400);
  assertPlainMessage(p.body.error);
});

test('F6: student errors are plain English the web can show as-is', async () => {
  const msg = async (method, path, body) => (await t.api(method, path, { token: A.token, body })).body.error;
  assert.equal(await msg('POST', '/api/students', { name: 'x', monthlyFee: -1 }), 'Monthly fee must be between ₹0 and ₹10,00,000.');
  assert.equal(await msg('POST', '/api/students', { name: 'x' }), 'Monthly fee is required.');
  assert.equal(await msg('POST', '/api/students', { monthlyFee: 100 }), "Student's name is required.");
  assert.equal(
    await msg('POST', '/api/students', { name: 'x', monthlyFee: 100, parentPhone: '12345' }),
    "Parent's WhatsApp number must be a 10-digit mobile number."
  );
  assert.equal(await msg('POST', '/api/students', { name: 'x', monthlyFee: 100, dueDay: 31 }), 'Fee due day must be a number from 1 to 28.');
  assert.equal(await msg('POST', '/api/students', ['not', 'an', 'object']), 'Something went wrong with that request. Please try again.');
  const nf = await msg('PATCH', '/api/students/99999999', { name: 'y' });
  assertPlainMessage(nf);
  assert.equal(nf, 'This student was not found. They may have been removed.');
});

test('F8: Indian trunk prefix 0 is accepted on a parent phone ("098765 43210")', async () => {
  const c = await t.api('POST', '/api/students', {
    token: A.token,
    body: { name: 'Trunk Zero', monthlyFee: 100, parentPhone: '098765 43210' },
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.equal(c.body.student.parentPhone, '9876543210');
  const p = await t.api('PATCH', `/api/students/${c.body.student.id}`, { token: A.token, body: { parentPhone: '0-91234-56789' } });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(p.body.student.parentPhone, '9123456789');
  // Only a single leading 0 on an 11-digit number is a trunk prefix.
  for (const parentPhone of ['19876543210', '0098765432100', '919876543210 0']) {
    const r = await t.api('POST', '/api/students', { token: A.token, body: { name: 'x', monthlyFee: 100, parentPhone } });
    assert.equal(r.status, 400, parentPhone);
  }
});

test('tenant isolation: tutor B gets 404 on tutor A student', async () => {
  const c = await t.api('POST', '/api/students', { token: A.token, body: { name: 'Private', monthlyFee: 100 } });
  const id = c.body.student.id;

  const p = await t.api('PATCH', `/api/students/${id}`, { token: B.token, body: { name: 'Hacked' } });
  assert.equal(p.status, 404);
  const emptyPatch = await t.api('PATCH', `/api/students/${id}`, { token: B.token, body: {} });
  assert.equal(emptyPatch.status, 404);
  const d = await t.api('DELETE', `/api/students/${id}`, { token: B.token });
  assert.equal(d.status, 404);

  const listB = await t.api('GET', '/api/students?active=all', { token: B.token });
  assert.equal(listB.body.students.length, 0);

  // untouched for A
  const listA = await t.api('GET', '/api/students', { token: A.token });
  const s = listA.body.students.find((x) => x.id === id);
  assert.equal(s.name, 'Private');
  assert.equal(s.active, true);

  // non-numeric / missing ids are 404, never 500
  assert.equal((await t.api('PATCH', '/api/students/abc', { token: A.token, body: {} })).status, 404);
  assert.equal((await t.api('DELETE', '/api/students/99999999', { token: A.token })).status, 404);
});
