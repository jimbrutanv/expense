import { Router } from 'express';
import { db, logAudit } from '../db.js';
import { authenticate, requireProjectAccess } from '../auth.js';
import { nextExpenseRef } from '../defaults.js';

const router = Router({ mergeParams: true });
router.use(authenticate);

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function loadSplits(expenseId) {
  return db.prepare('SELECT stakeholder_id, amount FROM expense_splits WHERE expense_id = ?').all(expenseId);
}

function decorate(expense) {
  const splits = loadSplits(expense.id);
  const allocated = round2(splits.reduce((a, s) => a + s.amount, 0));
  const diff = round2((expense.total || 0) - allocated);
  return {
    ...expense,
    splits,
    allocated,
    split_check: Math.abs(diff) < 0.01 ? 'ok' : diff > 0 ? 'under' : 'over',
    split_diff: diff,
  };
}

function validateSplits(projectId, splits) {
  if (!Array.isArray(splits)) return [];
  const valid = db.prepare('SELECT id FROM stakeholders WHERE project_id = ?').all(projectId).map((r) => r.id);
  const set = new Set(valid);
  const clean = [];
  for (const s of splits) {
    const sid = parseInt(s.stakeholder_id, 10);
    const amt = Number(s.amount) || 0;
    if (set.has(sid) && amt !== 0) clean.push({ stakeholder_id: sid, amount: amt });
  }
  return clean;
}

function writeSplits(expenseId, splits) {
  db.prepare('DELETE FROM expense_splits WHERE expense_id = ?').run(expenseId);
  const ins = db.prepare('INSERT INTO expense_splits (expense_id, stakeholder_id, amount) VALUES (?, ?, ?)');
  for (const s of splits) ins.run(expenseId, s.stakeholder_id, s.amount);
}

// ── List with filters / sort / pagination ───────────────────────────────
router.get('/', requireProjectAccess('viewer', 'expenses'), (req, res) => {
  const { search, category, payment_method, vendor, from, to, stakeholder_id, sort = 'date_desc', limit = 1000, offset = 0 } = req.query;
  const where = ['e.project_id = @projectId'];
  const params = { projectId: req.project.id };
  if (search) { where.push('(e.description LIKE @q OR e.ref LIKE @q OR e.notes LIKE @q OR e.receipt_no LIKE @q OR e.vendor LIKE @q)'); params.q = `%${search}%`; }
  if (category) { where.push('e.category = @category'); params.category = category; }
  if (payment_method) { where.push('e.payment_method = @pm'); params.pm = payment_method; }
  if (vendor) { where.push('e.vendor = @vendor'); params.vendor = vendor; }
  if (from) { where.push('e.expense_date >= @from'); params.from = from; }
  if (to) { where.push('e.expense_date <= @to'); params.to = to; }
  if (stakeholder_id) { where.push('e.id IN (SELECT expense_id FROM expense_splits WHERE stakeholder_id = @sid)'); params.sid = parseInt(stakeholder_id, 10); }

  const orderMap = {
    date_desc: 'e.expense_date DESC, e.id DESC',
    date_asc: 'e.expense_date ASC, e.id ASC',
    amount_desc: 'e.total DESC',
    amount_asc: 'e.total ASC',
    ref_asc: 'e.ref ASC',
  };
  const order = orderMap[sort] || orderMap.date_desc;
  const whereSql = where.join(' AND ');

  const total = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(e.total),0) sum FROM expenses e WHERE ${whereSql}`).get(params);
  const rows = db
    .prepare(`SELECT e.* FROM expenses e WHERE ${whereSql} ORDER BY ${order} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: Math.min(parseInt(limit, 10) || 1000, 5000), offset: parseInt(offset, 10) || 0 });

  res.json({
    expenses: rows.map(decorate),
    count: total.c,
    sum: round2(total.sum),
  });
});

router.get('/:expenseId', requireProjectAccess('viewer', 'expenses'), (req, res) => {
  const e = db.prepare('SELECT * FROM expenses WHERE id = ? AND project_id = ?').get(parseInt(req.params.expenseId, 10), req.project.id);
  if (!e) return res.status(404).json({ error: 'Expense not found' });
  res.json({ expense: decorate(e) });
});

// ── Create (collaborator+) ──────────────────────────────────────────────
router.post('/', requireProjectAccess('collaborator', 'expenses'), (req, res) => {
  const b = req.body || {};
  if (!b.expense_date) return res.status(400).json({ error: 'Date is required' });
  const total = Number(b.total) || 0;
  const ref = (b.ref && b.ref.trim()) || nextExpenseRef(req.project.id);
  const splits = validateSplits(req.project.id, b.splits);

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO expenses (project_id, expense_date, ref, description, category, total, vendor, receipt_no, payment_method, notes, created_by)
         VALUES (@project_id, @expense_date, @ref, @description, @category, @total, @vendor, @receipt_no, @payment_method, @notes, @created_by)`
      )
      .run({
        project_id: req.project.id,
        expense_date: b.expense_date,
        ref,
        description: b.description || '',
        category: b.category || '',
        total,
        vendor: b.vendor || '',
        receipt_no: b.receipt_no || '',
        payment_method: b.payment_method || '',
        notes: b.notes || '',
        created_by: req.user.id,
      });
    writeSplits(info.lastInsertRowid, splits);
    return info.lastInsertRowid;
  });

  let id;
  try { id = tx(); } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: `Expense ref "${ref}" already exists` });
    throw e;
  }
  const created = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'create_expense', entity: 'expense', entityId: id, projectId: req.project.id, details: { ref, total }, ip: req.ip });
  res.status(201).json({ expense: decorate(created) });
});

// ── Update (collaborator+) ──────────────────────────────────────────────
router.patch('/:expenseId', requireProjectAccess('collaborator', 'expenses'), (req, res) => {
  const id = parseInt(req.params.expenseId, 10);
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND project_id = ?').get(id, req.project.id);
  if (!existing) return res.status(404).json({ error: 'Expense not found' });

  const b = req.body || {};
  const updates = {};
  for (const f of ['expense_date', 'description', 'category', 'vendor', 'receipt_no', 'payment_method', 'notes']) {
    if (typeof b[f] === 'string') updates[f] = b[f];
  }
  if (b.total !== undefined) updates.total = Number(b.total) || 0;
  if (b.ref && b.ref.trim()) updates.ref = b.ref.trim();

  const tx = db.transaction(() => {
    if (Object.keys(updates).length) {
      const sets = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
      db.prepare(`UPDATE expenses SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...updates, id });
    }
    if (b.splits !== undefined) writeSplits(id, validateSplits(req.project.id, b.splits));
  });
  try { tx(); } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'That expense ref already exists' });
    throw e;
  }
  const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'update_expense', entity: 'expense', entityId: id, projectId: req.project.id, ip: req.ip });
  res.json({ expense: decorate(updated) });
});

router.delete('/:expenseId', requireProjectAccess('collaborator', 'expenses'), (req, res) => {
  const id = parseInt(req.params.expenseId, 10);
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND project_id = ?').get(id, req.project.id);
  if (!existing) return res.status(404).json({ error: 'Expense not found' });
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'delete_expense', entity: 'expense', entityId: id, projectId: req.project.id, details: { ref: existing.ref }, ip: req.ip });
  res.json({ ok: true });
});

export default router;
