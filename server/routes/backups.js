import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { authenticate, requireRole } from '../auth.js';
import {
  createBackup, listBackups, backupFilePath, deleteBackup, restoreFromFile, exportJson,
} from '../backup.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'superadmin'));

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 200 * 1024 * 1024 } });

router.get('/', (req, res) => {
  res.json({ backups: listBackups() });
});

// Create a server-side backup snapshot
router.post('/', (req, res) => {
  const b = createBackup({ kind: 'manual', userId: req.user.id, userEmail: req.user.email, note: (req.body && req.body.note) || '' });
  res.status(201).json({ backup: b });
});

// One-click: create a fresh snapshot and stream it to the browser
router.get('/download-now', (req, res) => {
  const b = createBackup({ kind: 'manual', userId: req.user.id, userEmail: req.user.email, note: 'direct download' });
  const f = backupFilePath(b.id);
  res.download(f.path, b.filename);
});

// Portable JSON export of all data (no password hashes)
router.get('/export.json', (req, res) => {
  const data = exportJson();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="ptracker_export_${Date.now()}.json"`);
  res.send(JSON.stringify(data, null, 2));
});

// Download an existing backup by id
router.get('/:id/download', (req, res) => {
  const f = backupFilePath(parseInt(req.params.id, 10));
  if (!f) return res.status(404).json({ error: 'Backup file not found' });
  res.download(f.path, f.row.filename);
});

router.delete('/:id', (req, res) => {
  const ok = deleteBackup(parseInt(req.params.id, 10));
  if (!ok) return res.status(404).json({ error: 'Backup not found' });
  res.json({ ok: true });
});

// Restore from an uploaded .db snapshot
router.post('/restore', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No backup file uploaded' });
  try {
    restoreFromFile(req.file.path, { userId: req.user.id, userEmail: req.user.email });
    res.json({ ok: true, message: 'Database restored. A safety snapshot of the previous state was created.' });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Restore failed' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

export default router;
