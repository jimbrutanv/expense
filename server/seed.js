import path from 'node:path';
import fs from 'node:fs';
import { db, getSetting, setSetting, logAudit } from './db.js';
import { hashPassword } from './auth.js';
import { config, ROOT } from './config.js';
import { importProjectFromXlsx } from './importXlsx.js';

/** Ensure a super admin exists; create one from env config on first run. */
export function ensureAdmin() {
  const existing = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'superadmin'").get().c;
  if (existing > 0) return null;

  const info = db
    .prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'superadmin')`)
    .run(config.admin.name, config.admin.email, hashPassword(config.admin.password));
  logAudit({ userId: info.lastInsertRowid, userEmail: config.admin.email, action: 'bootstrap_admin', entity: 'user', entityId: info.lastInsertRowid });
  console.log(`✔  Created super admin: ${config.admin.email}`);
  return info.lastInsertRowid;
}

/** Import the bundled demo workbook once, the first time the server boots. */
export function ensureDemo(adminId) {
  if (!config.seedDemo) return;
  if (getSetting('demo_seeded') === '1') return;
  if (db.prepare('SELECT COUNT(*) c FROM projects').get().c > 0) {
    setSetting('demo_seeded', '1');
    return;
  }
  const demoPath = path.join(ROOT, 'Project Tracker-Demo.xlsx');
  if (!fs.existsSync(demoPath)) {
    console.warn('ℹ  Demo workbook not found, skipping demo seed.');
    setSetting('demo_seeded', '1');
    return;
  }
  try {
    const { projectId, stats } = importProjectFromXlsx(demoPath, { name: 'Project Tracker — Demo', createdBy: adminId });
    setSetting('demo_seeded', '1');
    console.log(`✔  Seeded demo project #${projectId} (${stats.expenses} expenses, ${stats.stakeholders} stakeholders).`);
  } catch (e) {
    console.error('Demo seed failed:', e.message);
  }
}

export function bootstrap() {
  const adminId = ensureAdmin();
  const sa = adminId || db.prepare("SELECT id FROM users WHERE role='superadmin' ORDER BY id LIMIT 1").get()?.id;
  ensureDemo(sa);
}

// Allow `npm run seed` to run bootstrap standalone.
if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap();
  console.log('Seed complete.');
  process.exit(0);
}
