import { Router } from 'express';
import { db } from '../db.js';
import { authenticate, requireRole } from '../auth.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'superadmin'));

router.get('/', (req, res) => {
  const { limit = 200, project_id, action } = req.query;
  const where = [];
  const params = {};
  if (project_id) { where.push('project_id = @pid'); params.pid = parseInt(project_id, 10); }
  if (action) { where.push('action = @action'); params.action = action; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM audit_log ${whereSql} ORDER BY id DESC LIMIT @limit`)
    .all({ ...params, limit: Math.min(parseInt(limit, 10) || 200, 1000) })
    .map((r) => ({ ...r, details: r.details ? safeParse(r.details) : null }));
  res.json({ entries: rows });
});

function safeParse(s) { try { return JSON.parse(s); } catch { return s; } }

export default router;
