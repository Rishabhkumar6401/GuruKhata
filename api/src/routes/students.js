// /api/students — a tutor's students. Every query is scoped by tutor_id;
// another tutor's student is indistinguishable from a missing one (404).
import { Router } from 'express';
import { query, transaction } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { toStudent } from '../lib/mappers.js';
import { notFound, parseId } from '../lib/http.js';
import { currentMonth } from '../lib/time.js';
import { body, bool, dueDay, money, optionalPhone, optionalText, requiredText } from '../lib/validate.js';

const router = Router();
router.use(requireAuth);

// ⚠️ Contract: "dueDay default 5 — invented default, needs sign-off".
const DEFAULT_DUE_DAY = 5;
const STUDENT_NOT_FOUND = 'This student was not found. They may have been removed.';

// Plain-English labels: validation messages are shown to the teacher as-is.
const L = {
  name: "Student's name",
  parentName: "Parent's name",
  parentPhone: "Parent's WhatsApp number",
  subject: 'Subject',
  monthlyFee: 'Monthly fee',
  dueDay: 'Fee due day',
  active: 'Active status',
};

/** Billable = dues get generated for this student (lib/dues-generation.js). */
const isBillable = (row) => row.active === true && Number(row.monthly_fee) > 0;

/** GET /api/students[?active=all] — sorted by name. */
router.get('/', async (req, res) => {
  const includeInactive = req.query.active === 'all';
  const { rows } = await query(
    `SELECT * FROM students
     WHERE tutor_id = $1 AND ($2::boolean OR active)
     ORDER BY lower(name), id`,
    [req.tutor.id, includeInactive]
  );
  res.json({ students: rows.map(toStudent) });
});

/** POST /api/students { name*, parentName, parentPhone, subject, monthlyFee*, dueDay } */
router.post('/', async (req, res) => {
  const b = body(req);
  const s = {
    name: requiredText(b.name, L.name, 60),
    parentName: optionalText(b.parentName, L.parentName, 60),
    parentPhone: optionalPhone(b.parentPhone, L.parentPhone),
    subject: optionalText(b.subject, L.subject, 60),
    monthlyFee: money(b.monthlyFee, L.monthlyFee),
    dueDay: b.dueDay === undefined || b.dueDay === null ? DEFAULT_DUE_DAY : dueDay(b.dueDay, L.dueDay),
  };
  const { rows } = await query(
    `INSERT INTO students (tutor_id, name, parent_name, parent_phone, subject, monthly_fee, due_day)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [req.tutor.id, s.name, s.parentName, s.parentPhone, s.subject, s.monthlyFee, s.dueDay]
  );
  res.status(201).json({ student: toStudent(rows[0]) });
});

/**
 * PATCH /api/students/:id — any Student field (id is ignored).
 *
 * Dues side effects, in the same transaction as the student update (all
 * scoped by tutor_id; past months and paid/waived dues are never touched):
 *  - monthlyFee in the body -> the CURRENT IST month's due, if still 'due',
 *    is re-priced to the new fee (fixes a typo'd fee after dues were made).
 *  - the student just became billable (reactivated, or fee raised from ₹0)
 *    -> the current month's due is created now. Generation only backfills
 *    months AFTER a student's latest due, so this keeps the months they were
 *    inactive / free from being billed retroactively.
 */
router.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id, STUDENT_NOT_FOUND);
  const b = body(req);
  const sets = [];
  const params = [req.tutor.id, id];
  const set = (col, val) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };

  if ('name' in b) set('name', requiredText(b.name, L.name, 60));
  if ('parentName' in b) set('parent_name', optionalText(b.parentName, L.parentName, 60));
  if ('parentPhone' in b) set('parent_phone', optionalPhone(b.parentPhone, L.parentPhone));
  if ('subject' in b) set('subject', optionalText(b.subject, L.subject, 60));
  if ('monthlyFee' in b) set('monthly_fee', money(b.monthlyFee, L.monthlyFee));
  if ('dueDay' in b) set('due_day', dueDay(b.dueDay, L.dueDay));
  if ('active' in b) set('active', bool(b.active, L.active));

  const month = currentMonth();
  const student = await transaction(async (tx) => {
    const { rows: [before] } = await tx.query(
      'SELECT * FROM students WHERE tutor_id = $1 AND id = $2 FOR UPDATE',
      [req.tutor.id, id]
    );
    if (!before) return null;
    if (!sets.length) return before;

    const { rows: [after] } = await tx.query(
      `UPDATE students SET ${sets.join(', ')} WHERE tutor_id = $1 AND id = $2 RETURNING *`,
      params
    );
    if ('monthlyFee' in b) {
      await tx.query(
        `UPDATE dues d SET amount = s.monthly_fee
           FROM students s
          WHERE s.id = d.student_id AND s.tutor_id = $1 AND s.id = $2
            AND d.month = $3 AND d.status = 'due'`,
        [req.tutor.id, id, month]
      );
      // Fee set to ₹0 → this month's still-open due would read "₹0 due"; drop it.
      // Paid/waived history is never touched.
      await tx.query(
        `DELETE FROM dues d USING students s
          WHERE s.id = d.student_id AND s.tutor_id = $1 AND s.id = $2
            AND d.month = $3 AND d.status = 'due' AND d.amount = 0`,
        [req.tutor.id, id, month]
      );
    }
    if (!isBillable(before) && isBillable(after)) {
      await tx.query(
        `INSERT INTO dues (student_id, month, amount, status)
         SELECT s.id, $3, s.monthly_fee, 'due' FROM students s
          WHERE s.tutor_id = $1 AND s.id = $2
         ON CONFLICT (student_id, month) DO NOTHING`,
        [req.tutor.id, id, month]
      );
    }
    return after;
  });
  if (!student) throw notFound(STUDENT_NOT_FOUND);
  res.json({ student: toStudent(student) });
});

/** DELETE /api/students/:id — soft delete (active=false); dues are kept. */
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id, STUDENT_NOT_FOUND);
  const { rowCount } = await query('UPDATE students SET active = FALSE WHERE tutor_id = $1 AND id = $2', [
    req.tutor.id,
    id,
  ]);
  if (!rowCount) throw notFound(STUDENT_NOT_FOUND);
  res.status(204).end();
});

export default router;
