# Free-tier infrastructure plan — where ₹0 holds, and where money first appears

Goal: ₹0 spend until the product proves itself (Phase 3 exit). Verified against each provider's current free tier — re-check limits before Phase 4 (tiers change).

## The free stack and its headroom

| Service | Free tier | Our usage at 1,000 active tutors* | Headroom verdict |
|---|---|---|---|
| Cloudflare Pages (web) | unlimited static requests/bandwidth, 500 builds/mo | trivial | years |
| AWS Lambda (api + jobs) | 1M requests + 400k GB-s compute/mo, **always free** | ~30 API calls/tutor/day → ~900k req/mo | fits exactly at 1k tutors; first paid rupees ≈ ₹100s/mo beyond that |
| Neon Postgres | 0.5 GB storage, ~190 compute-hrs/mo | 1k tutors × 30 students × 12 mo of dues ≈ well under 100 MB | years |
| Google OAuth | free | — | forever |
| Web Push (VAPID) | free (browser vendors') | — | forever |
| Cloudflare Web Analytics | free | — | forever |
| `wa.me` deep links | free (not an API) | — | forever |
| GitHub (repo + Actions CI) | free 2,000 CI min/mo | small | years |

*1,000 active tutors would already be a wild success for Phase 3–4; the point: free tiers outlast validation by a wide margin.

## Costs that are DEFERRED, not hidden (be honest with ourselves)

| Cost | Amount | When it actually starts |
|---|---|---|
| Domain (.in/.com) | ~₹800/yr | Phase 4 (pilot runs on free `*.pages.dev` subdomain) |
| Play Store developer account | $25 one-time | Phase 4 |
| WhatsApp Cloud API templates | ~₹0.12/message | Phase 4, **only for paying subscribers** → priced into ₹99–149 plan (a tutor with 30 students × 3 reminders ≈ ₹11/mo cost vs ₹99 revenue — margin safe) |
| Claude Haiku API (AI drafting) | ~paise per message drafted | Phase 4, paid tier only; free tier uses static templates at ₹0 |
| Razorpay fees | ~2% of subscription | only on actual revenue |

**Total cash needed to reach first revenue: ≈ ₹800 + $25. Nothing else.**

## Free-tier risks to watch (so we're not surprised)
1. **Lambda cold starts** (~0.5–1.5s on Node) — acceptable for this app; keep the function warm-ish via the daily crons; don't add provisioned concurrency (that's paid)
2. **Neon autosuspend** (free tier suspends idle compute; first query after idle ~1s) — fine for our traffic shape
3. **Tier changes** — providers shrink free tiers (Fly and Railway already did); our exit hatches: api is a plain Express app (runs anywhere), DB is plain Postgres (dump/restore anywhere). Nothing in the architecture is locked to a vendor.
4. **The `wa.me` ceiling** — if a tutor sends 40 identical-ish messages rapidly, WhatsApp may flag their personal number for spam. Mitigations: templates vary wording automatically; send-all is a guided one-by-one flow, not a blast. Document this in-app ("send a few at a time").

## Scale-up triggers (write the cheque only when the metric says so)
- Lambda > 800k req/mo → either optimize call patterns or move api to a ~$5 VPS (still trivial money at that usage)
- Neon near 0.4 GB → archive old `reminders` rows first, upgrade second
- > 50 paying tutors → buy monitoring (or self-host Uptime Kuma free) and start a proper error tracker (Sentry free tier first)
