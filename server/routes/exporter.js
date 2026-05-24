import { Router } from 'express';
import { db, logAudit } from '../db.js';
import { authenticate, requireProjectAccess } from '../auth.js';
import { computeProject } from '../finance.js';
import { toCsv } from '../csv.js';
import { buildProjectWorkbook, buildExpensesWorkbook } from '../exportXlsx.js';

const router = Router({ mergeParams: true });
router.use(authenticate);

function send(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

const pct = (f) => `${(f * 100).toFixed(2)}%`;

// ── Expenses (with one column per stakeholder, mirroring the spreadsheet) ──
router.get('/expenses.csv', requireProjectAccess('viewer', 'expenses'), (req, res) => {
  const stakeholders = db.prepare('SELECT * FROM stakeholders WHERE project_id = ? ORDER BY position, id').all(req.project.id);
  const expenses = db.prepare('SELECT * FROM expenses WHERE project_id = ? ORDER BY expense_date, id').all(req.project.id);
  const splits = db
    .prepare('SELECT es.* FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE e.project_id = ?')
    .all(req.project.id);
  const byExp = new Map();
  for (const s of splits) {
    if (!byExp.has(s.expense_id)) byExp.set(s.expense_id, {});
    byExp.get(s.expense_id)[s.stakeholder_id] = s.amount;
  }

  const headers = ['Date', 'Expense ID', 'Description', 'Category', 'Total Expense',
    ...stakeholders.map((s) => s.name), 'Split Check', 'Receipt #', 'Payment Method', 'Notes'];
  const rows = expenses.map((e) => {
    const m = byExp.get(e.id) || {};
    const allocated = stakeholders.reduce((a, s) => a + (m[s.id] || 0), 0);
    const diff = Math.round(((e.total || 0) - allocated) * 100) / 100;
    const check = Math.abs(diff) < 0.01 ? 'OK' : diff > 0 ? `Under by ${diff}` : `Over by ${-diff}`;
    return [e.expense_date, e.ref, e.description, e.category, e.total,
      ...stakeholders.map((s) => m[s.id] || ''), check, e.receipt_no, e.payment_method, e.notes];
  });
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'export_csv', entity: 'expenses', projectId: req.project.id, ip: req.ip });
  send(res, `${slug(req.project.name)}_expenses.csv`, toCsv(headers, rows));
});

// ── Income / payments received ────────────────────────────────────────
router.get('/income.csv', requireProjectAccess('viewer', 'income'), (req, res) => {
  const rows = db.prepare('SELECT * FROM incomes WHERE project_id = ? ORDER BY income_date, id').all(req.project.id);
  const headers = ['Date', 'Ref', 'Source / Payer', 'Category', 'Amount', 'Method', 'Notes'];
  const data = rows.map((i) => [i.income_date, i.ref, i.source, i.category, i.amount, i.method, i.notes]);
  send(res, `${slug(req.project.name)}_income.csv`, toCsv(headers, data));
});

// ── Stakeholders ──────────────────────────────────────────────────────
router.get('/stakeholders.csv', requireProjectAccess('viewer', 'stakeholders'), (req, res) => {
  const c = computeProject(req.project.id);
  const headers = ['Stakeholder', 'Role / Company', 'Split %', 'Contributed', 'Share of Cost', 'Profit Share', 'Over/Under-Paid', 'Settlement', 'Status'];
  const rows = c.stakeholders.map((s) => [s.name, s.role || '', pct(s.split_pct), s.contributed, s.share_of_cost, s.profit_share, s.over_under, s.settlement, s.status]);
  send(res, `${slug(req.project.name)}_stakeholders.csv`, toCsv(headers, rows));
});

// ── Dashboard summary (snapshot + categories + settlement) ─────────────
router.get('/dashboard.csv', requireProjectAccess('viewer', 'dashboard'), (req, res) => {
  const c = computeProject(req.project.id);
  const lines = [];
  lines.push(['PROJECT SNAPSHOT', '']);
  lines.push(['Total Project Spend', c.snapshot.total_spend]);
  lines.push(['Project Sale Price', c.snapshot.sale_price]);
  lines.push(['Gross Profit', c.snapshot.gross_profit]);
  lines.push(['Net Profit Margin', pct(c.snapshot.net_margin)]);
  lines.push(['Total Expenses Logged', c.snapshot.total_expenses]);
  lines.push(['Avg Expense per Entry', c.snapshot.avg_expense]);
  lines.push(['Split Mismatches', c.snapshot.split_mismatches]);
  lines.push(['Split % Validated', c.snapshot.split_pct_valid ? 'Yes (100%)' : `No (${pct(c.snapshot.split_pct_total)})`]);
  lines.push(['', '']);
  lines.push(['SPEND BY CATEGORY', 'Total', '% Share', '# Entries']);
  for (const cat of c.by_category) lines.push([cat.category, cat.total, pct(cat.share), cat.count]);
  lines.push(['', '']);
  lines.push(['SETTLEMENT', 'Expenses Paid', 'Share of Cost', 'Over/Under-Paid', 'To Pay / Receive']);
  for (const s of c.stakeholders) {
    const action = s.to_settle.action === 'even' ? 'Settled' : `${s.to_settle.action === 'pay' ? 'Pay' : 'Receive'} ${s.to_settle.amount}`;
    lines.push([s.name, s.contributed, s.share_of_cost, s.over_under, action]);
  }
  send(res, `${slug(req.project.name)}_dashboard.csv`, toCsv(['Construction Project Dashboard', req.project.name], lines));
});

// ── Whole project as JSON ──────────────────────────────────────────────
router.get('/project.json', requireProjectAccess('viewer'), (req, res) => {
  const p = req.project;
  const data = {
    project: p,
    stakeholders: db.prepare('SELECT * FROM stakeholders WHERE project_id = ? ORDER BY position').all(p.id),
    expenses: db.prepare('SELECT * FROM expenses WHERE project_id = ? ORDER BY expense_date').all(p.id),
    splits: db.prepare('SELECT es.* FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE e.project_id = ?').all(p.id),
    computed: computeProject(p.id),
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${slug(p.name)}_project.json"`);
  res.send(JSON.stringify(data, null, 2));
});

// ── Excel (.xlsx) — full tracker workbook mirroring the source layout ──
function sendXlsx(res, filename, buf) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}

router.get('/project.xlsx', requireProjectAccess('viewer'), (req, res) => {
  const buf = buildProjectWorkbook(req.project.id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'export_xlsx', entity: 'project', projectId: req.project.id, ip: req.ip });
  sendXlsx(res, `${slug(req.project.name)}_tracker.xlsx`, buf);
});

router.get('/expenses.xlsx', requireProjectAccess('viewer', 'expenses'), (req, res) => {
  const buf = buildExpensesWorkbook(req.project.id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'export_xlsx', entity: 'expenses', projectId: req.project.id, ip: req.ip });
  sendXlsx(res, `${slug(req.project.name)}_expenses.xlsx`, buf);
});

function slug(s) { return (s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

export default router;
