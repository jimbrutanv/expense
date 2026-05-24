import { Router } from 'express';
import { db } from '../db.js';
import { authenticate, isAdmin } from '../auth.js';
import { computeProject } from '../finance.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const projects = isAdmin(req.user)
    ? db.prepare("SELECT * FROM projects ORDER BY status, name").all()
    : db.prepare(
        `SELECT p.* FROM projects p JOIN project_members m ON m.project_id = p.id
          WHERE m.user_id = ? ORDER BY p.status, p.name`
      ).all(req.user.id);

  // aggregate per currency (projects may differ)
  const byCurrency = {};
  let totalExpenses = 0;
  let activeCount = 0;
  const projectCards = projects.map((p) => {
    const c = computeProject(p.id);
    const cur = p.currency || 'INR';
    const agg = (byCurrency[cur] = byCurrency[cur] || { currency: cur, locale: p.locale, spend: 0, received: 0, profit: 0, sale: 0, projects: 0 });
    agg.spend += c.snapshot.total_spend;
    agg.received += c.snapshot.total_received;
    agg.profit += c.snapshot.gross_profit;
    agg.sale += c.snapshot.sale_price;
    agg.projects += 1;
    totalExpenses += c.snapshot.total_expenses;
    if (p.status === 'active') activeCount += 1;
    return {
      id: p.id, name: p.name, currency: cur, locale: p.locale, status: p.status,
      total_spend: c.snapshot.total_spend, gross_profit: c.snapshot.gross_profit,
      net_margin: c.snapshot.net_margin, total_received: c.snapshot.total_received,
      collection_pct: c.snapshot.collection_pct, expenses: c.snapshot.total_expenses,
      stakeholders: c.stakeholders.length,
    };
  });

  const recent = isAdmin(req.user)
    ? db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 12').all()
    : db.prepare(
        `SELECT * FROM audit_log WHERE project_id IN (SELECT project_id FROM project_members WHERE user_id = ?) OR user_id = ?
          ORDER BY id DESC LIMIT 12`
      ).all(req.user.id, req.user.id);

  res.json({
    totals: {
      projects: projects.length,
      active: activeCount,
      expenses: totalExpenses,
      by_currency: Object.values(byCurrency),
    },
    projects: projectCards,
    recent: recent.map((r) => ({ ...r, details: undefined })),
  });
});

export default router;
