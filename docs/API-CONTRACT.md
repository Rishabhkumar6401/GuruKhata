# API Contract — v1 (Phase 2)

The single agreement between `api/` and `web/`. Change it here first, then in code.

## Conventions
- Base URL: `VITE_API_URL` on the web side (dev default `http://localhost:3000`)
- JSON in, JSON out. Errors: `{ "error": "human readable message" }` with a proper status (400 validation, 401 no/bad token, 403 not allowed, 404 not found or not yours, 409 conflict)
- **4xx `error` strings are written for the teacher** and the web shows them as-is: one plain-English sentence, no field names or jargon (e.g. `"Monthly fee must be between ₹0 and ₹10,00,000."`, `"Add the parent's WhatsApp number first."`). They are display text, not codes — never branch on them; branch on the status. **5xx** bodies (`"internal server error"`, or an operator hint such as a missing `GOOGLE_CLIENT_ID`) are not for display — the web shows its own message for any 5xx.
- Auth: `Authorization: Bearer <jwt>` on every `/api/*` route except `/api/auth/*`. JWT expires in 30 days.
- Money: numbers in **rupees** (e.g. `1500` or `1500.5`), never strings.
- Months: `"YYYY-MM"` strings, computed in **Asia/Kolkata**.
- Tenancy: a tutor only ever sees their own rows. Anything belonging to another tutor returns **404** (not 403 — don't confirm existence).

## Types
```js
Tutor   = { id, name, phone, upiId, languagePref: 'en'|'hi', role: 'tutor'|'admin', plan: 'free'|'paid' }
Student = { id, name, parentName, parentPhone, subject, monthlyFee, dueDay, active }
Due     = { id, studentId, studentName, parentPhone, subject, month, amount,
            status: 'due'|'paid'|'waived',
            overdue,          // true when status='due' and today (IST) is past dueDay of that month, or the month is in the past
            paidAt, receiptNo, paymentMode }
```

## Auth
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/auth/google` | `{ idToken }` | `200 { token, tutor }` — verifies Google ID token (aud = `GOOGLE_CLIENT_ID`), upserts tutor by `google_sub` |
| POST | `/api/auth/dev` | `{ name }` | `200 { token, tutor }` — **only when `DEV_AUTH=1`**, otherwise 404. Local testing without Google credentials. Same name = same tutor. The server **refuses to boot** with `DEV_AUTH=1` when `DATABASE_URL` or `AWS_LAMBDA_FUNCTION_NAME` is set (local PGlite only), and refuses to boot with `DATABASE_URL` set but no `JWT_SECRET`. |

## Me
| GET | `/api/me` | — | `{ tutor }` |
|---|---|---|---|
| PATCH | `/api/me` | any of `{ name, phone, upiId, languagePref }` | `{ tutor }` |

## Students
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/students` | `?active=all` to include inactive | `{ students: Student[] }` sorted by name |
| POST | `/api/students` | `{ name*, parentName, parentPhone, subject, monthlyFee*, dueDay }` | `201 { student }` |
| PATCH | `/api/students/:id` | any Student field | `{ student }` — see "Fee edits and dues" below |
| DELETE | `/api/students/:id` | — | `204` — soft delete (`active=false`); existing dues kept |

Validation: `name` 1–60 chars; `monthlyFee` 0–1,000,000 (a fee of `0` means the student is never billed — no dues are generated); `dueDay` 1–28 (default 5 — ⚠️ invented default, needs sign-off); `parentPhone` optional, stored as digits, 10 digits (Indian) or 12 with `91`; formatting (spaces, `+`, `-`, brackets) is ignored and the domestic trunk prefix is accepted — 11 digits starting with `0` (`"098765 43210"`) are stored as the 10-digit number (`"9876543210"`). The tutor's own `phone` (`PATCH /api/me`) follows the same rule.

**Fee edits and dues** (same transaction as the student update; past months and paid/waived dues are never changed — history stays truthful):
- `monthlyFee` in a PATCH re-prices the **current IST month's** due for that student **if it is still `due`** (e.g. ₹15,000 typo → corrected to ₹1,500 → this month's open due becomes ₹1,500). A paid or waived current-month due keeps its amount; earlier months keep theirs.
- When a student **becomes billable** — reactivated (`active: true`) or fee raised from ₹0 — the current month's due is created immediately. Months while the student was inactive or on a ₹0 fee are **not** billed retroactively (generation only fills months after a student's latest due; see "Lazy generation").

## Dues — the core of the product
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/dues` | `?month=YYYY-MM` (default current IST month) | `{ month, summary, dues: Due[] }` |
| GET | `/api/dues/uncollected` | — | `{ total, count, dues: Due[] }` — **every** unpaid due across all months up to and including current, oldest first. This is the "₹X uncollected" hero number. |
| POST | `/api/dues/:id/pay` | `{ mode: 'upi'|'cash'|'bank'|'other' }` | `{ due }` — sets paid, assigns next per-tutor `receiptNo` (`RC-2026-0001`), idempotent if already paid (returns existing) |
| POST | `/api/dues/:id/unpay` | — | `{ due }` — undo a mistaken mark (receiptNo is NOT reused) |
| POST | `/api/dues/:id/waive` | — | `{ due }` |
| POST | `/api/dues/:id/remind` | `{ lang? }` | `{ message, waLink }` — builds message with `shared/templates.js` (tutor's `upiId`, name; lang defaults to tutor pref), logs a `reminders` row (channel `wa_link`). 409 if the due is already paid or waived; 400 if student has no parentPhone. |

`summary = { expected, collected, pending, paidCount, dueCount, overdueCount }` for that month.

**Lazy generation (with backfill):** `GET /api/dues` and `GET /api/dues/uncollected` first make sure this tutor's dues exist **up to and including the current IST month** (`INSERT … ON CONFLICT DO NOTHING`, so repeat loads never duplicate). For every **active** student with **`monthlyFee > 0`**, a `due` row is created for each month from the **latest** of:
1. the IST month the student was added,
2. the month after the student's latest existing due (any status; only dues up to the current month count),
3. 12 months before the current month (cap — ⚠️ invented value, needs sign-off),

through the current month, each at the student's **current** `monthlyFee`. So a month in which the tutor never opened the app is still billed on the next load (student added 15 Sep, next opened 10 Nov → September, October and November dues all appear), while gaps *before* a student's latest due are never filled in (see "Fee edits and dues" for reactivation and ₹0 fees). Inactive students and ₹0 students get nothing. The monthly cron (`jobs/generate-dues.js`) runs the exact same rule across all tutors — it is an optimisation, not a dependency: the pilot works with no scheduler at all.

## Admin (role = admin only; 403 otherwise)
| GET | `/api/admin/stats` | — | `{ tutors, activeTutors7d, students, duesThisMonth, paidThisMonth, remindersThisMonth }` |
|---|---|---|---|
| GET | `/api/admin/tutors` | — | `{ tutors: [{ id, name, studentCount, lastActiveAt, createdAt, plan }] }` newest first |

## Health
`GET /health` → `{ ok: true }` (no auth)
