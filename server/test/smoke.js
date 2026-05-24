// End-to-end smoke test. Requires the server running on BASE (default :4000).
// Run with: npm run test:smoke
const BASE = process.env.BASE || 'http://localhost:4000';
let token = null;
let pass = 0, fail = 0;

function ok(cond, label) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

async function call(method, path, body, raw = false) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  const res = await fetch(`${BASE}/api${path}`, { method, headers, body });
  if (raw) return res;
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

(async () => {
  console.log('▶ Auth');
  const login = await call('POST', '/auth/login', { email: process.env.ADMIN_EMAIL || 'admin@expense.com', password: process.env.ADMIN_PASSWORD || 'Admin1234!' });
  ok(login.status === 200 && login.data.token, 'admin login');
  token = login.data.token;
  ok((await call('POST', '/auth/login', { email: 'admin@expense.com', password: 'wrong' })).status === 401, 'bad password rejected');

  console.log('▶ Projects & demo data');
  const projects = (await call('GET', '/projects')).data.projects;
  ok(projects.length >= 1, 'demo project present');
  const pid = projects[0].id;
  ok(projects[0].summary.total_spend === 3899252, 'demo total spend = 3,899,252');

  console.log('▶ Dashboard math');
  const dash = (await call('GET', `/projects/${pid}/dashboard`)).data;
  ok(dash.snapshot.gross_profit === 6100748, 'gross profit = 6,100,748');
  ok(dash.snapshot.total_expenses === 69, '69 expenses');
  ok(dash.stakeholders.find((s) => s.name === 'TK')?.to_settle.amount === 254600, 'TK settlement = 254,600');

  console.log('▶ User management');
  const email = `test_${Date.now()}@x.com`;
  const created = await call('POST', '/users', { name: 'Test User', email, password: 'Password123', role: 'user' });
  ok(created.status === 201, 'create user');
  const uid = created.data.user.id;
  ok((await call('PATCH', `/users/${uid}`, { role: 'admin' })).status === 200, 'promote to admin');
  ok((await call('POST', '/users', { name: 'x', email, password: 'Password123' })).status === 409, 'duplicate email rejected');

  console.log('▶ Membership / access');
  ok((await call('POST', `/projects/${pid}/members`, { user_id: uid, access_level: 'collaborator', views: ['dashboard', 'expenses'] })).status === 201, 'add member');
  const members = (await call('GET', `/projects/${pid}/members`)).data;
  ok(members.members.some((m) => m.user_id === uid), 'member listed');
  ok((await call('PATCH', `/projects/${pid}/members/${uid}`, { access_level: 'viewer' })).status === 200, 'update member access');

  console.log('▶ Stakeholders');
  const sh = await call('POST', `/projects/${pid}/stakeholders`, { name: 'ZZ Test', split_pct: 0 });
  ok(sh.status === 201, 'add stakeholder');
  ok((await call('DELETE', `/projects/${pid}/stakeholders/${sh.data.stakeholder.id}`)).status === 200, 'delete stakeholder');

  console.log('▶ Expenses CRUD');
  const sList = (await call('GET', `/projects/${pid}/stakeholders`)).data.stakeholders;
  const exp = await call('POST', `/projects/${pid}/expenses`, {
    expense_date: '2026-01-15', description: 'Smoke test cement', category: 'Materials', total: 5000,
    payment_method: 'Cash', splits: [{ stakeholder_id: sList[0].id, amount: 5000 }],
  });
  ok(exp.status === 201 && exp.data.expense.split_check === 'ok', 'create expense (balanced)');
  const eid = exp.data.expense.id;
  const upd = await call('PATCH', `/projects/${pid}/expenses/${eid}`, { total: 6000 });
  ok(upd.data.expense.split_check === 'under', 'edit makes it under-allocated');
  ok((await call('DELETE', `/projects/${pid}/expenses/${eid}`)).status === 200, 'delete expense');

  console.log('▶ Exports');
  const csv = await call('GET', `/projects/${pid}/export/expenses.csv`, null, true);
  ok(csv.status === 200 && (csv.headers.get('content-type') || '').includes('csv'), 'expenses CSV export');

  console.log('▶ Backups');
  ok((await call('POST', '/backups', { note: 'smoke' })).status === 201, 'create backup');
  ok((await call('GET', '/backups')).data.backups.length >= 1, 'list backups');

  console.log('▶ Audit + RBAC');
  ok((await call('GET', '/audit')).data.entries.length > 0, 'audit log populated');

  // cleanup
  await call('DELETE', `/users/${uid}`);

  console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('Smoke test crashed:', e); process.exit(1); });
