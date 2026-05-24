import { Router } from 'express';
import { db, logAudit } from '../db.js';
import { authenticate } from '../auth.js';

const router = Router();
router.use(authenticate);

const TYPES = ['client', 'supplier', 'contractor', 'labor', 'consultant', 'other'];

router.get('/', (req, res) => {
  const { search, type } = req.query;
  const where = [];
  const params = {};
  if (search) { where.push('(name LIKE @q OR company LIKE @q OR phone LIKE @q OR email LIKE @q OR notes LIKE @q)'); params.q = `%${search}%`; }
  if (type) { where.push('type = @type'); params.type = type; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const contacts = db.prepare(`SELECT * FROM contacts ${whereSql} ORDER BY name`).all(params);
  res.json({ contacts });
});

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.name.trim()) return res.status(400).json({ error: 'Name is required' });
  const type = TYPES.includes(b.type) ? b.type : 'other';
  const info = db.prepare(
    `INSERT INTO contacts (name, type, company, phone, email, address, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(b.name.trim(), type, b.company || '', b.phone || '', b.email || '', b.address || '', b.notes || '', req.user.id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'create_contact', entity: 'contact', entityId: info.lastInsertRowid, details: { name: b.name }, ip: req.ip });
  res.status(201).json({ contact: db.prepare('SELECT * FROM contacts WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const c = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  if (!c) return res.status(404).json({ error: 'Contact not found' });
  const b = req.body || {};
  const updates = {};
  if (typeof b.name === 'string' && b.name.trim()) updates.name = b.name.trim();
  if (b.type && TYPES.includes(b.type)) updates.type = b.type;
  for (const f of ['company', 'phone', 'email', 'address', 'notes']) if (typeof b[f] === 'string') updates[f] = b[f];
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });
  const sets = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE contacts SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...updates, id });
  res.json({ contact: db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

export default router;
