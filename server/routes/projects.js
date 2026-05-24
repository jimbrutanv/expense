import { Router } from 'express';
import { db, logAudit } from '../db.js';
import {
  authenticate, requireRole, requireProjectAccess, projectAccess, isAdmin, publicUser,
} from '../auth.js';
import { config } from '../config.js';
import { seedProjectLists, ALL_VIEWS } from '../defaults.js';
import { computeProject } from '../finance.js';

const router = Router();
router.use(authenticate);

function sanitizeViews(views) {
  if (!Array.isArray(views)) return ['dashboard'];
  const v = views.filter((x) => ALL_VIEWS.includes(x));
  return v.length ? [...new Set(v)] : ['dashboard'];
}

// ── List projects the current user can see ──────────────────────────────
router.get('/', (req, res) => {
  let projects;
  if (isAdmin(req.user)) {
    projects = db.prepare('SELECT * FROM projects ORDER BY status, name').all();
  } else {
    projects = db
      .prepare(
        `SELECT p.* FROM projects p
           JOIN project_members m ON m.project_id = p.id
          WHERE m.user_id = ?
          ORDER BY p.status, p.name`
      )
      .all(req.user.id);
  }
  const out = projects.map((p) => {
    const c = computeProject(p.id);
    const access = projectAccess(req.user, p.id);
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      currency: p.currency,
      locale: p.locale,
      status: p.status,
      sale_price: p.sale_price,
      created_at: p.created_at,
      access_level: access?.level,
      views: access?.views || [],
      summary: {
        total_spend: c.snapshot.total_spend,
        gross_profit: c.snapshot.gross_profit,
        net_margin: c.snapshot.net_margin,
        total_expenses: c.snapshot.total_expenses,
        stakeholders: c.stakeholders.length,
      },
    };
  });
  res.json({ projects: out });
});

// ── Create a project (admins only) ──────────────────────────────────────
router.post('/', requireRole('admin', 'superadmin'), (req, res) => {
  const { name, description = '', sale_price = 0, currency, locale } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Project name is required' });
  const info = db
    .prepare(
      `INSERT INTO projects (name, description, sale_price, currency, locale, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      name.trim(), description, Number(sale_price) || 0,
      currency || config.defaultCurrency, locale || config.defaultLocale, req.user.id
    );
  seedProjectLists(info.lastInsertRowid);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'create_project', entity: 'project', entityId: project.id, projectId: project.id, ip: req.ip });
  res.status(201).json({ project });
});

// ── Project detail (with config + members + access) ─────────────────────
router.get('/:projectId', requireProjectAccess('viewer'), (req, res) => {
  const p = req.project;
  const categories = db.prepare('SELECT * FROM categories WHERE project_id = ? ORDER BY position, name').all(p.id);
  const paymentMethods = db.prepare('SELECT * FROM payment_methods WHERE project_id = ? ORDER BY position, name').all(p.id);
  const vendors = db.prepare('SELECT * FROM vendors WHERE project_id = ? ORDER BY position, name').all(p.id);
  const stakeholders = db.prepare('SELECT * FROM stakeholders WHERE project_id = ? ORDER BY position, id').all(p.id);
  res.json({
    project: p,
    access: req.access,
    categories,
    payment_methods: paymentMethods,
    vendors,
    stakeholders,
  });
});

// ── Update project settings (manager) ───────────────────────────────────
router.patch('/:projectId', requireProjectAccess('manager', 'settings'), (req, res) => {
  const { name, description, sale_price, currency, locale, status } = req.body || {};
  const updates = {};
  if (typeof name === 'string' && name.trim()) updates.name = name.trim();
  if (typeof description === 'string') updates.description = description;
  if (sale_price !== undefined) updates.sale_price = Number(sale_price) || 0;
  if (currency) updates.currency = currency;
  if (locale) updates.locale = locale;
  if (status && ['active', 'archived'].includes(status)) updates.status = status;
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });

  const sets = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE projects SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...updates, id: req.project.id });
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.project.id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'update_project', entity: 'project', entityId: project.id, projectId: project.id, details: updates, ip: req.ip });
  res.json({ project });
});

// ── Delete project (admins only) ────────────────────────────────────────
router.delete('/:projectId', requireRole('admin', 'superadmin'), requireProjectAccess('manager'), (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.project.id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'delete_project', entity: 'project', entityId: req.project.id, ip: req.ip });
  res.json({ ok: true });
});

// ── Members / access assignment ─────────────────────────────────────────
router.get('/:projectId/members', requireProjectAccess('manager', 'members'), (req, res) => {
  const members = db
    .prepare(
      `SELECT m.id, m.user_id, m.access_level, m.views, m.created_at,
              u.name, u.email, u.role
         FROM project_members m JOIN users u ON u.id = m.user_id
        WHERE m.project_id = ? ORDER BY u.name`
    )
    .all(req.project.id)
    .map((m) => ({ ...m, views: JSON.parse(m.views) }));
  // candidate users not yet members
  const candidates = db
    .prepare(
      `SELECT id, name, email, role FROM users
        WHERE is_active = 1 AND id NOT IN (SELECT user_id FROM project_members WHERE project_id = ?)
        ORDER BY name`
    )
    .all(req.project.id)
    .map(publicUser);
  res.json({ members, candidates });
});

router.post('/:projectId/members', requireProjectAccess('manager', 'members'), (req, res) => {
  const { user_id, access_level = 'viewer', views } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });
  if (!['viewer', 'collaborator', 'manager'].includes(access_level)) return res.status(400).json({ error: 'Invalid access level' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  try {
    db.prepare(
      `INSERT INTO project_members (project_id, user_id, access_level, views) VALUES (?, ?, ?, ?)`
    ).run(req.project.id, user_id, access_level, JSON.stringify(sanitizeViews(views)));
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'User is already a member of this project' });
    throw e;
  }
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'add_member', entity: 'project', entityId: req.project.id, projectId: req.project.id, details: { user_id, access_level }, ip: req.ip });
  res.status(201).json({ ok: true });
});

router.patch('/:projectId/members/:userId', requireProjectAccess('manager', 'members'), (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').get(req.project.id, userId);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  const { access_level, views } = req.body || {};
  const updates = {};
  if (access_level) {
    if (!['viewer', 'collaborator', 'manager'].includes(access_level)) return res.status(400).json({ error: 'Invalid access level' });
    updates.access_level = access_level;
  }
  if (views !== undefined) updates.views = JSON.stringify(sanitizeViews(views));
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });
  const sets = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE project_members SET ${sets} WHERE project_id = @pid AND user_id = @uid`)
    .run({ ...updates, pid: req.project.id, uid: userId });
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'update_member', entity: 'project', entityId: req.project.id, projectId: req.project.id, details: { userId, ...updates }, ip: req.ip });
  res.json({ ok: true });
});

