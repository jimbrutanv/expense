import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
// DATA_DIR can be overridden (e.g. point it at a Railway persistent volume mount).
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const ATTACH_DIR = path.join(DATA_DIR, 'attachments');
export const DB_PATH = path.join(DATA_DIR, 'app.db');
export const CLIENT_DIST = path.join(ROOT, 'client', 'dist');

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  tokenTtl: process.env.TOKEN_TTL || '12h',

  admin: {
    email: (process.env.ADMIN_EMAIL || 'admin@ptracker.local').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'admin12345',
    name: process.env.ADMIN_NAME || 'Administrator',
  },

  seedDemo: String(process.env.SEED_DEMO || 'true') === 'true',

  autoBackupCron: process.env.AUTO_BACKUP_CRON || '0 2 * * *',
  backupRetention: parseInt(process.env.BACKUP_RETENTION || '14', 10),

  defaultCurrency: process.env.DEFAULT_CURRENCY || 'INR',
  defaultLocale: process.env.DEFAULT_LOCALE || 'en-IN',
};

if (config.env === 'production' && config.jwtSecret === 'dev-insecure-secret-change-me') {
  console.warn('⚠  JWT_SECRET is not set — using an insecure default. Set JWT_SECRET in .env for production.');
}
