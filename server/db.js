import Database from 'better-sqlite3';
import fs from 'node:fs';
import { DATA_DIR, BACKUP_DIR, DB_PATH } from './config.js';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema (idempotent) ────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL UNIQUE,
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin','admin','user')),
  is_active            INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  sale_price  REAL NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'INR',
  locale      TEXT NOT NULL DEFAULT 'en-IN',
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stakeholders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT DEFAULT '',
  contact    TEXT DEFAULT '',
  notes      TEXT DEFAULT '',
  split_pct  REAL NOT NULL DEFAULT 0,          -- stored as a fraction (0..1)
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  expense_date   TEXT NOT NULL,
  ref            TEXT NOT NULL,
  description    TEXT DEFAULT '',
  category       TEXT DEFAULT '',
  total          REAL NOT NULL DEFAULT 0,
  receipt_no     TEXT DEFAULT '',
  payment_method TEXT DEFAULT '',
  notes          TEXT DEFAULT '',
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, ref)
);

CREATE TABLE IF NOT EXISTS expense_splits (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id     INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  stakeholder_id INTEGER NOT NULL REFERENCES stakeholders(id) ON DELETE CASCADE,
  amount         REAL NOT NULL DEFAULT 0,
  UNIQUE (expense_id, stakeholder_id)
);

CREATE TABLE IF NOT EXISTS project_members (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL DEFAULT 'viewer' CHECK (access_level IN ('viewer','collaborator','manager')),
  views        TEXT NOT NULL DEFAULT '["dashboard","expenses","stakeholders","settlement"]',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS vendors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  contact    TEXT DEFAULT '',
  notes      TEXT DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT DEFAULT '',
  action     TEXT NOT NULL,
  entity     TEXT DEFAULT '',
  entity_id  TEXT DEFAULT '',
  project_id INTEGER,
  details    TEXT DEFAULT '',
  ip         TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS backups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  filename   TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('auto','manual')),
  size       INTEGER NOT NULL DEFAULT 0,
  note       TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_expenses_project    ON expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_splits_expense      ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_splits_stakeholder  ON expense_splits(stakeholder_id);
CREATE INDEX IF NOT EXISTS idx_stakeholders_project ON stakeholders(project_id);
CREATE INDEX IF NOT EXISTS idx_members_user        ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_project     ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_created       ON audit_log(created_at);
`);

// ── Lightweight migrations (add columns to existing DBs) ────────────────
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('expenses', 'vendor', "TEXT DEFAULT ''");

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

export function logAudit({ userId = null, userEmail = '', action, entity = '', entityId = '', projectId = null, details = null, ip = '' }) {
  db.prepare(
    `INSERT INTO audit_log (user_id, user_email, action, entity, entity_id, project_id, details, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, userEmail, action, entity, String(entityId ?? ''), projectId, details ? JSON.stringify(details) : '', ip);
}

export default db;
