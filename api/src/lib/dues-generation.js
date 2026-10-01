// Dues generation — the ONE definition of which (student, month) dues rows
// must exist. Used by the API's lazy generation (routes/dues.js, one tutor
// per request) and by the monthly cron (jobs/generate-dues.js, every tutor).
//
// Rule, per ACTIVE student with monthly_fee > 0: create a 'due' row at the
// student's current monthly_fee for every month from
//     the latest of
//       (a) the IST month the student was added (students.created_at),
//       (b) the month after the student's latest existing due (any status;
//           only dues up to the current month count),
//       (c) MAX_BACKFILL_MONTHS months before the current month (cap)
//     up to and including the current IST month.
// So a month in which the tutor never opened the app is still billed the next
// time generation runs, and gaps BEFORE a student's latest due are never
// filled in (that is how routes/students.js keeps months a student was
// inactive or free from being billed later: it creates the current month's due
// the moment a student becomes billable again).
//
// IDEMPOTENT: INSERT ... ON CONFLICT (student_id, month) DO NOTHING against
// UNIQUE(student_id, month) — re-runs and concurrent runs never double-bill.
// Set-based: one statement, generate_series over months; plain SQL that runs
// unchanged on pg (Neon / real Postgres) and PGlite.
//
// Pure module (no driver import): callers pass their own query(text, params),
// so jobs/ can import it without pulling in the API's db layer.
import { currentMonth } from './time.js';

// ⚠️ INVENTED VALUE — needs sign-off. Backfill never reaches further back than
// 12 months before the current month (so at most 13 rows per student per run,
// current month included). Guards against runaway inserts, e.g. a student
// whose created_at is years old and who has no dues yet.
export const MAX_BACKFILL_MONTHS = 12;

// $1 = current month 'YYYY-MM', $2 = MAX_BACKFILL_MONTHS, $3 = tutor id (scoped
// variant only). Month arithmetic is done on `timestamp` (no time zone) so the
// session TimeZone never matters; created_at is converted to IST explicitly.
const generateSql = (tutorScoped) => `
  INSERT INTO dues (student_id, month, amount, status)
  SELECT s.id, to_char(g.m, 'YYYY-MM'), s.monthly_fee, 'due'
  FROM students s
  CROSS JOIN LATERAL (
    SELECT GREATEST(
      to_date($1, 'YYYY-MM') - make_interval(months => $2::int),
      date_trunc('month', s.created_at AT TIME ZONE 'Asia/Kolkata'),
      (SELECT to_date(max(d.month), 'YYYY-MM') + interval '1 month'
         FROM dues d
        WHERE d.student_id = s.id AND d.month <= $1)
    ) AS first_month
  ) f
  CROSS JOIN LATERAL generate_series(f.first_month, to_date($1, 'YYYY-MM')::timestamp, interval '1 month') AS g(m)
  WHERE s.active AND s.monthly_fee > 0${tutorScoped ? ' AND s.tutor_id = $3' : ''}
  ON CONFLICT (student_id, month) DO NOTHING`;

const TUTOR_SQL = generateSql(true);
const ALL_TUTORS_SQL = generateSql(false);

/**
 * Lazy generation for ONE tutor (multi-tenant rule #1: scoped by tutor_id).
 * @param {(text: string, params: any[]) => Promise<{ rowCount: number }>} query
 * @returns {Promise<number>} rows created
 */
export async function generateDuesForTutor(query, tutorId, { month = currentMonth(), maxBackMonths = MAX_BACKFILL_MONTHS } = {}) {
  if (tutorId === undefined || tutorId === null) throw new Error('generateDuesForTutor: tutorId is required');
  const { rowCount } = await query(TUTOR_SQL, [month, maxBackMonths, tutorId]);
  return rowCount;
}

/**
 * Cron generation across EVERY tutor (jobs/generate-dues.js only).
 * @returns {Promise<number>} rows created
 */
export async function generateDuesForAllTutors(query, { month = currentMonth(), maxBackMonths = MAX_BACKFILL_MONTHS } = {}) {
  const { rowCount } = await query(ALL_TUTORS_SQL, [month, maxBackMonths]);
  return rowCount;
}
