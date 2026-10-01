// /api/admin — backoffice routes (role='admin' only). STUB.
// Audit rule (ARCHITECTURE.md): every admin WRITE logs a row to admin_log.
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireAdmin);

/**
 * GET /api/admin/stats
 * TODO (implement): tutor list with student counts + last_active_at,
 * signups/day, dues created vs paid, reminders sent, plan status.
 */
router.get('/stats', (req, res) => {
  res.status(501).json({ error: 'not implemented' });
});

export default router;