router.delete('/:projectId/members/:userId', requireProjectAccess('manager', 'members'), (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(req.project.id, userId);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'remove_member', entity: 'project', entityId: req.project.id, projectId: req.project.id, details: { userId }, ip: req.ip });
  res.json({ ok: true });
});

// ── Categories & payment methods (manager edits, viewer reads) ──────────
function listRoute(table) {
  return (req, res) => {
    const rows = db.prepare(`SELECT * FROM ${table} WHERE project_id = ? ORDER BY position, name`).all(req.project.id);
    res.json({ items: rows });
  };
}
function addRoute(table, action) {
  return (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const pos = db.prepare(`SELECT COALESCE(MAX(position),-1)+1 p FROM ${table} WHERE project_id = ?`).get(req.project.id).p;
    try {
      db.prepare(`INSERT INTO ${table} (project_id, name, position) VALUES (?, ?, ?)`).run(req.project.id, name.trim(), pos);
    } catch (e) {
      if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'That entry already exists' });
      throw e;
    }
    logAudit({ userId: req.user.id, userEmail: req.user.email, action, entity: table, projectId: req.project.id, details: { name }, ip: req.ip });
    res.status(201).json({ ok: true });
  };
}
function delRoute(table) {
  return (req, res) => {
    db.prepare(`DELETE FROM ${table} WHERE id = ? AND project_id = ?`).run(parseInt(req.params.itemId, 10), req.project.id);
    res.json({ ok: true });
  };
}

router.get('/:projectId/categories', requireProjectAccess('viewer'), listRoute('categories'));
router.post('/:projectId/categories', requireProjectAccess('manager', 'settings'), addRoute('categories', 'add_category'));
router.delete('/:projectId/categories/:itemId', requireProjectAccess('manager', 'settings'), delRoute('categories'));

router.get('/:projectId/payment-methods', requireProjectAccess('viewer'), listRoute('payment_methods'));
router.post('/:projectId/payment-methods', requireProjectAccess('manager', 'settings'), addRoute('payment_methods', 'add_payment_method'));
router.delete('/:projectId/payment-methods/:itemId', requireProjectAccess('manager', 'settings'), delRoute('payment_methods'));

// ── Vendors / suppliers (name + contact + notes) ───────────────────────
router.get('/:projectId/vendors', requireProjectAccess('viewer'), (req, res) => {
  res.json({ items: db.prepare('SELECT * FROM vendors WHERE project_id = ? ORDER BY position, name').all(req.project.id) });
});
router.post('/:projectId/vendors', requireProjectAccess('manager', 'settings'), (req, res) => {
  const { name, contact = '', notes = '' } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Vendor name is required' });
  const pos = db.prepare('SELECT COALESCE(MAX(position),-1)+1 p FROM vendors WHERE project_id = ?').get(req.project.id).p;
  try {
    db.prepare('INSERT INTO vendors (project_id, name, contact, notes, position) VALUES (?, ?, ?, ?, ?)').run(req.project.id, name.trim(), contact, notes, pos);
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'That vendor already exists' });
    throw e;
  }
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'add_vendor', entity: 'vendor', projectId: req.project.id, details: { name }, ip: req.ip });
  res.status(201).json({ ok: true });
});
router.patch('/:projectId/vendors/:itemId', requireProjectAccess('manager', 'settings'), (req, res) => {
  const id = parseInt(req.params.itemId, 10);
  const v = db.prepare('SELECT * FROM vendors WHERE id = ? AND project_id = ?').get(id, req.project.id);
  if (!v) return res.status(404).json({ error: 'Vendor not found' });
  const { name, contact, notes } = req.body || {};
  const updates = {};
  if (typeof name === 'string' && name.trim()) updates.name = name.trim();
  if (typeof contact === 'string') updates.contact = contact;
  if (typeof notes === 'string') updates.notes = notes;
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });
  const sets = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE vendors SET ${sets} WHERE id = @id`).run({ ...updates, id });
  res.json({ ok: true });
});
router.delete('/:projectId/vendors/:itemId', requireProjectAccess('manager', 'settings'), delRoute('vendors'));

export default router;
