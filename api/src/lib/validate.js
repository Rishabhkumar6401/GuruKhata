// Input validation. Each validator returns the normalised value or throws a
// 400 HttpError with a human-readable message (contract: { error }).
//
// The web app shows that message to the teacher AS-IS, so every validator
// takes a plain-English `label` ("Monthly fee", "Parent's WhatsApp number"),
// never a field name, and every message is a full sentence with no jargon.
import { badRequest } from './http.js';

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** Required trimmed string, 1..max chars. */
export function requiredText(v, label, max = 60) {
  if (typeof v !== 'string' || v.trim().length < 1) throw badRequest(`${label} is required.`);
  if (v.trim().length > max) throw badRequest(`${label} can be at most ${max} characters.`);
  return v.trim();
}

/** Optional trimmed string up to max chars; blank -> null. */
export function optionalText(v, label, max = 60) {
  if (isBlank(v)) return null;
  if (typeof v !== 'string') throw badRequest(`${label} must be text.`);
  if (v.trim().length > max) throw badRequest(`${label} can be at most ${max} characters.`);
  return v.trim();
}

/**
 * Indian phone, stored as digits only: 10 digits, or 12 digits starting 91.
 * Formatting characters (space, +, -, parentheses) are stripped; blank -> null.
 * The domestic trunk prefix is accepted: 11 digits starting with a single 0
 * ('098765 43210') drop that 0 and are stored as the 10-digit number.
 */
export function optionalPhone(v, label) {
  if (isBlank(v)) return null;
  const invalid = () => badRequest(`${label} must be a 10-digit mobile number.`);
  if (typeof v !== 'string' && typeof v !== 'number') throw invalid();
  const raw = String(v);
  if (!/^[\d\s+\-()]+$/.test(raw)) throw invalid();
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 || (digits.length === 12 && digits.startsWith('91'))) return digits;
  throw invalid();
}

/** Money in rupees, 0..1,000,000, rounded to paise (NUMERIC(10,2)). */
export function money(v, label) {
  if (isBlank(v)) throw badRequest(`${label} is required.`);
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1_000_000) {
    throw badRequest(`${label} must be between ₹0 and ₹10,00,000.`);
  }
  return Math.round(n * 100) / 100;
}

/** Integer day of month 1..28. */
export function dueDay(v, label = 'Fee due day') {
  const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v;
  if (!Number.isInteger(n) || n < 1 || n > 28) throw badRequest(`${label} must be a number from 1 to 28.`);
  return n;
}

export function bool(v, label) {
  if (typeof v !== 'boolean') throw badRequest(`${label} must be yes or no.`);
  return v;
}

export function lang(v, label = 'Reminder language') {
  if (v !== 'en' && v !== 'hi') throw badRequest(`${label} must be English or Hindi.`);
  return v;
}

/** UPI VPA like 'name@bank'; blank -> null. */
export function optionalUpiId(v, label = 'UPI ID') {
  if (isBlank(v)) return null;
  if (typeof v !== 'string' || !/^[A-Za-z0-9._-]{1,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(v.trim())) {
    throw badRequest(`${label} should look like name@okhdfcbank.`);
  }
  return v.trim();
}

export const PAYMENT_MODES = ['upi', 'cash', 'bank', 'other'];
export const PAYMENT_MODES_MESSAGE = 'Choose how the fee was paid: UPI, cash, bank or other.';

/** Generic message for a malformed request the web app should never send. */
export const BAD_REQUEST_MESSAGE = 'Something went wrong with that request. Please try again.';

/** Plain-object body guard (express.json leaves req.body undefined for no body). */
export function body(req) {
  const b = req.body;
  if (b === undefined || b === null) return {};
  if (typeof b !== 'object' || Array.isArray(b)) throw badRequest(BAD_REQUEST_MESSAGE);
  return b;
}
