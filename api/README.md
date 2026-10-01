# gurukhata-api

Express API for GuruKhata. Plain JS + ESM, runs locally with bare Node; later deployed to AWS Lambda via `serverless-http` (the app is exported from `src/server.js` for exactly that). The endpoints are specified in [`docs/API-CONTRACT.md`](../docs/API-CONTRACT.md).

## Run fully locally (no Postgres, no Google credentials)

```bash
cd api
npm install
DEV_AUTH=1 npm run dev        # node --watch src/server.js on http://localhost:3000
```

With `DATABASE_URL` unset the API uses **PGlite** — real Postgres compiled to WASM — stored in `api/.pglite-data/` (gitignored). `db/schema.sql` is applied automatically on boot (it is idempotent). Delete that folder to start from an empty database. The boot log says which driver is active:

```
[db] driver: PGlite (DATABASE_URL is unset) — local WASM Postgres at .../api/.pglite-data
```

`DEV_AUTH=1` enables `POST /api/auth/dev { name }` (same name = same tutor) and, if `JWT_SECRET` is unset, signs tokens with a fixed public dev secret (loud warning at boot). Never set `DEV_AUTH` in production — the server **refuses to boot** (exit 1, or a throw at module init on Lambda) when `DEV_AUTH=1` is combined with `DATABASE_URL` or `AWS_LAMBDA_FUNCTION_NAME`, and when `DATABASE_URL` is set without `JWT_SECRET` (`configErrors()` in `src/config.js`). To make a dev user admin: `ADMIN_DEV_NAMES="Rohan" DEV_AUTH=1 npm run dev`.

## Run against Postgres / Neon

```bash
cp .env.example .env     # fill in DATABASE_URL, GOOGLE_CLIENT_ID, JWT_SECRET, ADMIN_GOOGLE_SUBS
psql "$DATABASE_URL" -f ../db/schema.sql   # idempotent — re-run after every schema change
npm start
```

With the pg driver the schema is **not** auto-applied — run the `psql` line above (it also adds the v1 columns `tutors.receipt_seq` and `dues.payment_mode` to an existing database).

## Environment

See `.env.example`. Summary: `DATABASE_URL`, `PGLITE_DATA_DIR`, `PORT`, `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `DEV_AUTH`, `ADMIN_GOOGLE_SUBS`, `ADMIN_DEV_NAMES`, `CORS_ORIGINS` (default `http://localhost:5173`), `LOG_REQUESTS`.

## Try it

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/dev -H 'content-type: application/json' \
  -d '{"name":"Sunita"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
H="authorization: Bearer $TOKEN"

curl -s -X PATCH localhost:3000/api/me -H "$H" -H 'content-type: application/json' -d '{"upiId":"sunita@okaxis"}'
curl -s -X POST localhost:3000/api/students -H "$H" -H 'content-type: application/json' \
  -d '{"name":"Aarav","parentPhone":"9876543210","monthlyFee":1500,"dueDay":5}'
curl -s localhost:3000/api/dues -H "$H"                 # lazily creates this month's dues
curl -s -X POST localhost:3000/api/dues/1/pay -H "$H" -H 'content-type: application/json' -d '{"mode":"upi"}'
curl -s -X POST localhost:3000/api/dues/1/remind -H "$H" -H 'content-type: application/json' -d '{}'
curl -s localhost:3000/api/dues/uncollected -H "$H"
```

## Tests

```bash
npm test     # node:test, each file boots the app on an ephemeral port against a fresh PGlite DB in a temp dir
```

## Layout

```
src/server.js            app + boot (CORS, health, logging, routers, 404, error handler)
src/db.js                query() over pg (DATABASE_URL) or PGlite (local) — read the multi-tenant rule there
src/config.js            env: JWT secret, dev auth, bootstrap admins, CORS origins
src/middleware/auth.js   signToken / requireAuth (sets req.tutor) / requireAdmin
src/routes/auth.js       POST /api/auth/google, POST /api/auth/dev
src/routes/me.js         GET/PATCH /api/me
src/routes/students.js   /api/students CRUD (soft delete)
src/routes/dues.js       /api/dues (+ lazy generation), /uncollected, /:id/pay|unpay|waive|remind
src/lib/dues-generation.js  which dues must exist (backfill rule) — shared with jobs/generate-dues.js
src/routes/admin.js      /api/admin/stats, /api/admin/tutors (admin only)
src/lib/                 time (IST), validation, row→JSON mappers, HttpError
test/                    node:test suites (+ helpers.js harness)
```

## Receipts

`POST /api/dues/:id/pay` atomically bumps `tutors.receipt_seq` and stamps `RC-<IST year of payment>-<seq, min 4 digits>` (e.g. `RC-2026-0001`). The counter is per tutor, never decremented (an unpaid number is not reused) and does not reset in January.
