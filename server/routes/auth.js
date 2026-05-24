import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db, logAudit } from '../db.js';
import {
  authenticate, hashPassword, verifyPassword, signToken, publicUser,
} from '../auth.js';
import { config } from '../config.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please wait a few minutes.' },
});

router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (!user.is_active) return res.status(403).json({ error: 'Account is disabled. Contact an administrator.' });

  const token = signToken(user);
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
    maxAge: 1000 * 60 * 60 * 12,
  });
  logAudit({ userId: user.id, userEmail: user.email, action: 'login', entity: 'user', entityId: user.id, ip: req.ip });
  res.json({ token, user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/change-password', authenticate, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  // A user changing their own password must supply the current one,
  // unless they were flagged must_change_password.
  if (!req.user.must_change_password) {
    if (!current_password || !verifyPassword(current_password, req.user.password_hash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
  }
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime(\'now\') WHERE id = ?')
    .run(hashPassword(new_password), req.user.id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'change_password', entity: 'user', entityId: req.user.id, ip: req.ip });
  res.json({ ok: true });
});

export default router;
