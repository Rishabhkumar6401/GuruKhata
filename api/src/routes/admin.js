// /api/admin — backoffice routes (role='admin' only; 403 otherwise).
// These are the ONLY routes allowed to read across tutors (rule #1 exception).
// Audit rule (ARCHITECTURE.md): every admin WRITE logs a row to admin_log.
// (v1 has read-only admin routes, so nothing is logged yet.)
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { iso, num } from '../lib/mappers.js';
import { currentMonth, istMonthStart, istNextMonthStart } from '../lib/time.js';

const router = Router();

router.use(requireAuth, requireAdmin);

/** GET /api/admin/stats */
router.get('/stats', async (req, res) => {
  const month = currentMonth();
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM tutors) AS tutors,
       (SELECT count(*)::int FROM tutors WHERE last_active_at >= now() - interval '7 days') AS active_tutors_7d,
       (SELECT count(*)::int FROM students WHERE active) AS students,
       (SELECT count(*)::int FROM dues WHERE month = $1) AS dues_this_month,
       (SELECT count(*)::int FROM dues WHERE month = $1 AND status = 'paid') AS paid_this_month,
       (SELECT count(*)::int FROM reminders WHERE sent_at >= $2 AND sent_at < $3) AS reminders_this_month`,
    [month, istMonthStart(month), istNextMonthStart(month)]
  );
  const r = rows[0];
  res.json({
    tutors: num(r.tutors),
    activeTutors7d: num(r.active_tutors_7d),
    students: num(r.students),
    duesThisMonth: num(r.dues_this_month),
    paidThisMonth: num(r.paid_this_month),
    remindersThisMonth: num(r.reminders_this_month),
  });
});

/** GET /api/admin/tutors — newest first. studentCount = active students. */
router.get('/tutors', async (req, res) => {
  const { rows } = await query(
    `SELECT t.id, t.name, t.last_active_at, t.created_at, t.plan,
            (SELECT count(*)::int FROM students s WHERE s.tutor_id = t.id AND s.active) AS student_count
     FROM tutors t
     ORDER BY t.created_at DESC, t.id DESC`
  );
  res.json({
    tutors: rows.map((r) => ({
      id: num(r.id),
      name: r.name,
      studentCount: num(r.student_count),
      lastActiveAt: iso(r.last_active_at),
      createdAt: iso(r.created_at),
      plan: r.plan,
    })),
  });
});

export default router;
