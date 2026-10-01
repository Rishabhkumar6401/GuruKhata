// FeesBook API server.
// Runs locally with `node src/server.js`; later wrapped with serverless-http
// on AWS Lambda (Function URL) — that's why the Express app is exported and
// `listen()` only happens when this file is executed directly.
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import express from 'express';

// Side-effect import: logs a clear boot warning if DATABASE_URL is missing.
// The pool itself is lazy — no connection is made until the first query.
import './db.js';

import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';

const app = express();

app.use(express.json());

// Tiny hand-rolled request logger: method, path, status, duration in ms.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// Health check — must work even with no DATABASE_URL configured.
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);

// 404 — anything not matched above.
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// Central error handler. Logs the full error server-side; NEVER leaks the
// stack (or internal message) to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal server error' });
});

// Listen only when run directly (`node src/server.js`). On Lambda,
// serverless-http imports `app` and no port is opened.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`FeesBook API listening on http://localhost:${port}`);
  });
}

export default app;
