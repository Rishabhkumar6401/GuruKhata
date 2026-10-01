import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, istNow, monthsBefore, assertPlainMessage } from './helpers.js';

let t;
let A;
let B;
const now = istNow();

async function addStudent(tok, body) {
  const r = await t.api('POST', '/api/students', { token: tok, body });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.student;
}

before(async () => {
  t = await startApp();
  A = await t.login('Dues Tutor A');
  B = await t.login('Dues Tutor B');
  await t.api('PATCH', '/api/me', { token: A.token, body: { upiId: 'tutora@okhdfc', name: 'Sunita Ma\'am' } });
});
after(async () => {
  await t.close();
});

test('lazy generation creates current-month dues once (idempotent)', async () => {
  const s1 = await addStudent(A.token, { name: 'Aarav', parentPhone: '9876543210', monthlyFee: 1500, dueDay: 1 });
  const s2 = await addStudent(A.token, { name: 'Bina', monthlyFee: 1000.5, dueDay: 28 });
  const gone = await addStudent(A.token, { name: 'Zed', monthlyFee: 700 });
  await t.api('DELETE', `/api/students/${gone.id}`, { token: A.token }); // inactive: no due

  const r1 = await t.api('GET', '/api/dues', { token: A.token });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.month, now.month);
  assert.equal(r1.body.dues.length, 2);
  const r2 = await t.api('GET', '/api/dues', { token: A.token });
  await t.api('GET', '/api/dues/uncollected', { token: A.token });
  assert.equal(r2.body.dues.length, 2, 'no duplicates on repeat GET');
  assert.deepEqual(
    r2.body.dues.map((d) => d.id),
    r1.body.dues.map((d) => d.id)
  );
  const { rows } = await t.db.query('SELECT count(*)::int AS n FROM dues');
  assert.equal(Number(rows[0].n), 2);

  const d1 = r1.body.dues.find((d) => d.studentId === s1.id);
  assert.deepEqual(Object.keys(d1).sort(), [
    'amount', 'id', 'month', 'overdue', 'paidAt', 'parentPhone', 'paymentMode', 'receiptNo', 'status', 'studentId', 'studentName', 'subject',
  ]);
  assert.equal(d1.amount, 1500);
  assert.equal(d1.status, 'due');
  assert.equal(d1.studentName, 'Aarav');
  assert.equal(d1.overdue, now.day > 1);
  const d2 = r1.body.dues.find((d) => d.studentId === s2.id);
  assert.equal(d2.amount, 1000.5);
  assert.equal(d2.overdue, false, 'dueDay 28 is never passed before the 29th');

  assert.deepEqual(r1.body.summary, {
    expected: 2500.5,
    collected: 0,
    pending: 2500.5,
    paidCount: 0,
    dueCount: 2,
    overdueCount: now.day > 1 ? 1 : 0,
  });

  // a different month with no dues is empty (no lazy generation for it)
  const past = await t.api('GET', `/api/dues?month=${monthsBefore(now.month, 1)}`, { token: A.token });
  assert.equal(past.status, 200);
  assert.equal(past.body.dues.length, 0);
});

test('month validation', async () => {
  for (const m of ['2026-13', '2026-1', 'oct', '2026-00']) {
    const r = await t.api('GET', `/api/dues?month=${m}`, { token: A.token });
    assert.equal(r.status, 400, m);
  }
});

