import { Router } from 'express';
import { db } from '../db.js';
import { authenticate, isAdmin } from '../auth.js';

const router = Router();
router.use(authenticate);

function accessibleProjectIds(user) {
  if (isAdmin(user)) return db.prepare('SELECT id FROM projects').all().map((r) => r.id);
  return db.prepare('SELECT project_id id FROM project_members WHERE user_id = ?').all(user.id).map((r) => r.id);
}

// GET /api/search?q=...&full=1 — comprehensive search across accessible data.
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  const full = req.query.full === '1';
  const lim = full ? 50 : 6;
  if (q.length < 1) return res.json({ query: q, groups: [], total: 0 });
  const ids = accessibleProjectIds(req.user);
  const groups = [];
  const like = `%${q}%`;

  // Contacts are global (no project scoping).
  const contacts = db.prepare(
    `SELECT id, name, type, company, phone, email FROM contacts
      WHERE name LIKE ? OR company LIKE ? OR phone LIKE ? OR email LIKE ? OR notes LIKE ?
      ORDER BY name LIMIT ?`
  ).all(like, like, like, like, like, lim);
  if (contacts.length) groups.push({ type: 'contact', label: 'Contacts', items: contacts.map((c) => ({ id: c.id, title: c.name, sub: `${c.type}${c.company ? ' · ' + c.company : ''}${c.phone ? ' · ' + c.phone : ''}`, to: `/contacts?focus=${c.id}` })) });

  if (ids.length) {
    const ph = ids.map(() => '?').join(',');

    const projects = db.prepare(
      `SELECT id, name, currency FROM projects WHERE id IN (${ph}) AND (name LIKE ? OR description LIKE ?) ORDER BY name LIMIT ?`
    ).all(...ids, like, like, lim);
    if (projects.length) groups.push({ type: 'project', label: 'Projects', items: projects.map((p) => ({ id: p.id, project_id: p.id, title: p.name, sub: p.currency, to: `/projects/${p.id}/dashboard` })) });

    const expenses = db.prepare(
      `SELECT e.id, e.project_id, e.ref, e.description, e.category, e.vendor, e.total, e.payment_method, e.receipt_no, p.name pname
         FROM expenses e JOIN projects p ON p.id = e.project_id
        WHERE e.project_id IN (${ph}) AND (e.description LIKE ? OR e.ref LIKE ? OR e.vendor LIKE ? OR e.category LIKE ? OR e.notes LIKE ? OR e.receipt_no LIKE ? OR e.payment_method LIKE ? OR CAST(e.total AS TEXT) LIKE ?)
        ORDER BY e.expense_date DESC LIMIT ?`
    ).all(...ids, like, like, like, like, like, like, like, like, lim * 2);
    if (expenses.length) groups.push({ type: 'expense', label: 'Expenses', items: expenses.map((e) => ({ id: e.id, project_id: e.project_id, title: `${e.ref} · ${e.description || e.category || e.vendor || 'Expense'}`, sub: `${e.pname}${e.vendor ? ' · ' + e.vendor : ''}${e.receipt_no ? ' · ' + e.receipt_no : ''}`, amount: e.total, to: `/projects/${e.project_id}/expenses?open=${e.id}` })) });

    const incomes = db.prepare(
      `SELECT i.id, i.project_id, i.ref, i.source, i.category, i.amount, i.method, p.name pname
         FROM incomes i JOIN projects p ON p.id = i.project_id
        WHERE i.project_id IN (${ph}) AND (i.source LIKE ? OR i.ref LIKE ? OR i.category LIKE ? OR i.notes LIKE ? OR i.method LIKE ? OR CAST(i.amount AS TEXT) LIKE ?)
        ORDER BY i.income_date DESC LIMIT ?`
    ).all(...ids, like, like, like, like, like, like, lim);
    if (incomes.length) groups.push({ type: 'income', label: 'Income / Payments', items: incomes.map((i) => ({ id: i.id, project_id: i.project_id, title: `${i.ref} · ${i.source || i.category || 'Payment'}`, sub: i.pname, amount: i.amount, to: `/projects/${i.project_id}/income?open=${i.id}` })) });

    const stakeholders = db.prepare(
      `SELECT s.id, s.project_id, s.name, s.role, p.name pname FROM stakeholders s JOIN projects p ON p.id = s.project_id
        WHERE s.project_id IN (${ph}) AND (s.name LIKE ? OR s.role LIKE ? OR s.contact LIKE ? OR s.notes LIKE ?) ORDER BY s.name LIMIT ?`
    ).all(...ids, like, like, like, like, lim);
    if (stakeholders.length) groups.push({ type: 'stakeholder', label: 'Stakeholders', items: stakeholders.map((s) => ({ id: s.id, project_id: s.project_id, title: s.name, sub: `${s.pname}${s.role ? ' · ' + s.role : ''}`, to: `/projects/${s.project_id}/stakeholders` })) });

    const vendors = db.prepare(
      `SELECT v.id, v.project_id, v.name, v.contact, p.name pname FROM vendors v JOIN projects p ON p.id = v.project_id
        WHERE v.project_id IN (${ph}) AND (v.name LIKE ? OR v.contact LIKE ? OR v.notes LIKE ?) ORDER BY v.name LIMIT ?`
    ).all(...ids, like, like, like, lim);
    if (vendors.length) groups.push({ type: 'vendor', label: 'Vendors', items: vendors.map((v) => ({ id: v.id, project_id: v.project_id, title: v.name, sub: `${v.pname}${v.contact ? ' · ' + v.contact : ''}`, to: `/projects/${v.project_id}/settings` })) });

    const tasks = db.prepare(
      `SELECT t.id, t.project_id, t.title, t.status, t.assignee, p.name pname FROM tasks t JOIN projects p ON p.id = t.project_id
        WHERE t.project_id IN (${ph}) AND (t.title LIKE ? OR t.notes LIKE ? OR t.assignee LIKE ?) ORDER BY t.created_at DESC LIMIT ?`
    ).all(...ids, like, like, like, lim);
    if (tasks.length) groups.push({ type: 'task', label: 'Tasks', items: tasks.map((t) => ({ id: t.id, project_id: t.project_id, title: t.title, sub: `${t.pname} · ${t.status}${t.assignee ? ' · ' + t.assignee : ''}`, to: `/projects/${t.project_id}/tasks` })) });

    const files = db.prepare(
      `SELECT a.id, a.project_id, a.original_name, a.label, p.name pname FROM attachments a JOIN projects p ON p.id = a.project_id
        WHERE a.project_id IN (${ph}) AND (a.original_name LIKE ? OR a.label LIKE ?) ORDER BY a.id DESC LIMIT ?`
    ).all(...ids, like, like, lim);
    if (files.length) groups.push({ type: 'file', label: 'Files', items: files.map((a) => ({ id: a.id, project_id: a.project_id, title: a.original_name, sub: a.pname, to: `/projects/${a.project_id}/files` })) });
  }

  const total = groups.reduce((a, g) => a + g.items.length, 0);
  res.json({ query: q, groups, total });
});

export default router;
