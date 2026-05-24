import xlsx from 'xlsx';
import { db, logAudit } from './db.js';
import { config } from './config.js';
import { seedProjectLists } from './defaults.js';

function colLetterToIndex(letter) {
  let n = 0;
  for (const ch of letter) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n; // 1-based
}

function cell(ws, col, row) {
  const ref = `${col}${row}`;
  const c = ws[ref];
  return c ? c.v : undefined;
}

const pad = (n) => String(n).padStart(2, '0');

function toISODate(v) {
  if (v == null || v === '') return null;
  // Excel serial date → calendar date via SSF (timezone-safe).
  if (typeof v === 'number') {
    const d = xlsx.SSF ? xlsx.SSF.parse_date_code(v) : null;
    if (d && d.y) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  // A Date object (if a workbook was parsed with cellDates): use local parts.
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  // A plain date string: keep just the date portion if parseable.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const parsed = new Date(v);
  return isNaN(parsed) ? String(v) : `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/**
 * Import a "Construction Expense Tracker" style workbook into a new project.
 * Returns { projectId, stats }.
 */
export function importProjectFromXlsx(filePath, { name, createdBy = null, userEmail = '' } = {}) {
  const wb = xlsx.readFile(filePath); // serials (not cellDates) → timezone-safe date parsing
  const shSheet = wb.Sheets['Stakeholders'];
  const exSheet = wb.Sheets['Expenses'];
  const dashSheet = wb.Sheets['Dashboard'];
  if (!exSheet) throw new Error('Workbook has no "Expenses" sheet — not a recognised tracker file.');

  // Sale price: Dashboard E13 (input) preferred, else E5.
  let salePrice = 0;
  if (dashSheet) salePrice = Number(cell(dashSheet, 'E', 13) ?? cell(dashSheet, 'E', 5) ?? 0) || 0;

  // Stakeholders: rows 3..12, A=name B=role C=contact D=notes E=split fraction
  const stakeholders = [];
  if (shSheet) {
    for (let r = 3; r <= 12; r++) {
      const nm = cell(shSheet, 'A', r);
      const split = cell(shSheet, 'E', r);
      if (nm && String(nm).trim() && String(nm).trim() !== '—') {
        stakeholders.push({
          name: String(nm).trim(),
          role: String(cell(shSheet, 'B', r) || ''),
          contact: String(cell(shSheet, 'C', r) || ''),
          notes: String(cell(shSheet, 'D', r) || ''),
          split_pct: Number(split) || 0,
        });
      }
    }
  }

  const projectName = name || 'Imported Project';
  const tx = db.transaction(() => {
    const pInfo = db
      .prepare(`INSERT INTO projects (name, description, sale_price, currency, locale, created_by) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(projectName, 'Imported from spreadsheet', salePrice, config.defaultCurrency, config.defaultLocale, createdBy);
    const projectId = pInfo.lastInsertRowid;
    seedProjectLists(projectId);

    // Insert stakeholders, remember slot → id (slot 1 = Expenses col F)
    const slotToId = {};
    const insSh = db.prepare('INSERT INTO stakeholders (project_id, name, role, contact, notes, split_pct, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
    stakeholders.forEach((s, i) => {
      const info = insSh.run(projectId, s.name, s.role, s.contact, s.notes, s.split_pct, i);
      slotToId[i + 1] = info.lastInsertRowid; // slot is 1-based
    });

    // Expenses: header row 3, data from row 4. F..O = stakeholder slots 1..10.
    const splitCols = ['F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'];
    const insExp = db.prepare(
      `INSERT INTO expenses (project_id, expense_date, ref, description, category, total, receipt_no, payment_method, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insSplit = db.prepare('INSERT INTO expense_splits (expense_id, stakeholder_id, amount) VALUES (?, ?, ?)');

    let count = 0;
    const range = xlsx.utils.decode_range(exSheet['!ref']);
    for (let r = 4; r <= range.e.r + 1; r++) {
      const ref = cell(exSheet, 'B', r);
      const date = cell(exSheet, 'A', r);
      const total = cell(exSheet, 'E', r);
      if (!ref && !date && (total == null || total === '')) continue;

      const info = insExp.run(
        projectId,
        toISODate(date) || new Date().toISOString().slice(0, 10),
        String(ref || `EXP-${String(count + 1).padStart(3, '0')}`),
        String(cell(exSheet, 'C', r) || ''),
        String(cell(exSheet, 'D', r) || ''),
        Number(total) || 0,
        String(cell(exSheet, 'Q', r) || ''),
        String(cell(exSheet, 'R', r) || ''),
        String(cell(exSheet, 'S', r) || ''),
        createdBy
      );
      const expId = info.lastInsertRowid;
      splitCols.forEach((col, idx) => {
        const slot = idx + 1;
        const amt = Number(cell(exSheet, col, r));
        if (slotToId[slot] && amt) insSplit.run(expId, slotToId[slot], amt);
      });
      count += 1;
    }
    return { projectId, count };
  });

  const { projectId, count } = tx();
  logAudit({ userId: createdBy, userEmail, action: 'import_xlsx', entity: 'project', entityId: projectId, projectId, details: { name: projectName, expenses: count, stakeholders: stakeholders.length } });
  return { projectId, stats: { expenses: count, stakeholders: stakeholders.length, sale_price: salePrice } };
}
