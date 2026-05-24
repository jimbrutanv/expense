import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, logAudit } from '../db.js';
import { authenticate, requireProjectAccess } from '../auth.js';
import { ATTACH_DIR } from '../config.js';

const router = Router({ mergeParams: true });
router.use(authenticate);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(ATTACH_DIR, String(req.project.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

router.get('/', requireProjectAccess('viewer', 'files'), (req, res) => {
  const rows = db.prepare(
    `SELECT a.*, u.name AS uploaded_by_name, e.ref AS expense_ref
       FROM attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       LEFT JOIN expenses e ON e.id = a.expense_id
      WHERE a.project_id = ? ORDER BY a.id DESC`
  ).all(req.project.id);
  res.json({ files: rows });
});

router.post('/', requireProjectAccess('collaborator', 'files'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const expenseId = req.body.expense_id ? parseInt(req.body.expense_id, 10) : null;
  const info = db.prepare(
    `INSERT INTO attachments (project_id, expense_id, stored_name, original_name, mime, size, label, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(req.project.id, expenseId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.body.label || '', req.user.id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'upload_file', entity: 'attachment', entityId: info.lastInsertRowid, projectId: req.project.id, details: { name: req.file.originalname, size: req.file.size }, ip: req.ip });
  res.status(201).json({ file: db.prepare('SELECT * FROM attachments WHERE id = ?').get(info.lastInsertRowid) });
});

router.get('/:fileId/download', requireProjectAccess('viewer', 'files'), (req, res) => {
  const a = db.prepare('SELECT * FROM attachments WHERE id = ? AND project_id = ?').get(parseInt(req.params.fileId, 10), req.project.id);
  if (!a) return res.status(404).json({ error: 'File not found' });
  const p = path.join(ATTACH_DIR, String(req.project.id), a.stored_name);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'File missing on disk' });
  res.download(p, a.original_name);
});

router.delete('/:fileId', requireProjectAccess('collaborator', 'files'), (req, res) => {
  const a = db.prepare('SELECT * FROM attachments WHERE id = ? AND project_id = ?').get(parseInt(req.params.fileId, 10), req.project.id);
  if (!a) return res.status(404).json({ error: 'File not found' });
  const p = path.join(ATTACH_DIR, String(req.project.id), a.stored_name);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  db.prepare('DELETE FROM attachments WHERE id = ?').run(a.id);
  logAudit({ userId: req.user.id, userEmail: req.user.email, action: 'delete_file', entity: 'attachment', entityId: a.id, projectId: req.project.id, ip: req.ip });
  res.json({ ok: true });
});

export default router;
