// generate-dues — monthly cron (1st of month): make sure every ACTIVE student
// with monthly_fee > 0 has a `dues` row for every month up to the current IST
// month — the current month, plus any earlier months that were missed
// (backfill: from the later of the student's created month and the month
// after their latest due, capped at 12 months back). Rows are created at the
// student's current monthly_fee.
//
// The rule (and its SQL) lives in ONE place, shared with the API's lazy
// generation: api/src/lib/dues-generation.js. That module is dependency-free;
// when this job is packaged as its own Lambda, bundle it (and its ./time.js)
// along with this file.
//
// Run locally:  DATABASE_URL=postgres://... node jobs/generate-dues.js
// (first: npm install inside jobs/)
//
// IDEMPOTENT ON PURPOSE: INSERT ... SELECT ... ON CONFLICT DO NOTHING against
// UNIQUE(student_id, month) — a re-run (cron retry, manual run, double
// EventBridge delivery) must NEVER double-bill a student. Rows that already
// exist for (student, month) are simply skipped.
//
// Reads DATABASE_URL itself (no dotenv): on Lambda it comes from the function
// env; locally pass it on the command line or export it from api/.env.

import pg from 'pg';
import { currentMonth } from '../api/src/lib/time.js';
import { generateDuesForAllTutors, MAX_BACKFILL_MONTHS } from '../api/src/lib/dues-generation.js';

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error(
    'ERROR: DATABASE_URL is not set.\n' +
      'Usage: DATABASE_URL=postgres://user:pass@host/db node jobs/generate-dues.js'
  );
  process.exit(1);
}

// Current month as 'YYYY-MM' in Indian time — the cron fires near midnight on
// the 1st, so UTC would bill the previous month.
const month = currentMonth();

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    const query = async (text, params) => {
      const r = await pool.query(text, params);
      return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    };
    const created = await generateDuesForAllTutors(query, { month });
    console.log(
      `[generate-dues] month=${month} created=${created} ` +
        `(backfill up to ${MAX_BACKFILL_MONTHS} months back; existing rows skipped)`
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[generate-dues] failed:', err);
  process.exit(1);
});
