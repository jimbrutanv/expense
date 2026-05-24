import { createRequire } from 'module';
const require = createRequire('/home/n/.nvm/versions/node/v22.22.0/lib/node_modules/');
const puppeteer = require('puppeteer');

const BASE = 'http://localhost:4000';
const errors = [];
const shots = [];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

async function shot(name, w = 1280, h = 900) {
  await page.setViewport({ width: w, height: h });
  await new Promise((r) => setTimeout(r, 700));
  const p = `/tmp/ui_${name}.png`;
  await page.screenshot({ path: p });
  shots.push(p);
  console.log('  📸', name, `(${w}x${h})`);
}

console.log('▶ Login page');
await page.goto(BASE, { waitUntil: 'networkidle0' });
await shot('login');

console.log('▶ Sign in');
await page.type('input[type=email]', 'admin@expense.com');
await page.type('input[type=password]', 'Admin1234!');
await page.click('form .btn-primary');
await page.waitForSelector('.kpi-grid, .card', { timeout: 8000 });
await shot('projects');

console.log('▶ Open demo project → dashboard');
await page.click('.kpi-grid .card');
await page.waitForSelector('.recharts-surface, .kpi', { timeout: 8000 });
await new Promise((r) => setTimeout(r, 1200));
await shot('dashboard');

console.log('▶ Expenses tab');
const tabs = await page.$$('.tab');
for (const t of tabs) { const txt = await page.evaluate((e) => e.textContent, t); if (txt.includes('Expenses')) { await t.click(); break; } }
await page.waitForSelector('table.tbl', { timeout: 8000 });
await shot('expenses');

console.log('▶ Settlement tab');
const tabs2 = await page.$$('.tab');
for (const t of tabs2) { const txt = await page.evaluate((e) => e.textContent, t); if (txt.includes('Settlement')) { await t.click(); break; } }
await new Promise((r) => setTimeout(r, 800));
await shot('settlement');

console.log('▶ Collapsed (minimized) sidebar');
await page.click('.collapse-toggle');
await new Promise((r) => setTimeout(r, 500));
await shot('collapsed');
await page.click('.collapse-toggle'); // expand back

console.log('▶ Users (admin)');
await page.goto(`${BASE}/users`, { waitUntil: 'networkidle0' });
await page.waitForSelector('table.tbl', { timeout: 8000 });
await shot('users');

console.log('▶ Backups (admin)');
await page.goto(`${BASE}/backups`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
await shot('backups');

console.log('▶ Documentation');
await page.goto(`${BASE}/docs`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 500));
await shot('docs');

console.log('▶ Dark mode');
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 400));
const btns = await page.$$('.topbar .btn-icon');
if (btns[0]) await btns[0].click();
await new Promise((r) => setTimeout(r, 500));
await shot('dark_projects');

console.log('▶ Mobile view (dashboard)');
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.evaluate(() => { localStorage.getItem('ptracker_token'); });
await shot('mobile_projects', 390, 844);

await browser.close();
console.log('\nConsole errors:', errors.length);
errors.slice(0, 20).forEach((e) => console.log('  ⚠', e));
console.log('Screenshots:', shots.join(' '));
process.exit(errors.length ? 2 : 0);
