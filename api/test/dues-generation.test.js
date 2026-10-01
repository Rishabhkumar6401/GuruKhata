// Which dues rows exist, and at what amount: backfill (F4), no ₹0 dues (F7),
// fee edits re-price the current unpaid due (F1), and months a student was
// inactive or free are never billed retroactively.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, istNow, monthsBefore } from './helpers.js';
import { generateDuesForAllTutors, MAX_BACKFILL_MONTHS } from '../src/lib/dues-generation.js';

let t;
const now = istNow();
const ago = (n) => monthsBefore(now.month, n);
/** An instant safely inside IST month `month` (mid-month, mid-day). */
const midMonth = (month) => `${month}-15T12:00:00+05:30`;

before(async () => {
  t = await startApp();
});
after(async () => {
  await t.close();
});

async function addStudent(tok, body, { createdMonth } = {}) {
  const r = await t.api('POST', '/api/students', { token: tok, body });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  if (createdMonth) {
    await t.db.query('UPDATE students SET created_at = $2 WHERE id = $1', [r.body.student.id, midMonth(createdMonth)]);
  }
  return r.body.student;
}

/** month -> { amount, status } for one student, straight from the table. */
async function duesOf(studentId) {
  const { rows } = await t.db.query('SELECT month, amount, status FROM dues WHERE student_id = $1 ORDER BY month', [
    studentId,
  ]);
  return Object.fromEntries(rows.map((r) => [r.month, { amount: Number(r.amount), status: r.status }]));
}

test('F4: lazy generation backfills months the tutor never opened the app (created month / after latest due, capped)', async () => {
  const A = await t.login('Backfill Tutor');

  // Added two months ago, app never opened since -> those months must not be skipped.
  const sep = await addStudent(A.token, { name: 'Added Two Months Ago', monthlyFee: 1500 }, { createdMonth: ago(2) });
  // Latest due (paid) is 4 months back -> months after it are billed; the gap before it is NOT filled.
  const lapsed = await addStudent(A.token, { name: 'Lapsed', monthlyFee: 800 }, { createdMonth: ago(6) });
  await t.db.query(`INSERT INTO dues (student_id, month, amount, status) VALUES ($1, $2, 800, 'paid')`, [lapsed.id, ago(4)]);
  // Years old with no dues at all -> capped at MAX_BACKFILL_MONTHS back.
  const ancient = await addStudent(A.token, { name: 'Ancient', monthlyFee: 300 }, { createdMonth: ago(30) });
  // Inactive and ₹0 students never get backfilled.
  const gone = await addStudent(A.token, { name: 'Gone', monthlyFee: 999 }, { createdMonth: ago(5) });
  await t.api('DELETE', `/api/students/${gone.id}`, { token: A.token });
  const free = await addStudent(A.token, { name: 'Free', monthlyFee: 0 }, { createdMonth: ago(5) });
  // Another tutor's old student is NOT touched by A's lazy generation.
  const B = await t.login('Other Backfill Tutor');
  const other = await addStudent(B.token, { name: 'Other Tutor Kid', monthlyFee: 100 }, { createdMonth: ago(3) });

  const r = await t.api('GET', '/api/dues', { token: A.token });
  assert.equal(r.status, 200);

  assert.deepEqual(Object.keys(await duesOf(sep.id)), [ago(2), ago(1), now.month]);
  assert.deepEqual(Object.keys(await duesOf(lapsed.id)), [ago(4), ago(3), ago(2), ago(1), now.month]);
  assert.equal((await duesOf(lapsed.id))[ago(4)].status, 'paid', 'existing due untouched');
  const anc = Object.keys(await duesOf(ancient.id));
  assert.equal(MAX_BACKFILL_MONTHS, 12);
  assert.equal(anc.length, 13, 'current month + 12 months back');
  assert.equal(anc[0], ago(12));
  assert.equal(anc.at(-1), now.month);
  assert.deepEqual(await duesOf(gone.id), {});
  assert.deepEqual(await duesOf(free.id), {});
  assert.deepEqual(await duesOf(other.id), {}, 'lazy generation is scoped to the calling tutor');

  // Backfilled months show up in their month view and in "uncollected".
  const past = await t.api('GET', `/api/dues?month=${ago(1)}`, { token: A.token });
  assert.deepEqual(past.body.dues.map((d) => d.studentName).sort(), ['Added Two Months Ago', 'Ancient', 'Lapsed']);
  assert.ok(past.body.dues.every((d) => d.status === 'due' && d.overdue));
  const unc = await t.api('GET', '/api/dues/uncollected', { token: A.token });
  assert.equal(unc.body.count, 3 + 4 + 13);
  assert.equal(unc.body.total, 3 * 1500 + 4 * 800 + 13 * 300);

  // Idempotent: repeat loads create nothing.
  const { rows: before } = await t.db.query('SELECT count(*)::int AS n FROM dues');
  await t.api('GET', '/api/dues', { token: A.token });
  await t.api('GET', '/api/dues/uncollected', { token: A.token });
  const { rows: afterRows } = await t.db.query('SELECT count(*)::int AS n FROM dues');
  assert.equal(Number(afterRows[0].n), Number(before[0].n));

  // The cron path (jobs/generate-dues.js) runs the same rule across every tutor.
  const created = await generateDuesForAllTutors(t.db.query);
  assert.equal(created, 4, "only B's student was missing dues");
  assert.deepEqual(Object.keys(await duesOf(other.id)), [ago(3), ago(2), ago(1), now.month]);
  assert.equal(await generateDuesForAllTutors(t.db.query), 0, 'cron re-run creates nothing');
});

