// /api/auth — sign-in routes. Both return 200 { token, tutor }.
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { query } from '../db.js';
import { adminDevNames, adminGoogleSubs, devAuthEnabled, jwtSecret } from '../config.js';
import { AUTH_NOT_CONFIGURED, signToken } from '../middleware/auth.js';
import { toTutor } from '../lib/mappers.js';
import { badRequest, HttpError } from '../lib/http.js';
import { body, requiredText } from '../lib/validate.js';

const router = Router();

// Refuse to issue tokens at all when there is no signing secret.
router.use((req, res, next) => {
  if (!jwtSecret()) return res.status(500).json({ error: AUTH_NOT_CONFIGURED });
  next();
});

/**
 * Upsert a tutor by google_sub. On first login the display name comes from
 * the identity provider; afterwards the tutor's own (PATCH /api/me) name is
 * kept. Bootstrap admins are promoted on every login, never demoted here.
 */
async function upsertTutor(googleSub, name, makeAdmin) {
  const { rows } = await query(
    `INSERT INTO tutors (google_sub, name, role, last_active_at)
     VALUES ($1, $2, CASE WHEN $3::boolean THEN 'admin' ELSE 'tutor' END, now())
     ON CONFLICT (google_sub) DO UPDATE
       SET last_active_at = now(),
           name = COALESCE(tutors.name, EXCLUDED.name),
           role = CASE WHEN $3::boolean THEN 'admin' ELSE tutors.role END
     RETURNING *`,
    [googleSub, name, makeAdmin]
  );
  return rows[0];
}

const respond = (res, tutor) => res.json({ token: signToken(tutor), tutor: toTutor(tutor) });

// Shown to the teacher as-is by the web app.
const GOOGLE_FAILED = 'Google sign-in failed. Please try again.';

let googleClient = null;

/** POST /api/auth/google { idToken } */
router.post('/google', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'server auth is not configured: GOOGLE_CLIENT_ID is not set' });
  }
  const { idToken } = body(req);
  if (typeof idToken !== 'string' || !idToken) throw badRequest(GOOGLE_FAILED);

  googleClient ??= new OAuth2Client(clientId);
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: clientId });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, GOOGLE_FAILED);
  }
  if (!payload?.sub) throw new HttpError(401, GOOGLE_FAILED);

  const name = (payload.name || payload.given_name || 'Teacher').slice(0, 60);
  const tutor = await upsertTutor(payload.sub, name, adminGoogleSubs().includes(payload.sub));
  respond(res, tutor);
});

/** POST /api/auth/dev { name } — only when DEV_AUTH=1, otherwise 404. */
router.post('/dev', async (req, res) => {
  if (!devAuthEnabled()) return res.status(404).json({ error: 'not found' });
  const name = requiredText(body(req).name, 'Name', 60);
  const key = name.toLowerCase();
  const tutor = await upsertTutor(`dev:${key}`, name, adminDevNames().includes(key));
  respond(res, tutor);
});

export default router;
