// /api/me — the signed-in tutor's own profile.
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { toTutor } from '../lib/mappers.js';
import { body, lang, optionalPhone, optionalUpiId, requiredText } from '../lib/validate.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json({ tutor: toTutor(req.tutor) });
});

/** PATCH /api/me — any of { name, phone, upiId, languagePref }; unknown keys ignored. */
router.patch('/', async (req, res) => {
  const b = body(req);
  const sets = [];
  const params = [req.tutor.id];
  const set = (col, val) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };

  // Plain-English labels: validation messages are shown to the teacher as-is.
  if ('name' in b) set('name', requiredText(b.name, 'Your name', 60));
  if ('phone' in b) set('phone', optionalPhone(b.phone, 'Phone number'));
  if ('upiId' in b) set('upi_id', optionalUpiId(b.upiId, 'UPI ID'));
  if ('languagePref' in b) set('language_pref', lang(b.languagePref, 'Reminder language'));

  if (!sets.length) return res.json({ tutor: toTutor(req.tutor) });

  const { rows } = await query(`UPDATE tutors SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
  res.json({ tutor: toTutor(rows[0]) });
});

export default router;
