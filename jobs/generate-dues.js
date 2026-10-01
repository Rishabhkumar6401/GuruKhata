// generate-dues — monthly cron (1st of month): create this month's `dues` row
// for every ACTIVE student, at that student's current monthly_fee.
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

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error(
    'ERROR: DATABASE_URL is not set.\n' +
      'Usage: DATABASE_URL=postgres://user:pass@host/db node jobs/generate-dues.js'
  );
  process.exit(1);
}

// Current month as 'YYYY-MM' in Indian time — the cron fires near midnight on
// the 1st, so UTC would bill the previous month. en-CA gives zero-padded ISO.
const month = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
}).format(new Date());

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    const result = await pool.query(
      `INSERT INTO dues (student_id, month, amount, status)
       SELECT s.id, $1, s.monthly_fee, 'due'
       FROM students s
       WHERE s.active = TRUE
       ON CONFLICT (student_id, month) DO NOTHING`,
      [month]
    );
    console.log(`[generate-dues] month=${month} created=${result.rowCount} (existing rows skipped)`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[generate-dues] failed:', err);
  process.exit(1);
});