test('F7: a ₹0 monthly fee never creates dues', async () => {
  const T = await t.login('Zero Fee Tutor');
  const free = await addStudent(T.token, { name: 'Scholarship Kid', monthlyFee: 0 });
  const paying = await addStudent(T.token, { name: 'Paying Kid', monthlyFee: 500 });

  const r = await t.api('GET', '/api/dues', { token: T.token });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.dues.map((d) => d.studentId), [paying.id]);
  assert.equal(r.body.summary.dueCount, 1);
  const unc = await t.api('GET', '/api/dues/uncollected', { token: T.token });
  assert.ok(unc.body.dues.every((d) => d.studentId !== free.id));
  assert.equal(await generateDuesForAllTutors(t.db.query), 0, 'cron skips ₹0 students too');
  assert.deepEqual(await duesOf(free.id), {});
});

test("F1: editing the monthly fee re-prices this month's unpaid due; paid, waived and past dues are untouched", async () => {
  const T = await t.login('Fee Edit Tutor');
  // Typo: ₹15000 instead of ₹1500.
  const riya = await addStudent(T.token, { name: 'Riya', monthlyFee: 15000, dueDay: 28 });
  await t.db.query(`INSERT INTO dues (student_id, month, amount, status) VALUES ($1, $2, 15000, 'due'), ($1, $3, 15000, 'paid')`, [
    riya.id,
    ago(1),
    ago(2),
  ]);
  const open = await t.api('GET', '/api/dues', { token: T.token });
  assert.equal(open.body.dues.find((d) => d.studentId === riya.id).amount, 15000);

  const p = await t.api('PATCH', `/api/students/${riya.id}`, { token: T.token, body: { monthlyFee: 1500 } });
  assert.equal(p.status, 200);
  assert.equal(p.body.student.monthlyFee, 1500);

  const after1 = await t.api('GET', '/api/dues', { token: T.token });
  const cur = after1.body.dues.find((d) => d.studentId === riya.id);
  assert.equal(cur.amount, 1500, "this month's unpaid due follows the corrected fee");
  assert.equal(after1.body.summary.expected, 1500);
  assert.deepEqual(await duesOf(riya.id), {
    [ago(2)]: { amount: 15000, status: 'paid' },
    [ago(1)]: { amount: 15000, status: 'due' },
    [now.month]: { amount: 1500, status: 'due' },
  });

  // Once this month is paid (or waived), a later fee change no longer touches it.
  await t.api('POST', `/api/dues/${cur.id}/pay`, { token: T.token, body: { mode: 'cash' } });
  await t.api('PATCH', `/api/students/${riya.id}`, { token: T.token, body: { monthlyFee: 1600 } });
  assert.equal((await duesOf(riya.id))[now.month].amount, 1500);
  assert.equal((await duesOf(riya.id))[now.month].status, 'paid');

  const w = await addStudent(T.token, { name: 'Waived Kid', monthlyFee: 700 });
  const lw = await t.api('GET', '/api/dues', { token: T.token });
  await t.api('POST', `/api/dues/${lw.body.dues.find((d) => d.studentId === w.id).id}/waive`, { token: T.token });
  await t.api('PATCH', `/api/students/${w.id}`, { token: T.token, body: { monthlyFee: 900 } });
  assert.deepEqual((await duesOf(w.id))[now.month], { amount: 700, status: 'waived' });

  // Editing other fields leaves the due alone; another tutor cannot re-price it.
  const k = await addStudent(T.token, { name: 'Kabir', monthlyFee: 1200 });
  await t.api('GET', '/api/dues', { token: T.token });
  await t.api('PATCH', `/api/students/${k.id}`, { token: T.token, body: { subject: 'Physics' } });
  assert.equal((await duesOf(k.id))[now.month].amount, 1200);
  const X = await t.login('Fee Edit Intruder');
  assert.equal((await t.api('PATCH', `/api/students/${k.id}`, { token: X.token, body: { monthlyFee: 1 } })).status, 404);
  assert.equal((await duesOf(k.id))[now.month].amount, 1200);
});

