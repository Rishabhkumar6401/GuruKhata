// /api/dues — the core of the product.
//
// Tenancy: dues have no tutor_id column; every query reaches the tutor via
// JOIN students s ON s.id = d.student_id ... WHERE s.tutor_id = $1. A due
// owned by another tutor is indistinguishable from a missing one (404).
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { toDue } from '../lib/mappers.js';
import { badRequest, conflict, notFound, parseId } from '../lib/http.js';
import { body, lang as validateLang, PAYMENT_MODES, PAYMENT_MODES_MESSAGE } from '../lib/validate.js';
import { currentMonth, istToday, MONTH_RE, monthLabel } from '../lib/time.js';
import { generateDuesForTutor } from '../lib/dues-generation.js';
import { buildWaLink, reminderMessage } from '../../../shared/templates.js';

const router = Router();
router.use(requireAuth);

// Messages are shown to the teacher as-is by the web app: plain English only.
const DUE_NOT_FOUND = 'This fee was not found. It may have been removed.';

// $1 is always the tutor id.
const DUE_SELECT = `
  SELECT d.id, d.student_id, d.month, d.amount, d.status, d.paid_at, d.receipt_no, d.payment_mode,
         s.name AS student_name, s.parent_phone, s.subject, s.due_day
  FROM dues d
  JOIN students s ON s.id = d.student_id
  WHERE s.tutor_id = $1`;

/**
 * Lazy generation: make sure this tutor's dues exist up to the current IST
 * month — including months the tutor never opened the app (backfill) — for
 * ACTIVE students with monthly_fee > 0, at each student's current fee. The
 * rule lives in lib/dues-generation.js, shared with jobs/generate-dues.js.
 */
async function ensureDues(tutorId) {
  await generateDuesForTutor(query, tutorId);
}

async function getDue(tutorId, dueId) {
  const { rows } = await query(`${DUE_SELECT} AND d.id = $2`, [tutorId, dueId]);
  return rows[0] || null;
}

const round2 = (n) => Math.round(n * 100) / 100;

/** GET /api/dues[?month=YYYY-MM] -> { month, summary, dues } */
router.get('/', async (req, res) => {
  let month = currentMonth();
  if (req.query.month !== undefined) {
    if (typeof req.query.month !== 'string' || !MONTH_RE.test(req.query.month)) {
      throw badRequest('Please choose a valid month.');
    }
    month = req.query.month;
  }

  await ensureDues(req.tutor.id);
  const { rows } = await query(`${DUE_SELECT} AND d.month = $2 ORDER BY lower(s.name), d.id`, [
    req.tutor.id,
    month,
  ]);
  const now = new Date();
  const dues = rows.map((r) => toDue(r, now));

  const summary = { expected: 0, collected: 0, pending: 0, paidCount: 0, dueCount: 0, overdueCount: 0 };
  for (const d of dues) {
    if (d.status !== 'waived') summary.expected += d.amount;
    if (d.status === 'paid') {
      summary.collected += d.amount;
      summary.paidCount += 1;
    }
    if (d.status === 'due') {
      summary.pending += d.amount;
      summary.dueCount += 1;
      if (d.overdue) summary.overdueCount += 1;
    }
  }
  summary.expected = round2(summary.expected);
  summary.collected = round2(summary.collected);
  summary.pending = round2(summary.pending);

  res.json({ month, summary, dues });
});

/** GET /api/dues/uncollected -> every unpaid due up to and including the current month, oldest first. */
router.get('/uncollected', async (req, res) => {
  await ensureDues(req.tutor.id);
  const { rows } = await query(
    `${DUE_SELECT} AND d.status = 'due' AND d.month <= $2 ORDER BY d.month, lower(s.name), d.id`,
    [req.tutor.id, currentMonth()]
  );
  const now = new Date();
  const dues = rows.map((r) => toDue(r, now));
  const total = round2(dues.reduce((sum, d) => sum + d.amount, 0));
  res.json({ total, count: dues.length, dues });
});

/**
 * POST /api/dues/:id/pay { mode } — mark paid with the next per-tutor receipt
 * number. Single statement => atomic: the due row is locked (FOR UPDATE), the
 * tutor's receipt_seq is incremented only if the due is still 'due', and the
 * due is updated with the new number. A concurrent second pay re-checks the
 * locked row, sees 'paid', and increments nothing. Already paid -> returns
 * the existing due unchanged (idempotent).
 */
