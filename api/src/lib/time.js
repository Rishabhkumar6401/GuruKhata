// Calendar helpers — everything business-facing is Asia/Kolkata (IST).
// IST is a fixed UTC+05:30 with no DST, so month boundaries can be computed
// in JS without relying on the database's timezone data.

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const istDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** { year, month (1-12), day, monthStr 'YYYY-MM' } for `now` in IST. */
export function istToday(now = new Date()) {
  const [y, m, d] = istDateFmt.format(now).split('-');
  return { year: Number(y), month: Number(m), day: Number(d), monthStr: `${y}-${m}` };
}

export const currentMonth = (now = new Date()) => istToday(now).monthStr;

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** UTC instant at which the IST month 'YYYY-MM' starts. */
export function istMonthStart(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1) - IST_OFFSET_MS);
}

/** UTC instant at which the IST month after 'YYYY-MM' starts. */
export function istNextMonthStart(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS);
}

/**
 * Contract: overdue = status 'due' AND (the month is in the past, OR it is
 * the current month and today (IST) is past the student's dueDay).
 */
export function isOverdue(status, month, dueDay, now = new Date()) {
  if (status !== 'due') return false;
  const today = istToday(now);
  if (month < today.monthStr) return true;
  if (month > today.monthStr) return false;
  return today.day > Number(dueDay);
}

/** 'October 2026' (en) / 'अक्टूबर 2026' (hi) for '2026-10'. */
export function monthLabel(monthStr, lang = 'en') {
  const [y, m] = monthStr.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}