test('reactivating a student, or raising a ₹0 fee, bills from this month only (no backfill of inactive/free months)', async () => {
  const T = await t.login('Reactivation Tutor');

  // Left after a paid month 3 months ago, re-joins now: the 2 months away must not be billed.
  const back = await addStudent(T.token, { name: 'Summer Break', monthlyFee: 1000 }, { createdMonth: ago(5) });
  await t.db.query(`INSERT INTO dues (student_id, month, amount, status) VALUES ($1, $2, 1000, 'paid')`, [back.id, ago(3)]);
  await t.db.query('UPDATE students SET active = FALSE WHERE id = $1', [back.id]);
  await t.api('GET', '/api/dues', { token: T.token });
  const re = await t.api('PATCH', `/api/students/${back.id}`, { token: T.token, body: { active: true } });
  assert.equal(re.status, 200);
  await t.api('GET', '/api/dues', { token: T.token });
  assert.deepEqual(Object.keys(await duesOf(back.id)), [ago(3), now.month]);

  // Free for 4 months, starts paying now: the free months must not be billed.
  const trial = await addStudent(T.token, { name: 'Free Trial', monthlyFee: 0 }, { createdMonth: ago(4) });
  await t.api('GET', '/api/dues', { token: T.token });
  await t.api('PATCH', `/api/students/${trial.id}`, { token: T.token, body: { monthlyFee: 1200 } });
  await t.api('GET', '/api/dues', { token: T.token });
  assert.deepEqual(await duesOf(trial.id), { [now.month]: { amount: 1200, status: 'due' } });

  // A plain fee edit on a billable student does not cut off a pending backfill.
  const quiet = await addStudent(T.token, { name: 'Quiet Months', monthlyFee: 500 }, { createdMonth: ago(2) });
  await t.api('PATCH', `/api/students/${quiet.id}`, { token: T.token, body: { monthlyFee: 600 } });
  await t.api('GET', '/api/dues', { token: T.token });
  assert.deepEqual(Object.keys(await duesOf(quiet.id)), [ago(2), ago(1), now.month]);
});

test("changing a fee to ₹0 drops this month's open due (no '₹0 due' row); paid history is kept", async () => {
  const T = await t.login('Fee To Zero Tutor');
  const kabir = await addStudent(T.token, { name: 'Kabir', monthlyFee: 1200, dueDay: 28 });
  await t.db.query(`INSERT INTO dues (student_id, month, amount, status) VALUES ($1, $2, 1200, 'paid')`, [kabir.id, ago(1)]);
  await t.api('GET', '/api/dues', { token: T.token }); // lazy-generates this month's ₹1200 due
  assert.equal((await duesOf(kabir.id))[now.month].amount, 1200);

  const p = await t.api('PATCH', `/api/students/${kabir.id}`, { token: T.token, body: { monthlyFee: 0 } });
  assert.equal(p.status, 200);

  const rows = await duesOf(kabir.id);
  assert.equal(rows[now.month], undefined, "this month's open due should be gone");
  assert.deepEqual(rows[ago(1)], { amount: 1200, status: 'paid' }, 'paid history untouched');

  const list = await t.api('GET', '/api/dues', { token: T.token });
  assert.equal(list.body.dues.some((d) => d.studentId === kabir.id), false);
  assert.equal(list.body.summary.expected, 0);
});
