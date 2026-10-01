# feesbook-api

Express API for FeesBook. Plain JS + ESM, runs locally with bare Node; later deployed to AWS Lambda via `serverless-http` (the app is exported from `src/server.js` for exactly that).

## Quickstart

```bash
cd api
npm install

# env (optional for booting — the server runs without a DB and still serves /health)
cp .env.example .env
# fill in DATABASE_URL (Neon), GOOGLE_CLIENT_ID, JWT_SECRET

npm start          # node src/server.js  (PORT env, default 3000)
# or during development:
npm run dev        # node --watch src/server.js
```

## Test it

```bash
curl http://localhost:3000/health
# {"ok":true}

curl -X POST http://localhost:3000/api/auth/google
# {"error":"not implemented"}   (501 — stub)

curl http://localhost:3000/api/admin/stats
# {"error":"missing bearer token"}   (401 — admin routes require a Bearer JWT)
```

## Apply the schema

```bash
psql "$DATABASE_URL" -f ../db/schema.sql
```

Idempotent (`IF NOT EXISTS` throughout) — safe to re-run.

## Layout

```
src/server.js          app + boot (health, logging, 404, error handler)
src/db.js              lazy pg Pool + query() — read the multi-tenant rule there
src/middleware/auth.js requireAuth / requireAdmin (stubs)
src/routes/auth.js     POST /api/auth/google (stub)
src/routes/admin.js    GET /api/admin/stats (stub, admin-only)
```
