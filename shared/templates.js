// FeesBook shared message templates — used by BOTH the web app (wa.me deep
// links the tutor taps) and the api (reminder channel audit, Phase 4 Cloud
// API). Dependency-free, plain ESM.
//
// v1 WhatsApp strategy (ARCHITECTURE.md): no Meta approval, no business bot —
// we only prefill a message; it is sent from the teacher's own number.

/**
 * Format an amount in Indian rupees: 1500 -> '₹1,500', 1500.5 -> '₹1,500.50'.
 */
function inr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `₹${amount}`;
  return (
    '₹' +
    n.toLocaleString('en-IN', {
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Polite fee-reminder message a parent receives on WhatsApp.
 *
 * @param {object} p
 * @param {string} p.studentName  - e.g. 'Aarav'
 * @param {string} p.monthLabel   - human label, e.g. 'October 2026' / 'अक्टूबर 2026'
 * @param {number|string} p.amount - e.g. 1500
 * @param {string} p.upiId        - teacher's UPI ID, e.g. 'teacher@upi'
 * @param {string} p.teacherName  - e.g. 'Sunita Ma\'am'
 * @param {('en'|'hi')} [lang='en']
 * @returns {string}
 */
export function reminderMessage({ studentName, monthLabel, amount, upiId, teacherName }, lang = 'en') {
  if (lang === 'hi') {
    return (
      `नमस्ते 🙏 ${studentName} की ${monthLabel} की ट्यूशन फीस ${inr(amount)} देय है। ` +
      `कृपया UPI से भुगतान करें: ${upiId}\n` +
      `भुगतान के बाद रसीद भेज दी जाएगी। धन्यवाद!\n` +
      `– ${teacherName}`
    );
  }
  return (
    `Namaste 🙏 This is a gentle reminder that ${studentName}'s tuition fee of ` +
    `${inr(amount)} for ${monthLabel} is due. ` +
    `You can pay via UPI: ${upiId}\n` +
    `A receipt will be shared once paid. Thank you!\n` +
    `– ${teacherName}`
  );
}

/**
 * Build a WhatsApp deep link: https://wa.me/<digits>?text=<encoded>.
 * Strips everything non-digit from `phone`; a bare 10-digit Indian mobile
 * number gets the country code 91 prefixed ('98765 43210' -> '919876543210';
 * '+91 98765 43210' is already fine).
 *
 * @param {string} phone
 * @param {string} text - prefilled message (e.g. from reminderMessage)
 * @returns {string}
 */
export function buildWaLink(phone, text) {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length === 10) {
    digits = '91' + digits;
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
