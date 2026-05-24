# CLAUDE.md — BuildLedger project guide

Context for AI assistants (and humans) working in this repo. Kept in the repo so
it travels with the code across machines and cloud sessions.

## What this is
**BuildLedger** is a multi-user web app for managing construction projects:
expenses, multi-stakeholder cost-splitting, profit-sharing settlement, income/
payments, budgets, reports, vendors, dashboards, backups. Built from two source
spreadsheets (`Project Tracker-Demo.xlsx`, `Construction_Expense_Tracker_v3.xlsx`).

## Run locally
```bash
npm run setup     # installs backend + client deps and builds the client
npm start         # serves API + built client on http://localhost:4000
# dev: npm run dev (API, node --watch) + npm run client:dev (Vite on :5173)
```
First boot creates the super admin from `.env` and (if `SEED_DEMO=true`) imports
the demo workbook. Tests: `npm run test:smoke` (needs the server running);
`node server/test/ui.mjs` and `server/test/responsive.mjs` for headless UI checks
(need global `puppeteer`).

## Default admin
`admin@expense.com` / `Admin1234!` (set via `.env`; change in production / from
**My Account**). `.env` is gitignored — see `.env.example`.

## Stack & layout
- **Backend:** Node + Express + better-sqlite3 (single-file DB → easy backups),
  JWT auth (bcryptjs), node-cron backups, SheetJS for xlsx import/export.
  `server/` — `index.js` (entry, routes, static), `db.js` (schema + light
  migrations via `ensureColumn`), `auth.js` (JWT + RBAC + `requireProjectAccess`),
  `finance.js` (all dashboard/report math), `backup.js`, `importXlsx.js`,
  `exportXlsx.js`, `routes/*`.
- **Frontend:** Vite + React + React Router + Recharts. `client/src/` —
  `pages/*`, `components/{Layout,Icon,ui}.jsx`, `format.js` (INR/locale money),
  `api.js`, `auth.jsx`. Icons are SVG via `components/Icon.jsx` — **no emoji** in UI.
- **Data:** `data/app.db` (+ `data/backups/`), gitignored. Relocate with
  `DATA_DIR` env (used in cloud to point at a persistent volume).

## RBAC model
Roles: `superadmin` > `admin` > `user`. Admins implicitly manage all projects.
Regular users get a per-project **access level** (`viewer` < `collaborator` <
`manager`) plus a list of enabled **views**
(`dashboard, expenses, income, stakeholders, settlement, reports`; managers also
get `members, settings`). Enforced by `requireProjectAccess(minLevel, view)`.

## Financial model (in `server/finance.js`, verified against the demo)
```
total_cost       = Σ expense.total
gross_profit     = sale_price − total_cost
net_margin       = gross_profit / sale_price
contributed[i]   = Σ split.amount paid by stakeholder i
share_of_cost[i] = total_cost   × split_pct[i]
profit_share[i]  = gross_profit × split_pct[i]
settlement[i]    = profit_share[i] − contributed[i]
over_under[i]    = contributed[i] − share_of_cost[i]   (>0 receive, <0 pay)
total_received   = Σ income.amount
cash_position    = total_received − total_cost
outstanding      = sale_price − total_received
```
Demo baseline (don't break): spend **3,899,252**, gross profit **6,100,748**,
TK/M settlement **±254,600**, 69 expenses.

## Features
Projects (multi); stakeholders (split must total 100%); expenses (CRUD, split
editor, vendor, receipt, filters); income/payments ledger; per-category budgets;
dashboard (KPIs, cash position, budget bars, charts); settlement; **Reports** tab
(P&L, cash position, cash-flow chart, budgets, category, stakeholder statement,
print/PDF); vendors directory; CSV/JSON/**XLSX** export (xlsx mirrors the original
3-sheet layout + an Income sheet, and is re-importable); **filtered exports**
(export honours the active list filters); xlsx import; auto+manual backups,
restore; audit log; in-app Documentation (admin). UI: responsive (tables become
labeled cards on phones via `table.cards` + `data-label` tds), collapsible
sidebar, dark mode, PWA manifest.

## Conventions
- Match existing code style. Keep UI emoji-free (use `<Icon>`).
- Money formatting via `client/src/format.js` (`money`, `moneyCompact`, defaults
  to `en-IN` / ₹; per-project currency/locale respected).
- New project sub-resource? add table in `db.js`, route in `server/routes/`,
  mount in `index.js`, gate with `requireProjectAccess`, add a view key to
  `ALL_VIEWS` (`server/defaults.js`) + admin views in `auth.js` + tab in
  `client/src/pages/ProjectLayout.jsx` + option in `Members.jsx`.
- Static caching: HTML shell is `no-cache`; `/assets/*` is immutable (in
  `index.js`) — so deploys show immediately. If something "looks like the old
  version," it's a browser cache; hard-refresh.

## Deployment (Railway)
Stateful app → needs persistent disk (NOT Vercel/serverless).
- Live: **https://buildledger-production-9187.up.railway.app**
- Railway project `buildledger` (id `5fb0d250-c1ba-4cb0-b6ac-4dd1904cd837`),
  service `c84630f7…`, env `production` (`56d8e6b3…`), **volume mounted at
  `/data`**, `DATA_DIR=/data`, `PORT=4000`, random `JWT_SECRET`, admin vars.
- Build via `nixpacks.toml` / `railway.json`. Deploy: `RAILWAY_TOKEN=<project
  token> railway up --service buildledger --ci`. The Railway **team** API token
  works against the GraphQL API (`Authorization: Bearer`) but the CLI rejects it
  for `init` — provision via GraphQL, deploy with a project token.

## GitHub
Repo: **github.com/jimbrutanv/expense** (branch `main`). On the original dev
machine, the `gh`/HTTPS identity was a read-only account; pushes use the
**jimbrutanv SSH key** via the `github-varumo` host alias
(`git@github-varumo:jimbrutanv/expense.git`).

## Possible next work
Receipt/file attachments on expenses (store on the volume), global cross-project
search, recurring expenses, Railway auto-deploy-from-GitHub.
