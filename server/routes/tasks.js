import { Router } from 'express';
import { db, logAudit } from '../db.js';
import { authenticate, requireProjectAccess } from '../auth.js';

const router = Router({ mergeParams: true });
router.use(authenticate);

const STATUS = ['todo', 'in_progress', 'done'];
const PRIORITY = ['low', 'medium', 'high'];

router.get('/', requireProjectAccess('viewer', 'tasks'), (req, res) => {
  const rows = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY (status=\'done\'), position, id').all(req.project.id);
  res.json({ tasks: rows });
});

router.post('/', requireProjectAccess('collaborator', 'tasks'), (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.title.trim()) return res.status(400).json({ error: 'Title is required' });
  const status = STATUS.includes(b.status) ? b.status : 'todo';
  const priority = PRIORITY.includes(b.priority) ? b.priority : 'medium';
  const pos = db.prepare('SELECT COALESCE(MAX(position),-1)+1 p FROM tasks WHERE project_id = ?').get(req.project.id).p;
  const info = db.prepare(
    `INSERT INTO tasks (project_id, title, status, priority, due_date, assignee, notes, position, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(req.project.id, b.title.trim(), status, priority, b.due_date || '', b.assignee || '', b.notes || '', pos, req.user.id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'create_task', entity: 'task', entityId: info.lastInsertRowid, projectId: req.project.id, ip: req.ip });
  res.status(201).json({ task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/:taskId', requireProjectAccess('collaborator', 'tasks'), (req, res) => {
  const id = parseInt(req.params.taskId, 10);
  const t = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(id, req.project.id);
  if (!t) return res.status(404).json({ error: 'Task not found' });
  const b = req.body || {};
  const updates = {};
  if (typeof b.title === 'string' && b.title.trim()) updates.title = b.title.trim();
  if (b.status && STATUS.includes(b.status)) updates.status = b.status;
  if (b.priority && PRIORITY.includes(b.priority)) updates.priority = b.priority;
  for (const f of ['due_date', 'assignee', 'notes']) if (typeof b[f] === 'string') updates[f] = b[f];
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });
  const sets = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE tasks SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...updates, id });
  res.json({ task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) });
});

router.delete('/:taskId', requireProjectAccess('collaborator', 'tasks'), (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ? AND project_id = ?').run(parseInt(req.params.taskId, 10), req.project.id);
  res.json({ ok: true });
});

export default router;
