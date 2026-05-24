import { Router } from 'express';
import { db, logAudit } from '../db.js';
import { authenticate, requireProjectAccess } from '../auth.js';
import { nextIncomeRef } from '../defaults.js';

const router = Router({ mergeParams: true });
router.use(authenticate);

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

router.get('/', requireProjectAccess('viewer', 'income'), (req, res) => {
  const { search, category, from, to, sort = 'date_desc', limit = 1000, offset = 0 } = req.query;
  const where = ['project_id = @projectId'];
  const params = { projectId: req.project.id };
  if (search) { where.push('(source LIKE @q OR ref LIKE @q OR notes LIKE @q OR category LIKE @q)'); params.q = `%${search}%`; }
  if (category) { where.push('category = @category'); params.category = category; }
  if (from) { where.push('income_date >= @from'); params.from = from; }
  if (to) { where.push('income_date <= @to'); params.to = to; }
  const order = { date_desc: 'income_date DESC, id DESC', date_asc: 'income_date ASC, id ASC', amount_desc: 'amount DESC', amount_asc: 'amount ASC' }[sort] || 'income_date DESC, id DESC';
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(amount),0) sum FROM incomes WHERE ${whereSql}`).get(params);
  const rows = db.prepare(`SELECT * FROM incomes WHERE ${whereSql} ORDER BY ${order} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: Math.min(parseInt(limit, 10) || 1000, 5000), offset: parseInt(offset, 10) || 0 });
  res.json({ incomes: rows, count: total.c, sum: round2(total.sum) });
});

router.post('/', requireProjectAccess('collaborator', 'income'), (req, res) => {
  const b = req.body || {};
  if (!b.income_date) return res.status(400).json({ error: 'Date is required' });
  const ref = (b.ref && b.ref.trim()) || nextIncomeRef(req.project.id);
  try {
    const info = db.prepare(
      `INSERT INTO incomes (project_id, income_date, ref, source, category, amount, method, notes, created_by)
       VALUES (@project_id, @income_date, @ref, @source, @category, @amount, @method, @notes, @created_by)`
    ).run({
      project_id: req.project.id, income_date: b.income_date, ref,
      source: b.source || '', category: b.category || '', amount: Number(b.amount) || 0,
      method: b.method || '', notes: b.notes || '', created_by: req.user.id,
    });
    logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'create_income', entity: 'income', entityId: info.lastInsertRowid, projectId: req.project.id, details: { ref, amount: Number(b.amount) || 0 }, ip: req.ip });
    res.status(201).json({ income: db.prepare('SELECT * FROM incomes WHERE id = ?').get(info.lastInsertRowid) });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: `Income ref "${ref}" already exists` });
    throw e;
  }
});

router.patch('/:incomeId', requireProjectAccess('collaborator', 'income'), (req, res) => {
  const id = parseInt(req.params.incomeId, 10);
  const existing = db.prepare('SELECT * FROM incomes WHERE id = ? AND project_id = ?').get(id, req.project.id);
  if (!existing) return res.status(404).json({ error: 'Income not found' });
  const b = req.body || {};
  const updates = {};
  for (const f of ['income_date', 'source', 'category', 'method', 'notes', 'ref']) if (typeof b[f] === 'string') updates[f] = b[f];
  if (b.amount !== undefined) updates.amount = Number(b.amount) || 0;
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });
  const sets = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  try {
    db.prepare(`UPDATE incomes SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...updates, id });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'That income ref already exists' });
    throw e;
  }
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'update_income', entity: 'income', entityId: id, projectId: req.project.id, ip: req.ip });
  res.json({ income: db.prepare('SELECT * FROM incomes WHERE id = ?').get(id) });
});

router.delete('/:incomeId', requireProjectAccess('collaborator', 'income'), (req, res) => {
  const id = parseInt(req.params.incomeId, 10);
  const existing = db.prepare('SELECT * FROM incomes WHERE id = ? AND project_id = ?').get(id, req.project.id);
  if (!existing) return res.status(404).json({ error: 'Income not found' });
  db.prepare('DELETE FROM incomes WHERE id = ?').run(id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'delete_income', entity: 'income', entityId: id, projectId: req.project.id, details: { ref: existing.ref }, ip: req.ip });
  res.json({ ok: true });
});

export default router;