test('pay assigns sequential receipt numbers, is idempotent; unpay never reuses', async () => {
  const s3 = await addStudent(A.token, { name: 'Chetan', monthlyFee: 300 });
  const { body } = await t.api('GET', '/api/dues', { token: A.token });
  const [x, y, z] = body.dues;
  assert.ok(x && y && z && s3);
  const year = now.year;

  assert.equal((await t.api('POST', `/api/dues/${x.id}/pay`, { token: A.token, body: {} })).status, 400);
  assert.equal((await t.api('POST', `/api/dues/${x.id}/pay`, { token: A.token, body: { mode: 'gold' } })).status, 400);

  const p1 = await t.api('POST', `/api/dues/${x.id}/pay`, { token: A.token, body: { mode: 'upi' } });
  assert.equal(p1.status, 200);
  assert.equal(p1.body.due.status, 'paid');
  assert.equal(p1.body.due.receiptNo, `RC-${year}-0001`);
  assert.equal(p1.body.due.paymentMode, 'upi');
  assert.equal(p1.body.due.overdue, false);
  assert.ok(p1.body.due.paidAt);

  // idempotent: same receipt, seq not advanced
  const p1again = await t.api('POST', `/api/dues/${x.id}/pay`, { token: A.token, body: { mode: 'cash' } });
  assert.equal(p1again.status, 200);
  assert.deepEqual(p1again.body.due, p1.body.due);

  const p2 = await t.api('POST', `/api/dues/${y.id}/pay`, { token: A.token, body: { mode: 'cash' } });
  assert.equal(p2.body.due.receiptNo, `RC-${year}-0002`);

  // unpay: number cleared, NOT reused
  const u = await t.api('POST', `/api/dues/${y.id}/unpay`, { token: A.token });
  assert.equal(u.status, 200);
  assert.equal(u.body.due.status, 'due');
  assert.equal(u.body.due.receiptNo, null);
  assert.equal(u.body.due.paidAt, null);
  assert.equal(u.body.due.paymentMode, null);
  const u2 = await t.api('POST', `/api/dues/${y.id}/unpay`, { token: A.token });
  assert.equal(u2.status, 200, 'unpay of an unpaid due is a no-op');

  const p3 = await t.api('POST', `/api/dues/${z.id}/pay`, { token: A.token, body: { mode: 'bank' } });
  assert.equal(p3.body.due.receiptNo, `RC-${year}-0003`);
  const p4 = await t.api('POST', `/api/dues/${y.id}/pay`, { token: A.token, body: { mode: 'other' } });
  assert.equal(p4.body.due.receiptNo, `RC-${year}-0004`, 're-pay gets a NEW number');

  // concurrent double-tap on one due -> exactly one receipt number consumed
  const s4 = await addStudent(A.token, { name: 'Dev', monthlyFee: 100 });
  const list = await t.api('GET', '/api/dues', { token: A.token });
  const w = list.body.dues.find((d) => d.studentId === s4.id);
  const [c1, c2] = await Promise.all([
    t.api('POST', `/api/dues/${w.id}/pay`, { token: A.token, body: { mode: 'upi' } }),
    t.api('POST', `/api/dues/${w.id}/pay`, { token: A.token, body: { mode: 'upi' } }),
  ]);
  assert.equal(c1.body.due.receiptNo, `RC-${year}-0005`);
  assert.equal(c2.body.due.receiptNo, `RC-${year}-0005`);

  // B's numbering is independent
  const sb = await addStudent(B.token, { name: 'B kid', monthlyFee: 50 });
  const lb = await t.api('GET', '/api/dues', { token: B.token });
  const db = lb.body.dues.find((d) => d.studentId === sb.id);
  const pb = await t.api('POST', `/api/dues/${db.id}/pay`, { token: B.token, body: { mode: 'cash' } });
  assert.equal(pb.body.due.receiptNo, `RC-${year}-0001`);

  const sum = await t.api('GET', '/api/dues', { token: A.token });
  assert.equal(sum.body.summary.paidCount, 4);
  assert.equal(sum.body.summary.dueCount, 0);
});

test('waive: due -> waived, idempotent; paid cannot be waived; unpay reverts waive', async () => {
  const s = await addStudent(A.token, { name: 'Esha', monthlyFee: 400 });
  const list = await t.api('GET', '/api/dues', { token: A.token });
  const d = list.body.dues.find((x) => x.studentId === s.id);

  const w1 = await t.api('POST', `/api/dues/${d.id}/waive`, { token: A.token });
  assert.equal(w1.status, 200);
  assert.equal(w1.body.due.status, 'waived');
  assert.equal(w1.body.due.overdue, false);
  assert.equal((await t.api('POST', `/api/dues/${d.id}/waive`, { token: A.token })).status, 200);
  assert.equal(
    (await t.api('POST', `/api/dues/${d.id}/pay`, { token: A.token, body: { mode: 'upi' } })).status,
    409,
    'cannot pay a waived due'
  );
  const after = await t.api('GET', '/api/dues', { token: A.token });
  assert.equal(after.body.summary.expected, after.body.summary.collected + after.body.summary.pending);

  const u = await t.api('POST', `/api/dues/${d.id}/unpay`, { token: A.token });
  assert.equal(u.body.due.status, 'due');

  const paid = list.body.dues.find((x) => x.status === 'paid');
  assert.equal((await t.api('POST', `/api/dues/${paid.id}/waive`, { token: A.token })).status, 409);
});

