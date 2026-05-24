import { Router } from 'express';
import { db, logAudit } from '../db.js';
import {
  authenticate, requireRole, hashPassword, publicUser, isSuperAdmin,
} from '../auth.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'superadmin'));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function withMeta(u) {
  const projectCount = db
    .prepare('SELECT COUNT(*) c FROM project_members WHERE user_id = ?')
    .get(u.id).c;
  return { ...publicUser(u), project_count: projectCount };
}

// List all users
router.get('/', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY role, name').all();
  res.json({ users: users.map(withMeta) });
});

// Create a user (or admin). superadmin role can only be granted by a superadmin.
router.post('/', (req, res) => {
  const { name, email, password, role = 'user' } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email address' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!['user', 'admin', 'superadmin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (role === 'superadmin' && !isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Only a super admin can create another super admin' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'A user with that email already exists' });

  const info = db
    .prepare(
      `INSERT INTO users (name, email, password_hash, role, must_change_password, created_by)
       VALUES (?, ?, ?, ?, 1, ?)`
    )
    .run(name.trim(), email.toLowerCase(), hashPassword(password), role, req.user.id);
  const created = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'create_user', entity: 'user', entityId: created.id, details: { role }, ip: req.ip });
  res.status(201).json({ user: withMeta(created) });
});

// Update a user's name / role / active state
router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'superadmin' && !isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Only a super admin can modify a super admin' });
  }

  const { name, role, is_active } = req.body || {};
  const updates = {};
  if (typeof name === 'string' && name.trim()) updates.name = name.trim();
  if (role) {
    if (!['user', 'admin', 'superadmin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (role === 'superadmin' && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Only a super admin can grant super admin' });
    }
    if (target.id === req.user.id && role !== req.user.role) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }
    updates.role = role;
  }
  if (typeof is_active === 'boolean') {
    if (target.id === req.user.id && !is_active) return res.status(400).json({ error: 'You cannot deactivate your own account' });
    updates.is_active = is_active ? 1 : 0;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const sets = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE users SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...updates, id });
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'update_user', entity: 'user', entityId: id, details: updates, ip: req.ip });
  res.json({ user: withMeta(updated) });
});

// Admin resets a user's password; forces change on next login.
router.post('/:id/reset-password', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { new_password } = req.body || {};
  if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'superadmin' && !isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Only a super admin can reset a super admin password' });
  }
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?")
    .run(hashPassword(new_password), id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'reset_password', entity: 'user', entityId: id, ip: req.ip });
  res.json({ ok: true });
});

// Delete a user
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'superadmin' && !isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Only a super admin can delete a super admin' });
  }
  if (target.role === 'superadmin') {
    const count = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'superadmin'").get().c;
    if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last super admin' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'delete_user', entity: 'user', entityId: id, details: { email: target.email }, ip: req.ip });
  res.json({ ok: true });
});

export default router;
