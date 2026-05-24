import { createRequire } from 'module';
const require = createRequire('/home/n/.nvm/versions/node/v22.22.0/lib/node_modules/');
const puppeteer = require('puppeteer');
const BASE = 'http://localhost:4000';

const widths = [1440, 1180, 1024, 900, 860, 820, 768, 600, 480, 414, 375, 360];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();

await page.setViewport({ width: 1280, height: 900 });
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.type('input[type=email]', 'admin@expense.com');
await page.type('input[type=password]', 'Admin1234!');
await page.click('form .btn-primary');
await page.waitForSelector('.card', { timeout: 10000 });

const routes = [
  { name: 'projects', url: `${BASE}/` },
  { name: 'dashboard', url: null }, // navigate via click
];

async function checkOverflow(label) {
  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const horiz = de.scrollWidth - de.clientWidth;
    // find elements wider than viewport
    const wide = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 1 && r.width > 40) {
        wide.push(`${el.tagName.toLowerCase()}.${(el.className||'').toString().split(' ')[0]} right=${Math.round(r.right)}`);
      }
    });
    return { horiz, vw: window.innerWidth, wide: wide.slice(0, 6) };
  });
  console.log(`${label.padEnd(22)} hOverflow=${m.horiz}px ${m.horiz > 0 ? '⚠ OVERFLOW' : 'ok'}${m.wide.length ? ' :: ' + m.wide.join(' | ') : ''}`);
}

// go to demo dashboard once
const dashUrl = `${BASE}/projects/1/dashboard`;
await page.goto(dashUrl, { waitUntil: 'networkidle0' });
await page.waitForSelector('.kpi', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 800));

for (const w of widths) {
  await page.setViewport({ width: w, height: 900 });
  await page.goto(dashUrl, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 500));
  await checkOverflow(`dash @${w}`);
}
// projects page
for (const w of [1024, 768, 414]) {
  await page.setViewport({ width: w, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 400));
  await checkOverflow(`projects @${w}`);
  await page.screenshot({ path: `/tmp/resp_projects_${w}.png` });
}
// expenses page
await page.setViewport({ width: 414, height: 900 });
await page.goto(dashUrl.replace('/dashboard', '/expenses'), { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 500));
await checkOverflow('expenses @414');
await page.screenshot({ path: '/tmp/resp_expenses_414.png' });
await page.setViewport({ width: 900, height: 1000 });
await page.goto(dashUrl, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: '/tmp/resp_dash_900.png' });

await browser.close();
console.log('done; shots: /tmp/resp_*.png');