router.post('/:id/pay', async (req, res) => {
  const id = parseId(req.params.id, DUE_NOT_FOUND);
  const { mode } = body(req);
  if (!PAYMENT_MODES.includes(mode)) throw badRequest(PAYMENT_MODES_MESSAGE);

  const year = String(istToday().year);
  await query(
    `WITH target AS (
       SELECT d.id FROM dues d
       JOIN students s ON s.id = d.student_id
       WHERE d.id = $2 AND s.tutor_id = $1 AND d.status = 'due'
       FOR UPDATE OF d
     ), seq AS (
       UPDATE tutors SET receipt_seq = receipt_seq + 1
       WHERE id = $1 AND EXISTS (SELECT 1 FROM target)
       RETURNING receipt_seq
     )
     UPDATE dues
        SET status = 'paid',
            paid_at = now(),
            payment_mode = $3::text,
            receipt_no = 'RC-' || $4::text || '-' ||
                         lpad(seq.receipt_seq::text, greatest(4, length(seq.receipt_seq::text)), '0')
       FROM target, seq
      WHERE dues.id = target.id`,
    [req.tutor.id, id, mode, year]
  );

  const due = await getDue(req.tutor.id, id);
  if (!due) throw notFound(DUE_NOT_FOUND);
  if (due.status === 'waived') throw conflict('This fee was waived. Undo the waiver first, then mark it paid.');
  res.json({ due: toDue(due) });
});

/**
 * POST /api/dues/:id/unpay — undo a mistaken mark: paid OR waived -> due.
 * Clears receipt_no/paid_at/payment_mode; tutors.receipt_seq is NOT
 * decremented, so the number is never reused. Already 'due' -> no-op.
 */
router.post('/:id/unpay', async (req, res) => {
  const id = parseId(req.params.id, DUE_NOT_FOUND);
  await query(
    `UPDATE dues d
        SET status = 'due', paid_at = NULL, receipt_no = NULL, payment_mode = NULL
       FROM students s
      WHERE s.id = d.student_id AND s.tutor_id = $1 AND d.id = $2 AND d.status <> 'due'`,
    [req.tutor.id, id]
  );
  const due = await getDue(req.tutor.id, id);
  if (!due) throw notFound(DUE_NOT_FOUND);
  res.json({ due: toDue(due) });
});

/** POST /api/dues/:id/waive — due -> waived. Already waived -> no-op; paid -> 409. */
router.post('/:id/waive', async (req, res) => {
  const id = parseId(req.params.id, DUE_NOT_FOUND);
  await query(
    `UPDATE dues d
        SET status = 'waived'
       FROM students s
      WHERE s.id = d.student_id AND s.tutor_id = $1 AND d.id = $2 AND d.status = 'due'`,
    [req.tutor.id, id]
  );
  const due = await getDue(req.tutor.id, id);
  if (!due) throw notFound(DUE_NOT_FOUND);
  if (due.status === 'paid') throw conflict('This fee is already marked paid. Undo the payment first, then waive it.');
  res.json({ due: toDue(due) });
});

/**
 * POST /api/dues/:id/remind { lang? } -> { message, waLink }
 * Builds the WhatsApp text with shared/templates.js and logs a reminders row
 * (channel 'wa_link'). The tutor's phone sends it — we only build the link.
 */
router.post('/:id/remind', async (req, res) => {
  const id = parseId(req.params.id, DUE_NOT_FOUND);
  const b = body(req);
  const lang = b.lang === undefined || b.lang === null ? req.tutor.language_pref : validateLang(b.lang);

  const due = await getDue(req.tutor.id, id);
  if (!due) throw notFound(DUE_NOT_FOUND);
  if (due.status === 'paid') throw conflict('This fee is already marked paid.');
  if (due.status === 'waived') throw conflict("This fee was waived, so there's nothing to remind about.");
  if (!due.parent_phone) throw badRequest("Add the parent's WhatsApp number first.");

  const message = reminderMessage(
    {
      studentName: due.student_name,
      monthLabel: monthLabel(due.month, lang),
      amount: Number(due.amount),
      upiId: req.tutor.upi_id,
      teacherName: req.tutor.name || '',
    },
    lang === 'hi' ? 'hi' : 'en'
  );
  const waLink = buildWaLink(due.parent_phone, message);

  await query(`INSERT INTO reminders (due_id, channel, template_used) VALUES ($1, 'wa_link', $2)`, [
    due.id,
    `reminder_${lang === 'hi' ? 'hi' : 'en'}`,
  ]);
  res.json({ message, waLink });
});

export default router;
