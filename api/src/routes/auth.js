// /api/auth — sign-in routes. STUB.
import { Router } from 'express';

const router = Router();

/**
 * POST /api/auth/google
 * Body: { id_token } — a Google ID token from Google Sign-In on the web app.
 *
 * TODO (implement):
 *   1. Verify id_token against GOOGLE_CLIENT_ID (google-auth-library, or a
 *      plain fetch to Google's tokeninfo endpoint to stay dependency-light).
 *   2. Upsert tutors by google_sub (INSERT ... ON CONFLICT (google_sub) DO
 *      UPDATE SET last_active_at = now() RETURNING id, role).
 *   3. Issue our own JWT { tutor_id, role } signed with JWT_SECRET and return
 *      it (httpOnly cookie per ARCHITECTURE.md; body fallback for the TWA).
 */
router.post('/google', (req, res) => {
  res.status(501).json({ error: 'not implemented' });
});

export default router;
