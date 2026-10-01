// Auth middleware — STUBS. Structure is final, implementation is TODO.
//
// Planned flow (see docs/ARCHITECTURE.md):
//   POST /api/auth/google verifies a Google ID token, upserts the tutor and
//   issues our own JWT (signed with JWT_SECRET). requireAuth verifies that
//   JWT on every protected route and sets req.user = { tutor_id, role }.
//   Multi-tenant rule #1: every downstream query filters by req.user.tutor_id.

/**
 * requireAuth — verify the Bearer JWT and populate req.user.
 *
 * TODO (implement):
 *   1. Verify `token` with JWT_SECRET (add the `jsonwebtoken` dep when we do).
 *   2. On success: req.user = { tutor_id, role } from the token payload; next().
 *   3. On failure: 401 { error: "invalid token" }.
 *   4. Optionally touch tutors.last_active_at (throttled, not every request).
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'missing bearer token' });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(501).json({ error: 'auth not implemented' });
  }

  // TODO: jwt.verify(token, process.env.JWT_SECRET) → req.user = { tutor_id, role }
  return res.status(501).json({ error: 'auth not implemented' });
}

/**
 * requireAdmin — use AFTER requireAuth. Backoffice routes only.
 * Audit rule: every admin WRITE must also insert a row into admin_log.
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    // requireAuth must run first in the chain.
    return res.status(401).json({ error: 'unauthenticated' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}