test('uncollected: every unpaid due across months up to current, oldest first', async () => {
  const C = await t.login('Uncollected Tutor');
  const s1 = await addStudent(C.token, { name: 'Old Debt', monthlyFee: 1000 });
  const s2 = await addStudent(C.token, { name: 'New Kid', monthlyFee: 250.25 });
  const prev = monthsBefore(now.month, 2);
  // Past-month dues are normally made by the cron; insert directly.
  await t.db.query(`INSERT INTO dues (student_id, month, amount, status) VALUES ($1, $2, 900, 'due')`, [s1.id, prev]);
  await t.db.query(`INSERT INTO dues (student_id, month, amount, status) VALUES ($1, $2, 50, 'paid')`, [
    s2.id,
    monthsBefore(now.month, 1),
  ]);
  // a future month must be excluded
  await t.db.query(`INSERT INTO dues (student_id, month, amount, status) VALUES ($1, '2999-01', 5, 'due')`, [s1.id]);

  const r = await t.api('GET', '/api/dues/uncollected', { token: C.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 3);
  assert.equal(r.body.total, 900 + 1000 + 250.25);
  assert.equal(r.body.dues[0].month, prev, 'oldest first');
  assert.equal(r.body.dues[0].overdue, true, 'past month is overdue');
  assert.ok(r.body.dues.every((d) => d.status === 'due'));

  // tenant: A's uncollected doesn't include C's
  const ra = await t.api('GET', '/api/dues/uncollected', { token: A.token });
  assert.ok(ra.body.dues.every((d) => d.studentName !== 'Old Debt'));
});

test('remind: wa.me link + reminders row; 400 without parent phone', async () => {
  const withPhone = await addStudent(A.token, { name: 'Farhan', parentPhone: '98765 00001', monthlyFee: 1500 });
  const noPhone = await addStudent(A.token, { name: 'Gita', monthlyFee: 1500 });
  const list = await t.api('GET', '/api/dues', { token: A.token });
  const dp = list.body.dues.find((d) => d.studentId === withPhone.id);
  const dn = list.body.dues.find((d) => d.studentId === noPhone.id);

  const r = await t.api('POST', `/api/dues/${dp.id}/remind`, { token: A.token, body: {} });
  assert.equal(r.status, 200);
  const label = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${now.month}-01T00:00:00Z`)
  );
  assert.match(r.body.message, /Farhan/);
  assert.ok(r.body.message.includes(label), `message has month label "${label}"`);
  assert.match(r.body.message, /₹1,500/);
  assert.match(r.body.message, /tutora@okhdfc/);
  assert.match(r.body.message, /Sunita Ma'am/);
  const url = new URL(r.body.waLink);
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/919876500001');
  assert.equal(url.searchParams.get('text'), r.body.message);

  const hi = await t.api('POST', `/api/dues/${dp.id}/remind`, { token: A.token, body: { lang: 'hi' } });
  assert.equal(hi.status, 200);
  assert.match(hi.body.message, /नमस्ते/);
  assert.equal((await t.api('POST', `/api/dues/${dp.id}/remind`, { token: A.token, body: { lang: 'fr' } })).status, 400);

  const { rows } = await t.db.query(
    `SELECT channel, template_used FROM reminders WHERE due_id = $1 ORDER BY id`,
    [dp.id]
  );
  assert.deepEqual(
    rows.map((x) => [x.channel, x.template_used]),
    [
      ['wa_link', 'reminder_en'],
      ['wa_link', 'reminder_hi'],
    ]
  );

  const n = await t.api('POST', `/api/dues/${dn.id}/remind`, { token: A.token, body: {} });
  assert.equal(n.status, 400);
  assert.equal(n.body.error, "Add the parent's WhatsApp number first.");

  // cash-only tutor (no UPI id) can still remind — the UPI line is just omitted
  const sb = await addStudent(B.token, { name: 'Hari', parentPhone: '9000000000', monthlyFee: 10 });
  const lb = await t.api('GET', '/api/dues', { token: B.token });
  const dbb = lb.body.dues.find((d) => d.studentId === sb.id);
  const nb = await t.api('POST', `/api/dues/${dbb.id}/remind`, { token: B.token, body: {} });
  assert.equal(nb.status, 200);
  assert.doesNotMatch(nb.body.message, /UPI|null|undefined/);
  assert.match(nb.body.waLink, /^https:\/\/wa\.me\/919000000000\?text=/);
});

test('tenant isolation: tutor B gets 404 on every tutor A due route', async () => {
  const list = await t.api('GET', '/api/dues', { token: A.token });
  const due = list.body.dues.find((d) => d.status === 'due');
  const paid = list.body.dues.find((d) => d.status === 'paid');
  for (const [path, body] of [
    [`/api/dues/${due.id}/pay`, { mode: 'upi' }],
    [`/api/dues/${paid.id}/pay`, { mode: 'upi' }],
    [`/api/dues/${paid.id}/unpay`, undefined],
    [`/api/dues/${due.id}/waive`, undefined],
    [`/api/dues/${due.id}/remind`, {}],
  ]) {
    const r = await t.api('POST', path, { token: B.token, body });
    assert.equal(r.status, 404, path);
  }
  // nothing changed for A
  const again = await t.api('GET', '/api/dues', { token: A.token });
  assert.equal(again.body.dues.find((d) => d.id === due.id).status, 'due');
  assert.equal(again.body.dues.find((d) => d.id === paid.id).status, 'paid');
  // B never sees A's dues in its own lists
  const lb = await t.api('GET', '/api/dues', { token: B.token });
  assert.ok(lb.body.dues.every((d) => !again.body.dues.some((a) => a.id === d.id)));

  assert.equal((await t.api('POST', '/api/dues/xyz/pay', { token: A.token, body: { mode: 'upi' } })).status, 404);
});

test('F6: dues errors are plain English the web can show as-is', async () => {
  const s = await addStudent(A.token, { name: 'Plain Words', parentPhone: '9811111111', monthlyFee: 600 });
  const w = await addStudent(A.token, { name: 'Plain Waived', parentPhone: '9822222222', monthlyFee: 600 });
  const list = await t.api('GET', '/api/dues', { token: A.token });
  const due = list.body.dues.find((d) => d.studentId === s.id);
  const wdue = list.body.dues.find((d) => d.studentId === w.id);
  await t.api('POST', `/api/dues/${due.id}/pay`, { token: A.token, body: { mode: 'cash' } });
  await t.api('POST', `/api/dues/${wdue.id}/waive`, { token: A.token });

  const err = async (method, path, body) => {
    const r = await t.api(method, path, { token: A.token, body });
    assert.ok(r.status >= 400 && r.status < 500, `${path} -> ${r.status}`);
    assertPlainMessage(r.body.error);
    return r.body.error;
  };
  assert.equal(await err('POST', `/api/dues/${due.id}/remind`, {}), 'This fee is already marked paid.');
  assert.equal(await err('POST', `/api/dues/${wdue.id}/remind`, {}), "This fee was waived, so there's nothing to remind about.");
  await err('POST', `/api/dues/${due.id}/waive`);
  await err('POST', `/api/dues/${wdue.id}/pay`, { mode: 'upi' });
  assert.equal(await err('POST', `/api/dues/${due.id}/pay`, { mode: 'gold' }), 'Choose how the fee was paid: UPI, cash, bank or other.');
  await err('POST', `/api/dues/${due.id}/remind`, { lang: 'fr' });
  await err('GET', '/api/dues?month=oct');
  assert.equal(await err('POST', '/api/dues/99999999/pay', { mode: 'upi' }), 'This fee was not found. It may have been removed.');
});
