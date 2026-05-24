import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import os from 'node:os';
import { db } from '../db.js';
import { authenticate, requireRole } from '../auth.js';
import { importProjectFromXlsx } from '../importXlsx.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'superadmin'));

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });

// Import a spreadsheet (.xlsx) as a brand new project
router.post('/xlsx', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No .xlsx file uploaded' });
  try {
    const name = (req.body && req.body.name && req.body.name.trim())
      || req.file.originalname.replace(/\.xlsx$/i, '')
      || 'Imported Project';
    const { projectId, stats } = importProjectFromXlsx(req.file.path, { name, createdBy: req.user.id, userEmail: req.user.email });
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    res.status(201).json({ project, stats });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Import failed' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

export default router;
