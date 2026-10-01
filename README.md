# GuruKhata — Digital Fees Register for Tuition & Coaching Classes

> **One line:** The app that asks for the fees so the teacher doesn't have to.

## Who it's for
Home tuition teachers in India with ~10–50 students (often teaching from home, side or full income, fee ₹1,500–4,000/student/month). They track fees in a notebook or memory, and asking parents for money is awkward. Android + WhatsApp users; many have no laptop.

## What v1 does (nothing more)
1. Add students: name, parent's WhatsApp number, monthly fee, due day — 2-minute setup
2. Dashboard: **Paid / Due / Overdue** this month, at a glance
3. One tap on a student → WhatsApp opens with a polite pre-written reminder (Hindi/English/Hinglish) + UPI payment link → teacher hits Send **from their own number**
4. Mark paid → receipt image auto-generated, one tap to send to parent

## What v1 deliberately does NOT do
Attendance, homework, test marks, student-getting campaigns, auto-send via WhatsApp API, iOS — all **Phase 5+**. Razor-thin v1 wins.

## Why this will work (evidence, researched 2026-10-01)
- Pain is emotional, not technical: most unpaid fees = "nobody asked at the right moment"
- Existing apps for this persona are low-quality "digital notebooks" (FastFee, CoFee, Tufee, Teachers App); none dominates
- Giants proved demand then abandoned the segment (Teachmint: 1M free tutors → pivoted to schools) — open field for a zero-cost solo builder
- RentOk proved the identical playbook in rentals: WhatsApp reminders + receipts + defaulter list, 15k+ paying owners

## The three hard truths (also evidence)
- **Tutors hate paying for software.** Pricing must be tiny; free tier must be genuinely useful.
- **SEO works only in the teachers' own vocabulary** (mcp360 data): "fee reminder app" = 0 searches/mo, but "fees book" = 8,100/mo and "fees register" = 4,400/mo, both LOW competition. Product identity = "the digital Fees Book"; growth = that SEO + Play Store search + WhatsApp referrals + teacher networks.
- **First user is already committed:** Rohan's known tuition teacher = design partner. Interview before code.

## Repo layout
```
site/     Phase 1 — static site: landing + free tools (receipt generator, printable fees register)
          zero dependencies, deploys as-is to Cloudflare Pages (output dir: site/)
web/      Phase 2 — teacher app: mobile PWA (Vite + React, plain JS)
api/      Phase 2 — Express API (plain JS, ESM) + node:test suite
jobs/     monthly dues generation (optional cron; the API also generates lazily)
shared/   WhatsApp reminder templates + wa.me link builder (used by api AND web)
db/       Postgres schema (idempotent schema.sql)
docs/     roadmap, architecture, API contract, free-tier plan
```

## Run locally (no database or accounts needed)
The API uses PGlite (real Postgres inside Node) when `DATABASE_URL` is empty.

```bash
# terminal 1 — API on :3000, name-only "dev login", "Rohan" becomes admin
cd api && npm install && DEV_AUTH=1 ADMIN_DEV_NAMES=Rohan npm run dev

# terminal 2 — teacher app on :5173
cd web && npm install && npm run dev
```
Open http://localhost:5173 and log in with any name.

**Ports 3000/5173 already busy** (e.g. other projects running)? Use different ones — all three values must agree:
```bash
cd api && DEV_AUTH=1 ADMIN_DEV_NAMES=Rohan PORT=3100 CORS_ORIGINS=http://localhost:5200 npm run dev
cd web && VITE_API_URL=http://localhost:3100 npx vite --port 5200
```
→ http://localhost:5200

- Tests: `cd api && npm test`
- Free-tools site: `npx serve site`
- Reset local data: delete `api/.pglite-data/`

## Deploy
- **Site (Phase 1):** Cloudflare Pages → connect repo → build command: none → output directory: `site`.
  ⚠️ Replace `91XXXXXXXXXX` (WhatsApp pilot number) in site/index.html first.
- **API + app (Phase 2):** not deployed yet. Needs Neon (`DATABASE_URL`), `JWT_SECRET`, a Google OAuth client ID,
  `CORS_ORIGINS` — see api/.env.example and web/.env.example. The app's production build refuses to run without
  `VITE_API_URL` and `VITE_GOOGLE_CLIENT_ID`; the API refuses to boot with `DEV_AUTH` in production.

## Docs
- [docs/ROADMAP.md](docs/ROADMAP.md) — phases 0→5 with exit criteria
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, data model, backoffice/admin, key flows
- [docs/API-CONTRACT.md](docs/API-CONTRACT.md) — every endpoint, request and response
- [docs/FREE-TIER-INFRA.md](docs/FREE-TIER-INFRA.md) — every service, its free limit, and when money first appears
