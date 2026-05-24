import { Router } from 'express';
import { db } from '../db.js';
import { authenticate, isAdmin } from '../auth.js';
import { computeProject } from '../finance.js';

const router = Router();
router.use(authenticate);

function accessibleProjects(user) {
  if (isAdmin(user)) return db.prepare("SELECT * FROM projects WHERE status='active'").all();
  return db.prepare(
    `SELECT p.* FROM projects p JOIN project_members m ON m.project_id = p.id
      WHERE m.user_id = ? AND p.status='active'`
  ).all(user.id);
}

// Derived, actionable alerts across the user's active projects.
router.get('/', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const projects = accessibleProjects(req.user);
  const alerts = [];

  for (const p of projects) {
    const base = `/projects/${p.id}`;
    const c = computeProject(p.id);

    // overdue tasks
    const overdue = db.prepare("SELECT id, title, due_date FROM tasks WHERE project_id = ? AND status != 'done' AND due_date != '' AND due_date < ? ORDER BY due_date").all(p.id, today);
    for (const t of overdue) alerts.push({ severity: 'danger', icon: 'clock', title: `Overdue: ${t.title}`, sub: `${p.name} · was due ${t.due_date}`, to: `${base}/tasks`, sort: 0 });

    // due soon
    const dueSoon = db.prepare("SELECT id, title, due_date FROM tasks WHERE project_id = ? AND status != 'done' AND due_date >= ? AND due_date <= ? ORDER BY due_date").all(p.id, today, soon);
    for (const t of dueSoon) alerts.push({ severity: 'warn', icon: 'clock', title: `Due soon: ${t.title}`, sub: `${p.name} · due ${t.due_date}`, to: `${base}/tasks`, sort: 1 });

    // over-budget categories
    for (const b of c.budgets.filter((x) => x.over)) {
      alerts.push({ severity: 'warn', icon: 'pie-chart', title: `Over budget: ${b.category}`, sub: `${p.name} · spent ${Math.round(b.actual)} of ${Math.round(b.budget)}`, to: `${base}/dashboard`, sort: 2 });
    }

    // split mismatches
    if (c.snapshot.split_mismatches > 0) {
      alerts.push({ severity: 'warn', icon: 'alert', title: `${c.snapshot.split_mismatches} expense(s) not fully allocated`, sub: p.name, to: `${base}/expenses`, sort: 3 });
    }
    // split % not 100
    if (c.stakeholders.length > 0 && !c.snapshot.split_pct_valid) {
      alerts.push({ severity: 'warn', icon: 'users', title: `Stakeholder split is ${(c.snapshot.split_pct_total * 100).toFixed(0)}% (should be 100%)`, sub: p.name, to: `${base}/stakeholders`, sort: 4 });
    }
    // outstanding receivable (collection started but incomplete)
    if (c.snapshot.total_received > 0 && c.snapshot.outstanding > 0) {
      alerts.push({ severity: 'info', icon: 'trending', title: `Outstanding to collect`, sub: `${p.name} · ${(c.snapshot.collection_pct * 100).toFixed(0)}% received`, to: `${base}/income`, sort: 5 });
    }
  }

  alerts.sort((a, b) => a.sort - b.sort);
  res.json({ count: alerts.length, alerts });
});

export default router;
