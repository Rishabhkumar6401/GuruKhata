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
          zero dependencies, deploys as-is to Cloudflare Pages (build dir: site/)
api/      Express API skeleton (plain JS, ESM) — Phase 2
jobs/     cron scripts (monthly dues generation) — Phase 2
shared/   WhatsApp message templates + wa.me link builder
db/       Postgres schema (idempotent schema.sql)
docs/     planning docs (see below)
```

## Run locally
- Site: `npx serve site` (or any static server) → http://localhost:3000
- API: see api/README.md

## Deploy (Phase 1)
Cloudflare Pages → connect repo → build command: none → output directory: `site`.
⚠️ Before deploy: replace `91XXXXXXXXXX` (WhatsApp pilot number) in site/index.html and `gurukhata.pages.dev` in canonicals/robots/sitemap.

## Docs
- [docs/ROADMAP.md](docs/ROADMAP.md) — phases 0→5 with exit criteria
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, data model, backoffice/admin, key flows
- [docs/FREE-TIER-INFRA.md](docs/FREE-TIER-INFRA.md) — every service, its free limit, and when money first appears
