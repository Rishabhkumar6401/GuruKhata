// Formatting helpers. All dates/months are shown in Asia/Kolkata.

const TZ = 'Asia/Kolkata';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** 1500 -> '₹1,500', 1500.5 -> '₹1,500.50' (same rule as shared/templates.js) */
export function inr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '₹0';
  return '₹' + n.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Current month in IST as 'YYYY-MM'. */
export function currentMonth() {
  // en-CA gives '2026-10-01' ordering
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' })
    .format(new Date()).slice(0, 7);
}

export function isMonth(s) {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** '2026-10' -> 'Oct 2026' (short) or 'October 2026' (long) */
export function monthLabel(ym, long = false) {
  if (!isMonth(ym)) return ym || '';
  const [y, m] = ym.split('-');
  const name = MONTHS[Number(m) - 1];
  return `${long ? name : name.slice(0, 3)} ${y}`;
}

/**
 * Month label used INSIDE the WhatsApp reminder text: 'October 2026' (en) /
 * 'अक्टूबर 2026' (hi). Exact mirror of monthLabel() in api/src/lib/time.js so a
 * reminder built in the browser reads the same as one built by the API.
 * Keep the two in sync.
 */
export function reminderMonthLabel(monthStr, lang = 'en') {
  const [y, m] = monthStr.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** ISO timestamp -> '1/10/2026' style Indian date */
export function shortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeDays(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return shortDate(iso);
}

export const MODES = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank', long: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];

export function modeLabel(mode) {
  const m = MODES.find((x) => x.value === mode);
  return m ? m.long || m.label : 'Other';
}

/** 1 -> '1st', 22 -> '22nd' */
export function ordinal(n) {
  const v = n % 100;
  const s = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${s}`;
}

/** Strip to digits; returns '' if empty. */
export function digits(s) {
  return String(s ?? '').replace(/\D/g, '');
}

/**
 * Phone as typed -> digits to validate and send. An 11-digit number with a
 * leading 0 (trunk prefix, '09876543210') loses the 0 — same rule as the API.
 */
export function phoneDigits(s) {
  const d = digits(s);
  return d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
}

/** Valid Indian mobile per contract: 10 digits, or 12 starting with 91. Pass phoneDigits() output. */
export function validPhone(d) {
  return /^\d{10}$/.test(d) || /^91\d{10}$/.test(d);
}

/** '919876543210' -> '98765 43210' for display */
export function prettyPhone(p) {
  let d = phoneDigits(p);
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 10) return `${d.slice(0, 5)} ${d.slice(5)}`;
  return d;
}
