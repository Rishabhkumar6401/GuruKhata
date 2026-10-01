// DB row (snake_case, driver-specific types) -> contract JSON (camelCase,
// numbers for ids and money). pg returns BIGINT and NUMERIC as strings.
import { isOverdue } from './time.js';

const num = (v) => (v === null || v === undefined ? null : Number(v));
const iso = (v) => (v === null || v === undefined ? null : new Date(v).toISOString());

export function toTutor(r) {
  return {
    id: num(r.id),
    name: r.name,
    phone: r.phone,
    upiId: r.upi_id,
    languagePref: r.language_pref,
    role: r.role,
    plan: r.plan,
  };
}

export function toStudent(r) {
  return {
    id: num(r.id),
    name: r.name,
    parentName: r.parent_name,
    parentPhone: r.parent_phone,
    subject: r.subject,
    monthlyFee: num(r.monthly_fee),
    dueDay: num(r.due_day),
    active: r.active,
  };
}

/** Expects the DUE_SELECT columns from routes/dues.js. */
export function toDue(r, now = new Date()) {
  return {
    id: num(r.id),
    studentId: num(r.student_id),
    studentName: r.student_name,
    parentPhone: r.parent_phone,
    subject: r.subject,
    month: r.month,
    amount: num(r.amount),
    status: r.status,
    overdue: isOverdue(r.status, r.month, r.due_day, now),
    paidAt: iso(r.paid_at),
    receiptNo: r.receipt_no,
    paymentMode: r.payment_mode,
  };
}

export { num, iso };
