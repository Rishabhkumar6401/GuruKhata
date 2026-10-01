// Auth middleware + JWT helpers.
//
// Flow (docs/ARCHITECTURE.md, docs/API-CONTRACT.md):
//   POST /api/auth/google (or /api/auth/dev when DEV_AUTH=1) upserts the tutor
//   and issues our own JWT { sub: tutorId, role } (JWT_SECRET, 30 days).
//   requireAuth verifies that JWT on every protected route, loads the tutor
//   row and sets req.tutor. Multi-tenant rule #1: every downstream query
//   filters by req.tutor.id.
//
// Authorisation uses the role from the DATABASE row, not the token claim, so
// a demoted admin loses access immediately (the claim is informational).
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { jwtSecret } from '../config.js';

const TOKEN_TTL = '30d';
const LAST_ACTIVE_THROTTLE_MS = 60 * 60 * 1000; // update last_active_at at most hourly

export const AUTH_NOT_CONFIGURED = 'server auth is not configured: JWT_SECRET is not set';
// 4xx messages are shown to the teacher as-is by the web app: plain English.
const SIGN_IN_AGAIN = 'Please sign in again.';

export function signToken(tutor) {
  const secret = jwtSecret();
  if (!secret) throw new Error(AUTH_NOT_CONFIGURED);
  return jwt.sign({ sub: String(tutor.id), role: tutor.role }, secret, {
    algorithm: 'HS256',
    expiresIn: TOKEN_TTL,
  });
}

/**
 * requireAuth — verify the Bearer JWT, load the tutor, set req.tutor (DB row).
 * 401 for a missing/invalid/expired token or a tutor that no longer exists.
 */
export async function requireAuth(req, res, next) {
  const secret = jwtSecret();
  if (!secret) return res.status(500).json({ error: AUTH_NOT_CONFIGURED });

  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: SIGN_IN_AGAIN });
  }

  let payload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: SIGN_IN_AGAIN });
  }
  if (!payload || typeof payload.sub !== 'string' || !/^[1-9]\d{0,17}$/.test(payload.sub)) {
    return res.status(401).json({ error: SIGN_IN_AGAIN });
  }

  const { rows } = await query('SELECT * FROM tutors WHERE id = $1', [payload.sub]);
  const tutor = rows[0];
  if (!tutor) return res.status(401).json({ error: SIGN_IN_AGAIN });

  const last = tutor.last_active_at ? new Date(tutor.last_active_at).getTime() : 0;
  if (Date.now() - last > LAST_ACTIVE_THROTTLE_MS) {
    const upd = await query('UPDATE tutors SET last_active_at = now() WHERE id = $1 RETURNING last_active_at', [
      tutor.id,
    ]);
    if (upd.rows[0]) tutor.last_active_at = upd.rows[0].last_active_at;
  }

  req.tutor = tutor;
  next();
}

/** requireAdmin — use AFTER requireAuth. 403 unless the tutor's role is admin. */
export function requireAdmin(req, res, next) {
  if (!req.tutor) return res.status(401).json({ error: SIGN_IN_AGAIN });
  if (req.tutor.role !== 'admin') return res.status(403).json({ error: "You don't have access to this page." });
  next();
}
