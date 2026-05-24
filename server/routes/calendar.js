import { Router } from 'express';
import { db } from '../db.js';
import { authenticate, isAdmin } from '../auth.js';

const router = Router();
router.use(authenticate);

function accessibleProjectIds(user) {
  if (isAdmin(user)) return db.prepare('SELECT id FROM projects').all().map((r) => r.id);
  return db.prepare('SELECT project_id id FROM project_members WHERE user_id = ?').all(user.id).map((r) => r.id);
}

// GET /api/calendar?month=YYYY-MM — events across accessible projects.
router.get('/', (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
  const start = `${month}-01`;
  const end = `${month}-31`;
  const ids = accessibleProjectIds(req.user);
  if (!ids.length) return res.json({ month, events: [] });
  const ph = ids.map(() => '?').join(',');
  const events = [];

  db.prepare(`SELECT t.id, t.project_id, t.title, t.status, t.due_date, p.name pname FROM tasks t JOIN projects p ON p.id=t.project_id
              WHERE t.project_id IN (${ph}) AND t.due_date >= ? AND t.due_date <= ?`).all(...ids, start, end)
    .forEach((t) => events.push({ date: t.due_date, type: 'task', title: t.title, sub: `${t.pname} · ${t.status}`, project_id: t.project_id, to: `/projects/${t.project_id}/tasks`, done: t.status === 'done' }));

  db.prepare(`SELECT i.id, i.project_id, i.income_date, i.source, i.amount, p.name pname, p.currency FROM incomes i JOIN projects p ON p.id=i.project_id
              WHERE i.project_id IN (${ph}) AND i.income_date >= ? AND i.income_date <= ?`).all(...ids, start, end)
    .forEach((i) => events.push({ date: i.income_date, type: 'income', title: i.source || 'Payment', sub: i.pname, amount: i.amount, currency: i.currency, project_id: i.project_id, to: `/projects/${i.project_id}/income?open=${i.id}` }));

  db.prepare(`SELECT e.id, e.project_id, e.expense_date, e.description, e.ref, e.total, p.name pname, p.currency FROM expenses e JOIN projects p ON p.id=e.project_id
              WHERE e.project_id IN (${ph}) AND e.expense_date >= ? AND e.expense_date <= ? LIMIT 400`).all(...ids, start, end)
    .forEach((e) => events.push({ date: e.expense_date, type: 'expense', title: e.description || e.ref, sub: e.pname, amount: e.total, currency: e.currency, project_id: e.project_id, to: `/projects/${e.project_id}/expenses?open=${e.id}` }));

  res.json({ month, events });
});

export default router;
