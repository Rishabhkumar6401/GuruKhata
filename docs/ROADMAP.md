# Roadmap — phases with exit criteria

Rule: a phase is DONE only when its exit criteria pass. No starting the next phase early. Timeboxes assume evenings + weekends alongside the day job.

---

## Phase 0 — Validate before code (this week, ~2 hrs)
- [x] 5-question interview with the known tuition teacher — DONE 2026-10-01, verdict: **YELLOW** ("good to have," ₹49–99 ceiling; see DECISIONS.md)
- [ ] **Validation round 2 (now the gate):** 3–5 more tutors, prefer 25+ students, add Q6 (student count) + Q7 (ever discovered 2+ unpaid months?) — testing the fee-LEAKAGE painkiller hypothesis
- [ ] Decide product name + check Play Store / domain availability
- [ ] Create GitHub repo (private until launch is fine)

**Exit criteria:** ≥2 tutors with 25+ students confirm real leakage pain (Q7) → Phase 2 green-lit with "Uncollected fees: ₹X" as hero feature.
**Kill/downgrade signal:** all round-2 tutors also say "good to have" → downgrade to portfolio side-project; revisit webhook-gateway as the main public project. Phase 1 proceeds regardless (serves any outcome).

## Phase 1 — Free-tools site: the SEO funnel (1–2 weekends)
Target the REAL vocabulary (mcp360 data): **"fees book" 8,100/mo + "fees register" 4,400/mo + "tuition fees receipt" 880/mo + "attendance register app" 880/mo — all LOW/MED competition.**
- [ ] Landing page positioned as **"the digital Fees Book"** — in their words, not SaaS words
- [ ] Free tool #1: receipt generator (fill → downloadable/WhatsApp-shareable image, client-side canvas)
- [ ] Free tool #2: **printable fees register PDF template** (captures "fees book/register" searchers who want paper → "or stop writing: free app" CTA)
- [ ] "Join the pilot" button (WhatsApp link to Rohan)
- [ ] Deploy on Cloudflare Pages (free subdomain OK for now) + Cloudflare analytics
- [ ] Play Store name collision check for "FeeBook"-style names

**Exit criteria:** site live and indexed for the register/book keywords; teacher has made one real receipt with it.

## Phase 2 — PWA v1, the real product (2–3 weeks)
- [ ] Google sign-in (every Android user has one; no OTP costs)
- [ ] Students CRUD: name, parent WhatsApp number, monthly fee, due day, subject
- [ ] Monthly dues auto-generated (cron) + dashboard: Paid / Due / Overdue
- [ ] One-tap reminder: `wa.me` link with pre-filled polite message (3 templates × Hindi/English/Hinglish, teacher picks tone once) + their UPI ID in the message
- [ ] Mark paid → receipt image → one-tap share to parent
- [ ] PWA: manifest, install prompt, icon, offline view of roster
- [ ] Mobile-only layout; desktop shows "open on your phone" + QR

**Exit criteria:** the teacher runs one full month's fee cycle (dues appear → reminders sent → payments marked → receipts delivered) without calling Rohan for help.

## Phase 3 — Pilot with 5–10 tutors (3–4 weeks, overlaps 2)
- [ ] Onboard tutors from the teacher's referrals, one by one (watch them use it — every confusion = a bug)
- [ ] Web push: "Today 5 students' fees are due — tap to send reminders"
- [ ] Reminder log (what was sent when — teachers forget)
- [ ] Fix what the pilot breaks; add NOTHING new beyond this list

**Exit criteria:** ≥5 tutors complete a full month unaided; ≥3 say they'd be upset if it disappeared. That sentence is the go/no-go for spending any money.

## Phase 4 — Play Store + first revenue (3–4 weeks)
First real money spent: domain ~₹800/yr + Play Store $25 one-time. Only after Phase 3 passes.
- [ ] Wrap PWA as TWA → publish to Play Store (the discovery channel; optimize listing for "fees app", "tuition app" style searches)
- [ ] Referral loop: "Share with a teacher friend" (prefilled WhatsApp message)
- [ ] Paid tier via Razorpay (₹99–149/mo hypothesis — ⚠️ Rohan's/Claude's invented number, must be validated against interview answers): auto-send reminders via WhatsApp Cloud API (template msgs ~₹0.12 each — cost attaches only to paying users), auto-receipts, full history
- [ ] AI feature (paid tier): LLM-drafted personalized reminders & parent progress notes (Claude Haiku — cheap; cost gated behind revenue). Free tier keeps smart templates.

**Exit criteria:** app live on Play Store; first paying tutor.

## Phase 5 — Expand only from demand (ongoing)
Candidate features, strictly ranked by what pilot tutors ask for: attendance quick-mark → test marks + AI progress summary to parents → homework sharing → "get more students" referral posters → batches/timetable.
**Rule:** nothing enters development without 3 tutors asking for it.

---

## Growth model (no SEO illusions)
Play Store search + in-app WhatsApp referral loop + tutor word-of-mouth. The receipt page is the only Google-SEO asset. No paid ads until revenue covers them.
