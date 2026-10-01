// GuruKhata API server.
// Runs locally with `node src/server.js`; later wrapped with serverless-http
// on AWS Lambda (Function URL) — that's why the Express app is exported and
// `listen()` only happens when this file is executed directly.
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import express from 'express';
import cors from 'cors';

// Side-effect import: logs which DB driver is active (pg vs local PGlite).
// Both are lazy — nothing connects until the first query.
import { closeDb, initDb } from './db.js';
import { assertSafeConfig, corsOrigins, logAuthConfig } from './config.js';
import { BAD_REQUEST_MESSAGE } from './lib/validate.js';
import { HttpError } from './lib/http.js';

import authRouter from './routes/auth.js';
import meRouter from './routes/me.js';
import studentsRouter from './routes/students.js';
import duesRouter from './routes/dues.js';
import adminRouter from './routes/admin.js';

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

// Refuse to boot with an unsafe config (DEV_AUTH outside local dev, or a real
// database without JWT_SECRET). Run directly: clear message + exit 1. Imported
// (Lambda via serverless-http): throw, so module init — and every invocation —
// fails instead of serving with dev login enabled.
try {
  assertSafeConfig();
} catch (err) {
  console.error(err.message);
  if (isMain) process.exit(1);
  throw err;
}

logAuthConfig();

const app = express();

const allowedOrigins = corsOrigins();
app.use(
  cors({
    // Non-browser clients (curl, server-to-server) send no Origin — allow them.
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  })
);

app.use(express.json({ limit: '100kb' }));

// Tiny hand-rolled request logger: method, path, status, duration in ms.
// Silenced with LOG_REQUESTS=0 (the test suite does this).
if (process.env.LOG_REQUESTS !== '0') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });
}

// Health check — must work even with no database configured.
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/students', studentsRouter);
app.use('/api/dues', duesRouter);
app.use('/api/admin', adminRouter);

// 404 — anything not matched above.
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// Central error handler. 4xx errors carrying a status (our HttpError, or
// express.json's body-parse errors) become { error }. Everything else is
// logged server-side and answered with a generic 500 — NEVER leak the stack
// (or internal message) to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return;
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500) {
    // Our HttpErrors carry teacher-facing text; anything else (body-parser's
    // invalid JSON / too large, …) gets the generic plain-English message.
    const message = err instanceof HttpError ? err.message : BAD_REQUEST_MESSAGE;
    return res.status(status).json({ error: message });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'internal server error' });
});

// Listen only when run directly (`node src/server.js`). On Lambda,
// serverless-http imports `app` and no port is opened.
if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, () => {
    console.log(`GuruKhata API listening on http://localhost:${port}`);
  });
  // Warm the DB (applies the schema on PGlite) so problems show at boot,
  // not on the first request. The server keeps running either way.
  initDb().catch((err) => console.error('[db] initialisation failed:', err.message));

  // Graceful shutdown: PGlite must be closed cleanly to flush its data dir
  // (an abrupt kill also makes Postgres skip ~32 ids per sequence on restart).
  const shutdown = (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close();
    closeDb()
      .catch((err) => console.error('[db] close failed:', err.message))
      .finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

export default app;
