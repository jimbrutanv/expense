import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { db } from './db.js';

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

export function signToken(user) {
  return jwt.sign(
    { uid: user.id, role: user.role, email: user.email },
    config.jwtSecret,
    { expiresIn: config.tokenTtl }
  );
}

export function readToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    is_active: !!u.is_active,
    must_change_password: !!u.must_change_password,
    created_at: u.created_at,
  };
}

// ── Middleware ──────────────────────────────────────────────────────────
export function authenticate(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
    if (!user || !user.is_active) return res.status(401).json({ error: 'Account inactive or not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

export const isAdmin = (u) => u.role === 'admin' || u.role === 'superadmin';
export const isSuperAdmin = (u) => u.role === 'superadmin';

const LEVEL_RANK = { viewer: 1, collaborator: 2, manager: 3 };

/**
 * Resolve a user's effective access to a project.
 * Admins/superadmins implicitly get full ('manager') access to every project.
 * Regular users get whatever their membership grants, or null if not a member.
 */
export function projectAccess(user, projectId) {
  if (isAdmin(user)) {
    return {
      level: 'manager',
      rank: LEVEL_RANK.manager,
      views: ['dashboard', 'expenses', 'stakeholders', 'settlement', 'members', 'settings'],
      isAdmin: true,
    };
  }
  const m = db
    .prepare('SELECT access_level, views FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(projectId, user.id);
  if (!m) return null;
  let views = [];
  try { views = JSON.parse(m.views); } catch { views = []; }
  return { level: m.access_level, rank: LEVEL_RANK[m.access_level] || 0, views, isAdmin: false };
}

/** Express middleware factory enforcing minimum access to req.params.projectId. */
export function requireProjectAccess(minLevel = 'viewer', view = null) {
  return (req, res, next) => {
    const projectId = parseInt(req.params.projectId || req.params.id, 10);
    if (!projectId) return res.status(400).json({ error: 'Missing project id' });
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const access = projectAccess(req.user, projectId);
    if (!access) return res.status(403).json({ error: 'You do not have access to this project' });
    if (access.rank < (LEVEL_RANK[minLevel] || 0)) {
      return res.status(403).json({ error: `Requires ${minLevel} access` });
    }
    if (view && !access.isAdmin && !access.views.includes(view)) {
      return res.status(403).json({ error: `The "${view}" view is not enabled for your account on this project` });
    }
    req.project = project;
    req.access = access;
    next();
  };
}

export { LEVEL_RANK };
