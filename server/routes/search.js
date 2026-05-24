import { Router } from 'express';
import { db } from '../db.js';
import { authenticate, isAdmin } from '../auth.js';

const router = Router();
router.use(authenticate);

// Project ids the current user may see.
function accessibleProjectIds(user) {
  if (isAdmin(user)) return db.prepare('SELECT id FROM projects').all().map((r) => r.id);
  return db.prepare('SELECT project_id id FROM project_members WHERE user_id = ?').all(user.id).map((r) => r.id);
}

// GET /api/search?q=...  — global search across accessible projects.
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ query: q, groups: [] });
  const ids = accessibleProjectIds(req.user);
  if (!ids.length) return res.json({ query: q, groups: [] });
  const placeholders = ids.map(() => '?').join(',');
  const like = `%${q}%`;
  const groups = [];

  const projects = db.prepare(
    `SELECT id, name, currency FROM projects WHERE id IN (${placeholders}) AND (name LIKE ? OR description LIKE ?) ORDER BY name LIMIT 8`
  ).all(...ids, like, like);
  if (projects.length) groups.push({ type: 'project', label: 'Projects', items: projects.map((p) => ({ id: p.id, project_id: p.id, title: p.name, sub: p.currency, to: `/projects/${p.id}/dashboard` })) });

  const expenses = db.prepare(
    `SELECT e.id, e.project_id, e.ref, e.description, e.category, e.vendor, e.total, p.name pname
       FROM expenses e JOIN projects p ON p.id = e.project_id
      WHERE e.project_id IN (${placeholders}) AND (e.description LIKE ? OR e.ref LIKE ? OR e.vendor LIKE ? OR e.category LIKE ? OR e.notes LIKE ? OR e.receipt_no LIKE ?)
      ORDER BY e.expense_date DESC LIMIT 12`
  ).all(...ids, like, like, like, like, like, like);
  if (expenses.length) groups.push({ type: 'expense', label: 'Expenses', items: expenses.map((e) => ({ id: e.id, project_id: e.project_id, title: `${e.ref} · ${e.description || e.category || 'Expense'}`, sub: `${e.pname}${e.vendor ? ' · ' + e.vendor : ''}`, amount: e.total, to: `/projects/${e.project_id}/expenses` })) });

  const incomes = db.prepare(
    `SELECT i.id, i.project_id, i.ref, i.source, i.category, i.amount, p.name pname
       FROM incomes i JOIN projects p ON p.id = i.project_id
      WHERE i.project_id IN (${placeholders}) AND (i.source LIKE ? OR i.ref LIKE ? OR i.category LIKE ? OR i.notes LIKE ?)
      ORDER BY i.income_date DESC LIMIT 8`
  ).all(...ids, like, like, like, like);
  if (incomes.length) groups.push({ type: 'income', label: 'Income', items: incomes.map((i) => ({ id: i.id, project_id: i.project_id, title: `${i.ref} · ${i.source || i.category || 'Payment'}`, sub: i.pname, amount: i.amount, to: `/projects/${i.project_id}/income` })) });

  const stakeholders = db.prepare(
    `SELECT s.id, s.project_id, s.name, s.role, p.name pname
       FROM stakeholders s JOIN projects p ON p.id = s.project_id
      WHERE s.project_id IN (${placeholders}) AND (s.name LIKE ? OR s.role LIKE ? OR s.contact LIKE ?)
      ORDER BY s.name LIMIT 8`
  ).all(...ids, like, like, like);
  if (stakeholders.length) groups.push({ type: 'stakeholder', label: 'Stakeholders', items: stakeholders.map((s) => ({ id: s.id, project_id: s.project_id, title: s.name, sub: `${s.pname}${s.role ? ' · ' + s.role : ''}`, to: `/projects/${s.project_id}/stakeholders` })) });

  const vendors = db.prepare(
    `SELECT v.id, v.project_id, v.name, v.contact, p.name pname
       FROM vendors v JOIN projects p ON p.id = v.project_id
      WHERE v.project_id IN (${placeholders}) AND (v.name LIKE ? OR v.contact LIKE ?)
      ORDER BY v.name LIMIT 8`
  ).all(...ids, like, like);
  if (vendors.length) groups.push({ type: 'vendor', label: 'Vendors', items: vendors.map((v) => ({ id: v.id, project_id: v.project_id, title: v.name, sub: `${v.pname}${v.contact ? ' · ' + v.contact : ''}`, to: `/projects/${v.project_id}/settings` })) });

  const tasks = db.prepare(
    `SELECT t.id, t.project_id, t.title, t.status, p.name pname
       FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.project_id IN (${placeholders}) AND (t.title LIKE ? OR t.notes LIKE ? OR t.assignee LIKE ?)
      ORDER BY t.created_at DESC LIMIT 8`
  ).all(...ids, like, like, like);
  if (tasks.length) groups.push({ type: 'task', label: 'Tasks', items: tasks.map((t) => ({ id: t.id, project_id: t.project_id, title: t.title, sub: `${t.pname} · ${t.status}`, to: `/projects/${t.project_id}/tasks` })) });

  res.json({ query: q, groups });
});

export default router;
