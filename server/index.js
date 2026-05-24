import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import { config, CLIENT_DIST } from './config.js';
import { bootstrap } from './seed.js';
import { scheduleAutoBackups } from './backup.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import projectRoutes from './routes/projects.js';
import stakeholderRoutes from './routes/stakeholders.js';
import expenseRoutes from './routes/expenses.js';
import incomeRoutes from './routes/incomes.js';
import taskRoutes from './routes/tasks.js';
import fileRoutes from './routes/files.js';
import dashboardRoutes from './routes/dashboard.js';
import searchRoutes from './routes/search.js';
import overviewRoutes from './routes/overview.js';
import exportRoutes from './routes/exporter.js';
import backupRoutes from './routes/backups.js';
import importRoutes from './routes/import.js';
import auditRoutes from './routes/audit.js';

// First-run setup: super admin + demo data
bootstrap();

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
if (config.env !== 'production') {
  app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
}
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
// Nested project resources (mergeParams reads :projectId)
app.use('/api/projects/:projectId/stakeholders', stakeholderRoutes);
app.use('/api/projects/:projectId/expenses', expenseRoutes);
app.use('/api/projects/:projectId/income', incomeRoutes);
app.use('/api/projects/:projectId/tasks', taskRoutes);
app.use('/api/projects/:projectId/files', fileRoutes);
app.use('/api/projects/:projectId/dashboard', dashboardRoutes);
app.use('/api/projects/:projectId/export', exportRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/overview', overviewRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/import', importRoutes);
app.use('/api/audit', auditRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ── Serve the built client (production) ─────────────────────────────────
if (fs.existsSync(CLIENT_DIST)) {
  // Hashed assets are immutable and cached forever; the HTML shell must always
  // revalidate so a new deploy is picked up immediately (no stale "old" app).
  app.use(express.static(CLIENT_DIST, {
    etag: true,
    setHeaders: (res, filePath) => {
      if (/[\\/]assets[\\/]/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(`${CLIENT_DIST}/index.html`);
  });
} else {
  app.get('/', (req, res) =>
    res.send('<h1>ptracker API</h1><p>Client not built yet. Run <code>npm run build</code>, or use the Vite dev server on :5173.</p>')
  );
}

// ── Error handler ───────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: config.env === 'production' ? 'Internal server error' : String(err.message || err) });
});

scheduleAutoBackups();

app.listen(config.port, () => {
  console.log(`\n🏗  ptracker running at http://localhost:${config.port}`);
  console.log(`   Admin login: ${config.admin.email}\n`);
});
