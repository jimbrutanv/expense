import { Router } from 'express';
import { db, logAudit } from '../db.js';
import { authenticate, requireProjectAccess } from '../auth.js';

const router = Router({ mergeParams: true });
router.use(authenticate);

function splitTotal(projectId) {
  return db.prepare('SELECT COALESCE(SUM(split_pct),0) t FROM stakeholders WHERE project_id = ?').get(projectId).t;
}

router.get('/', requireProjectAccess('viewer', 'stakeholders'), (req, res) => {
  const rows = db.prepare('SELECT * FROM stakeholders WHERE project_id = ? ORDER BY position, id').all(req.project.id);
  res.json({ stakeholders: rows, split_pct_total: splitTotal(req.project.id) });
});

router.post('/', requireProjectAccess('manager', 'stakeholders'), (req, res) => {
  const { name, role = '', contact = '', notes = '', split_pct = 0 } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Stakeholder name is required' });
  const count = db.prepare('SELECT COUNT(*) c FROM stakeholders WHERE project_id = ?').get(req.project.id).c;
  if (count >= 10) return res.status(400).json({ error: 'A project supports up to 10 stakeholders' });
  const pos = db.prepare('SELECT COALESCE(MAX(position),-1)+1 p FROM stakeholders WHERE project_id = ?').get(req.project.id).p;
  const info = db
    .prepare(
      `INSERT INTO stakeholders (project_id, name, role, contact, notes, split_pct, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.project.id, name.trim(), role, contact, notes, clampFraction(split_pct), pos);
  const created = db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(info.lastInsertRowid);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'create_stakeholder', entity: 'stakeholder', entityId: created.id, projectId: req.project.id, ip: req.ip });
  res.status(201).json({ stakeholder: created, split_pct_total: splitTotal(req.project.id) });
});

router.patch('/:stakeholderId', requireProjectAccess('manager', 'stakeholders'), (req, res) => {
  const id = parseInt(req.params.stakeholderId, 10);
  const sh = db.prepare('SELECT * FROM stakeholders WHERE id = ? AND project_id = ?').get(id, req.project.id);
  if (!sh) return res.status(404).json({ error: 'Stakeholder not found' });
  const { name, role, contact, notes, split_pct } = req.body || {};
  const updates = {};
  if (typeof name === 'string' && name.trim()) updates.name = name.trim();
  if (typeof role === 'string') updates.role = role;
  if (typeof contact === 'string') updates.contact = contact;
  if (typeof notes === 'string') updates.notes = notes;
  if (split_pct !== undefined) updates.split_pct = clampFraction(split_pct);
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });
  const sets = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE stakeholders SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...updates, id });
  const updated = db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'update_stakeholder', entity: 'stakeholder', entityId: id, projectId: req.project.id, details: updates, ip: req.ip });
  res.json({ stakeholder: updated, split_pct_total: splitTotal(req.project.id) });
});

router.delete('/:stakeholderId', requireProjectAccess('manager', 'stakeholders'), (req, res) => {
  const id = parseInt(req.params.stakeholderId, 10);
  const linked = db.prepare('SELECT COUNT(*) c FROM expense_splits WHERE stakeholder_id = ?').get(id).c;
  if (linked > 0) {
    return res.status(409).json({ error: `Cannot delete: this stakeholder is referenced by ${linked} expense split(s). Reassign or remove those first.` });
  }
  db.prepare('DELETE FROM stakeholders WHERE id = ? AND project_id = ?').run(id, req.project.id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'delete_stakeholder', entity: 'stakeholder', entityId: id, projectId: req.project.id, ip: req.ip });
  res.json({ ok: true, split_pct_total: splitTotal(req.project.id) });
});

function clampFraction(v) {
  let n = Number(v) || 0;
  if (n < 0) n = 0;
  if (n > 1) n = 1; // stored as a fraction (0..1)
  return n;
}

export default router;
