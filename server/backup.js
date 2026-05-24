import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import cron from 'node-cron';
import { db, logAudit } from './db.js';
import { BACKUP_DIR, DB_PATH, config } from './config.js';

const TABLES = [
  'users', 'projects', 'stakeholders', 'categories', 'payment_methods',
  'expenses', 'expense_splits', 'project_members', 'audit_log', 'backups', 'settings',
];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

/** Create a consistent snapshot of the database on disk and record it. */
export function createBackup({ kind = 'manual', userId = null, userEmail = '', note = '' } = {}) {
  const filename = `ptracker_${kind}_${timestamp()}.db`;
  const dest = path.join(BACKUP_DIR, filename);
  // VACUUM INTO produces a clean, consistent, compacted copy (SQLite 3.27+).
  db.prepare('VACUUM INTO ?').run(dest);
  const size = fs.statSync(dest).size;
  const info = db
    .prepare('INSERT INTO backups (filename, kind, size, note, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(filename, kind, size, note, userId);
  logAudit({ userId, userEmail, action: 'create_backup', entity: 'backup', entityId: info.lastInsertRowid, details: { kind, filename, size } });
  return db.prepare('SELECT * FROM backups WHERE id = ?').get(info.lastInsertRowid);
}

export function listBackups() {
  return db
    .prepare(
      `SELECT b.*, u.name AS created_by_name
         FROM backups b LEFT JOIN users u ON u.id = b.created_by
        ORDER BY b.id DESC`
    )
    .all()
    .map((b) => ({ ...b, exists: fs.existsSync(path.join(BACKUP_DIR, b.filename)) }));
}

export function backupFilePath(id) {
  const row = db.prepare('SELECT * FROM backups WHERE id = ?').get(id);
  if (!row) return null;
  const p = path.join(BACKUP_DIR, row.filename);
  return fs.existsSync(p) ? { path: p, row } : null;
}

export function deleteBackup(id) {
  const row = db.prepare('SELECT * FROM backups WHERE id = ?').get(id);
  if (!row) return false;
  const p = path.join(BACKUP_DIR, row.filename);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  db.prepare('DELETE FROM backups WHERE id = ?').run(id);
  return true;
}

/** Keep only the newest N automatic backups; remove older ones from disk + table. */
export function pruneBackups(retention = config.backupRetention) {
  const autos = db.prepare("SELECT * FROM backups WHERE kind = 'auto' ORDER BY id DESC").all();
  const toDelete = autos.slice(retention);
  for (const b of toDelete) deleteBackup(b.id);
  return toDelete.length;
}

/**
 * Restore the database from an uploaded SQLite snapshot.
 * Validates the file, then copies every table's rows into the live DB
 * inside a single transaction (no server restart needed).
 */
export function restoreFromFile(srcPath, { userId = null, userEmail = '' } = {}) {
  // Validate it's a usable snapshot with the expected schema.
  let probe;
  try {
    probe = new Database(srcPath, { readonly: true, fileMustExist: true });
    const names = probe.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    for (const t of ['users', 'projects', 'expenses']) {
      if (!names.includes(t)) throw new Error(`Backup is missing the "${t}" table — not a valid ptracker backup.`);
    }
    const userCount = probe.prepare('SELECT COUNT(*) c FROM users').get().c;
    if (userCount < 1) throw new Error('Backup contains no users — refusing to restore (would lock you out).');
  } finally {
    if (probe) probe.close();
  }

  // Safety snapshot of current state before we overwrite anything.
  createBackup({ kind: 'auto', userId, userEmail, note: 'pre-restore safety snapshot' });

  db.pragma('foreign_keys = OFF');
  db.prepare('ATTACH DATABASE ? AS src').run(srcPath);
  try {
    const srcTables = db.prepare("SELECT name FROM src.sqlite_master WHERE type='table'").all().map((r) => r.name);
    const tx = db.transaction(() => {
      for (const t of [...TABLES].reverse()) db.exec(`DELETE FROM main.${t}`);
      for (const t of TABLES) {
        if (srcTables.includes(t)) db.exec(`INSERT INTO main.${t} SELECT * FROM src.${t}`);
      }
    });
    tx();
  } finally {
    db.prepare('DETACH DATABASE src').run();
    db.pragma('foreign_keys = ON');
  }
  logAudit({ userId, userEmail, action: 'restore_backup', entity: 'backup', details: { srcPath: path.basename(srcPath) } });
  return true;
}

/** Build a full JSON export of every table (portable backup). */
export function exportJson() {
  const out = { meta: { app: 'ptracker', exported_at: new Date().toISOString(), schema: 1 }, tables: {} };
  for (const t of TABLES) {
    if (t === 'users') {
      // strip password hashes from JSON exports
      out.tables[t] = db.prepare('SELECT id, name, email, role, is_active, must_change_password, created_by, created_at FROM users').all();
    } else {
      out.tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
    }
  }
  return out;
}

let scheduled = null;
export function scheduleAutoBackups() {
  if (scheduled) scheduled.stop();
  if (!cron.validate(config.autoBackupCron)) {
    console.warn(`⚠  Invalid AUTO_BACKUP_CRON "${config.autoBackupCron}" — automatic backups disabled.`);
    return;
  }
  scheduled = cron.schedule(config.autoBackupCron, () => {
    try {
      createBackup({ kind: 'auto', note: 'scheduled' });
      const pruned = pruneBackups();
      console.log(`✔  Auto-backup created (pruned ${pruned} old).`);
    } catch (e) {
      console.error('Auto-backup failed:', e.message);
    }
  });
  console.log(`⏱  Automatic backups scheduled: "${config.autoBackupCron}" (retain ${config.backupRetention}).`);
}
