import { db } from './db.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Compute the full financial picture for a project, reproducing the
 * spreadsheet's Dashboard logic.
 *
 *   total_cost        = Σ expense.total
 *   gross_profit      = sale_price − total_cost
 *   net_margin        = gross_profit / sale_price
 *   contributed[i]    = Σ split.amount for stakeholder i      (what they actually paid)
 *   share_of_cost[i]  = total_cost × split_pct[i]             (what they SHOULD pay)
 *   profit_share[i]   = gross_profit × split_pct[i]
 *   settlement[i]     = profit_share[i] − contributed[i]      (net profit position)
 *   over_under[i]     = contributed[i] − share_of_cost[i]     (>0 overpaid → receive)
 */
export function computeProject(projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;

  const stakeholders = db
    .prepare('SELECT * FROM stakeholders WHERE project_id = ? ORDER BY position, id')
    .all(projectId);

  const expenses = db
    .prepare('SELECT * FROM expenses WHERE project_id = ? ORDER BY expense_date, id')
    .all(projectId);

  const splits = db
    .prepare(
      `SELECT es.expense_id, es.stakeholder_id, es.amount
         FROM expense_splits es
         JOIN expenses e ON e.id = es.expense_id
        WHERE e.project_id = ?`
    )
    .all(projectId);

  // contributed per stakeholder + paid-sum per expense
  const contributed = new Map(stakeholders.map((s) => [s.id, 0]));
  const paidByExpense = new Map();
  for (const sp of splits) {
    contributed.set(sp.stakeholder_id, (contributed.get(sp.stakeholder_id) || 0) + sp.amount);
    paidByExpense.set(sp.expense_id, (paidByExpense.get(sp.expense_id) || 0) + sp.amount);
  }

  const incomes = db
    .prepare('SELECT * FROM incomes WHERE project_id = ? ORDER BY income_date, id')
    .all(projectId);
  const budgets = db.prepare('SELECT * FROM budgets WHERE project_id = ?').all(projectId);

  const totalCost = expenses.reduce((a, e) => a + (e.total || 0), 0);
  const totalReceived = incomes.reduce((a, i) => a + (i.amount || 0), 0);
  const salePrice = project.sale_price || 0;
  const grossProfit = salePrice - totalCost;
  const netMargin = salePrice ? grossProfit / salePrice : 0;
  const cashPosition = totalReceived - totalCost;          // actual cash in/out so far
  const outstanding = salePrice - totalReceived;            // still to collect vs contract
  const collectionPct = salePrice ? totalReceived / salePrice : 0;
  const totalSplitPct = stakeholders.reduce((a, s) => a + (s.split_pct || 0), 0);

  // split-check: how many expenses don't have their total fully allocated
  let mismatches = 0;
  let unallocated = 0;
  for (const e of expenses) {
    const paid = paidByExpense.get(e.id) || 0;
    const diff = round2((e.total || 0) - paid);
    if (Math.abs(diff) > 0.01) mismatches += 1;
    if (diff > 0.01) unallocated += diff;
  }

  const stakeholderRows = stakeholders.map((s) => {
    const contrib = round2(contributed.get(s.id) || 0);
    const profitShare = round2(grossProfit * (s.split_pct || 0));
    const shareOfCost = round2(totalCost * (s.split_pct || 0));
    const overUnder = round2(contrib - shareOfCost);
    const settlement = round2(profitShare - contrib);
    return {
      id: s.id,
      name: s.name,
      role: s.role,
      split_pct: s.split_pct,
      contributed: contrib,
      profit_share: profitShare,
      share_of_cost: shareOfCost,
      over_under: overUnder,           // >0 overpaid (receive), <0 underpaid (pay)
      settlement,                      // profit_share − contributed
      status: profitShare > 0 ? 'Profit Due' : profitShare < 0 ? 'Loss Share' : '—',
      to_settle:
        Math.abs(overUnder) < 0.01
          ? { action: 'even', amount: 0 }
          : overUnder > 0
          ? { action: 'receive', amount: round2(overUnder) }
          : { action: 'pay', amount: round2(-overUnder) },
    };
  });

  // spend by category
  const catMap = new Map();
  for (const e of expenses) {
    const key = (e.category && e.category.trim()) || 'Uncategorised';
    const cur = catMap.get(key) || { category: key, total: 0, count: 0 };
    cur.total += e.total || 0;
    cur.count += 1;
    catMap.set(key, cur);
  }
  const byCategory = [...catMap.values()]
    .map((c) => ({ ...c, total: round2(c.total), share: totalCost ? c.total / totalCost : 0 }))
    .sort((a, b) => b.total - a.total);

  // cash flow over time (monthly): expenses out vs income in
  const monthMap = new Map();
  const monthIn = new Map();
  for (const e of expenses) {
    const month = (e.expense_date || '').slice(0, 7);
    if (month) monthMap.set(month, round2((monthMap.get(month) || 0) + (e.total || 0)));
  }
  for (const i of incomes) {
    const month = (i.income_date || '').slice(0, 7);
    if (month) monthIn.set(month, round2((monthIn.get(month) || 0) + (i.amount || 0)));
  }
  const months = [...new Set([...monthMap.keys(), ...monthIn.keys()])].sort((a, b) => a.localeCompare(b));
  const byMonth = months.map((month) => ({ month, total: monthMap.get(month) || 0, income: monthIn.get(month) || 0 }));

  // income grouped by source category
  const incCatMap = new Map();
  for (const i of incomes) {
    const key = (i.category && i.category.trim()) || 'Uncategorised';
    const cur = incCatMap.get(key) || { category: key, total: 0, count: 0 };
    cur.total += i.amount || 0; cur.count += 1;
    incCatMap.set(key, cur);
  }
  const incomeByCategory = [...incCatMap.values()].map((c) => ({ ...c, total: round2(c.total) })).sort((a, b) => b.total - a.total);

  // budget vs actual per category (actual = spend in that category)
  const spentByCat = new Map(byCategory.map((c) => [c.category, c.total]));
  const budgetRows = budgets.map((b) => {
    const actual = round2(spentByCat.get(b.category) || 0);
    return {
      category: b.category,
      budget: round2(b.amount),
      actual,
      remaining: round2(b.amount - actual),
      used_pct: b.amount ? actual / b.amount : (actual > 0 ? 1 : 0),
      over: actual > b.amount + 0.01,
    };
  }).sort((a, b) => b.budget - a.budget);
  const budgetTotal = round2(budgets.reduce((a, b) => a + (b.amount || 0), 0));

  return {
    project: {
      id: project.id,
      name: project.name,
      currency: project.currency,
      locale: project.locale,
      sale_price: salePrice,
    },
    snapshot: {
      total_spend: round2(totalCost),
      sale_price: salePrice,
      gross_profit: round2(grossProfit),
      net_margin: netMargin,
      total_expenses: expenses.length,
      avg_expense: expenses.length ? round2(totalCost / expenses.length) : 0,
      split_mismatches: mismatches,
      unallocated: round2(unallocated),
      split_pct_total: round2(totalSplitPct),
      split_pct_valid: Math.abs(totalSplitPct - 1) < 0.0001,
      total_received: round2(totalReceived),
      total_incomes: incomes.length,
      cash_position: round2(cashPosition),
      outstanding: round2(outstanding),
      collection_pct: collectionPct,
      budget_total: budgetTotal,
    },
    stakeholders: stakeholderRows,
    by_category: byCategory,
    by_month: byMonth,
    income_by_category: incomeByCategory,
    budgets: budgetRows,
    totals: {
      contributed: round2(stakeholderRows.reduce((a, s) => a + s.contributed, 0)),
      profit_share: round2(stakeholderRows.reduce((a, s) => a + s.profit_share, 0)),
      settlement: round2(stakeholderRows.reduce((a, s) => a + s.settlement, 0)),
    },
  };
}
