import { db } from './db.js';

export const DEFAULT_CATEGORIES = [
  'Materials', 'Labour', 'Transport', 'Permits & Fees', 'Equipment Rental',
  'Subcontractors', 'Site Overhead', 'Safety & PPE', 'Professional Fees',
  'Utilities', 'Miscellaneous',
];

export const DEFAULT_PAYMENT_METHODS = [
  'Bank Transfer', 'Cash', 'Cheque', 'Card', 'UPI', 'Other',
];

export const ALL_VIEWS = ['dashboard', 'expenses', 'income', 'stakeholders', 'settlement', 'reports', 'members', 'settings'];

export function seedProjectLists(projectId) {
  const insCat = db.prepare('INSERT OR IGNORE INTO categories (project_id, name, position) VALUES (?, ?, ?)');
  DEFAULT_CATEGORIES.forEach((name, i) => insCat.run(projectId, name, i));
  const insPm = db.prepare('INSERT OR IGNORE INTO payment_methods (project_id, name, position) VALUES (?, ?, ?)');
  DEFAULT_PAYMENT_METHODS.forEach((name, i) => insPm.run(projectId, name, i));
}

function nextRef(table, projectId, prefix) {
  const rows = db.prepare(`SELECT ref FROM ${table} WHERE project_id = ?`).all(projectId);
  let max = 0;
  for (const r of rows) {
    const m = /(\d+)\s*$/.exec(r.ref || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/** Next expense ref like EXP-001 for a project. */
export const nextExpenseRef = (projectId) => nextRef('expenses', projectId, 'EXP');
/** Next income ref like INC-001 for a project. */
export const nextIncomeRef = (projectId) => nextRef('incomes', projectId, 'INC');

export const DEFAULT_INCOME_CATEGORIES = ['Advance', 'Milestone Payment', 'Final Payment', 'Other'];
