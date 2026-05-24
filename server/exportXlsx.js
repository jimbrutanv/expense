import xlsx from 'xlsx';
import { db } from './db.js';
import { computeProject } from './finance.js';

const pctCell = (f) => Number(((f || 0) * 100).toFixed(2)) / 100; // keep as fraction; format as %

/**
 * Build an .xlsx workbook for a project that mirrors the original
 * "Construction Expense Tracker" layout (Stakeholders / Expenses / Dashboard),
 * so an exported file looks like — and re-imports as — the source spreadsheet.
 * Returns a Node Buffer.
 */
export function buildProjectWorkbook(projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;
  const c = computeProject(projectId);

  const stakeholders = db.prepare('SELECT * FROM stakeholders WHERE project_id = ? ORDER BY position, id').all(projectId);
  const expenses = db.prepare('SELECT * FROM expenses WHERE project_id = ? ORDER BY expense_date, id').all(projectId);
  const splits = db
    .prepare('SELECT es.* FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE e.project_id = ?')
    .all(projectId);
  const byExp = new Map();
  for (const s of splits) {
    if (!byExp.has(s.expense_id)) byExp.set(s.expense_id, {});
    byExp.get(s.expense_id)[s.stakeholder_id] = s.amount;
  }
  const compById = new Map(c.stakeholders.map((s) => [s.id, s]));

  const wb = xlsx.utils.book_new();

  // ── Stakeholders sheet ────────────────────────────────────────────────
  const shRows = [
    ['PROJECT STAKEHOLDERS & PROFIT CONFIGURATION'],
    ['Stakeholder Name', 'Role / Company', 'Contact', 'Notes', 'Fixed Split %', 'Profit Share', 'Total Contributed', 'Settlement'],
  ];
  for (let i = 0; i < 10; i++) {
    const s = stakeholders[i];
    if (s) {
      const comp = compById.get(s.id) || {};
      shRows.push([s.name, s.role || '', s.contact || '', s.notes || '', pctCell(s.split_pct), comp.profit_share || 0, comp.contributed || 0, comp.settlement || 0]);
    } else {
      shRows.push(['', '', '', '', '', '', '', '']);
    }
  }
  const totalPct = stakeholders.reduce((a, s) => a + (s.split_pct || 0), 0);
  shRows.push(['TOTALS', '', '', '', pctCell(totalPct), c.totals.profit_share, c.totals.contributed, c.totals.settlement]);
  const shWs = xlsx.utils.aoa_to_sheet(shRows);
  shWs['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
  // format split % column (E, rows 3..13) and money columns as needed
  for (let r = 3; r <= 13; r++) {
    const cell = shWs[`E${r}`];
    if (cell && typeof cell.v === 'number') cell.z = '0.00%';
  }
  xlsx.utils.book_append_sheet(wb, shWs, 'Stakeholders');

  // ── Expenses sheet ────────────────────────────────────────────────────
  const shNames = stakeholders.map((s) => s.name);
  // Pad stakeholder columns to 10 like the original template.
  const stakeCols = [];
  for (let i = 0; i < 10; i++) stakeCols.push(shNames[i] || `Stakeholder ${i + 1}`);
  const exRows = [
    ['DAILY CONSTRUCTION EXPENSE LOG'],
    ['Enter one expense per row. Split amounts across stakeholders. Split Check auto-validates totals.'],
    ['Date', 'Expense ID', 'Description', 'Category', 'Total Expense', ...stakeCols, 'Split Check', 'Receipt #', 'Payment Method', 'Notes'],
  ];
  for (const e of expenses) {
    const m = byExp.get(e.id) || {};
    const splitVals = stakeholders.map((s) => (m[s.id] != null ? m[s.id] : ''));
    while (splitVals.length < 10) splitVals.push('');
    const allocated = stakeholders.reduce((a, s) => a + (m[s.id] || 0), 0);
    const diff = Math.round(((e.total || 0) - allocated) * 100) / 100;
    const check = Math.abs(diff) < 0.01 ? 'OK' : diff > 0 ? `Under by ${diff}` : `Over by ${-diff}`;
    exRows.push([e.expense_date, e.ref, e.description || '', e.category || '', e.total || 0, ...splitVals, check, e.receipt_no || '', e.payment_method || '', e.notes || '']);
  }
  const exWs = xlsx.utils.aoa_to_sheet(exRows);
  exWs['!cols'] = [{ wch: 12 }, { wch: 11 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, ...stakeCols.map(() => ({ wch: 13 })), { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 22 }];
  xlsx.utils.book_append_sheet(wb, exWs, 'Expenses');

  // ── Dashboard sheet ───────────────────────────────────────────────────
  const s = c.snapshot;
  const dRows = [
    ['CONSTRUCTION PROJECT — MANAGEMENT DASHBOARD'],
    [],
    ['PROJECT SNAPSHOT', '', '', '', '', '', '', '', 'PROFIT SUMMARY'],
    ['Total Project Spend', '', '', '', s.total_spend, '', '', '', 'Sale Price', '', '', '', s.sale_price],
    ['Project Sale Price', '', '', '', s.sale_price, '', '', '', 'Total Project Cost', '', '', '', s.total_spend],
    ['Gross Profit', '', '', '', s.gross_profit, '', '', '', 'Gross Profit', '', '', '', s.gross_profit],
    ['Net Profit Margin', '', '', '', s.net_margin, '', '', '', 'Net Profit Margin', '', '', '', s.net_margin],
    ['Total Expenses Logged', '', '', '', s.total_expenses, '', '', '', 'Split % Validated', '', '', '', s.split_pct_valid ? '100%' : `${(s.split_pct_total * 100).toFixed(1)}%`],
    ['Avg Expense per Entry', '', '', '', s.avg_expense],
    ['Split Mismatches', '', '', '', s.split_mismatches],
    [],
    [],
    ['PROJECT SALE PRICE (enter value)', '', '', '', s.sale_price],
    [],
    ['STAKEHOLDER CONTRIBUTIONS'],
    ['Stakeholder', 'Split %', 'Contributed', 'Profit Share', 'Settlement', 'Status'],
  ];
  for (const st of c.stakeholders) {
    dRows.push([st.name, pctCell(st.split_pct), st.contributed, st.profit_share, st.settlement, st.status]);
  }
  dRows.push(['TOTALS', '', c.totals.contributed, c.totals.profit_share, c.totals.settlement]);
  dRows.push([]);
  dRows.push(['SPEND BY CATEGORY', '', '', '', '# Entries', '% Share']);
  dRows.push(['Category', 'Total', '', '', 'Entries', 'Share']);
  for (const cat of c.by_category) dRows.push([cat.category, cat.total, '', '', cat.count, Number((cat.share).toFixed(4))]);
  dRows.push([]);
  dRows.push(['EXPENSE SETTLEMENT SUMMARY']);
  dRows.push(['Stakeholder', 'Expenses Paid', 'Share of Cost', 'Over/Under-Paid', 'To Pay / Receive']);
  for (const st of c.stakeholders) {
    const action = st.to_settle.action === 'even' ? 'Settled' : `${st.to_settle.action === 'pay' ? 'Pay' : 'Receive'} ${st.to_settle.amount}`;
    dRows.push([st.name, st.contributed, st.share_of_cost, st.over_under, action]);
  }
  const dWs = xlsx.utils.aoa_to_sheet(dRows);
  dWs['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 14 }];
  xlsx.utils.book_append_sheet(wb, dWs, 'Dashboard');

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Expenses-only workbook (single sheet, same column layout as the source). */
export function buildExpensesWorkbook(projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;
  const stakeholders = db.prepare('SELECT * FROM stakeholders WHERE project_id = ? ORDER BY position, id').all(projectId);
  const expenses = db.prepare('SELECT * FROM expenses WHERE project_id = ? ORDER BY expense_date, id').all(projectId);
  const splits = db.prepare('SELECT es.* FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE e.project_id = ?').all(projectId);
  const byExp = new Map();
  for (const s of splits) { if (!byExp.has(s.expense_id)) byExp.set(s.expense_id, {}); byExp.get(s.expense_id)[s.stakeholder_id] = s.amount; }

  const rows = [['Date', 'Expense ID', 'Description', 'Category', 'Total Expense', ...stakeholders.map((s) => s.name), 'Split Check', 'Receipt #', 'Payment Method', 'Notes']];
  for (const e of expenses) {
    const m = byExp.get(e.id) || {};
    const allocated = stakeholders.reduce((a, s) => a + (m[s.id] || 0), 0);
    const diff = Math.round(((e.total || 0) - allocated) * 100) / 100;
    rows.push([e.expense_date, e.ref, e.description || '', e.category || '', e.total || 0, ...stakeholders.map((s) => (m[s.id] != null ? m[s.id] : '')), Math.abs(diff) < 0.01 ? 'OK' : diff > 0 ? `Under ${diff}` : `Over ${-diff}`, e.receipt_no || '', e.payment_method || '', e.notes || '']);
  }
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(rows);
  xlsx.utils.book_append_sheet(wb, ws, 'Expenses');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
