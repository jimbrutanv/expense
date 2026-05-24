# 🏗️ BuildLedger — Construction Project Expense Tracker

> **Live:** https://buildledger-production-9187.up.railway.app — login `admin@expense.com` / `Admin1234!`


A multi-user web application for tracking construction project expenses with
**multi-stakeholder cost splitting**, **profit-sharing settlement**, dashboards,
role-based access control, CSV/JSON export, and automatic + manual backups.

Built from the structure of `Project Tracker-Demo.xlsx` /
`Construction_Expense_Tracker_v3.xlsx` — every dashboard figure (total spend,
gross profit, net margin, per-stakeholder contribution, profit share and
settlement) reproduces the spreadsheet's logic exactly.

---

## Quick start

```bash
# 1. Install dependencies (backend + frontend) and build the UI
npm run setup            # = npm install && npm run build

# 2. Start the server
npm start

# 3. Open the app
#    http://localhost:4000
```

First boot automatically:
- creates a **super admin** from `.env`,
- imports the bundled **demo project** (69 expenses, stakeholders *TK* & *M*, sale price ₹1,00,00,000),
- schedules **daily automatic backups**.

### Default login

| Field    | Value               |
|----------|---------------------|
| Email    | `admin@expense.com` |
| Password | `Admin1234!`        |

> Change these in `.env` **before** first run for production, or rotate the
> password from **My Account** afterwards.

### Development mode (hot reload)

```bash
npm run dev          # API on :4000 (node --watch)
npm run client:dev   # Vite UI on :5173, proxies /api → :4000
```

---

## Configuration (`.env`)

Copy `.env.example` → `.env` and adjust. Key settings:

| Variable            | Purpose                                            | Default                |
|---------------------|----------------------------------------------------|------------------------|
| `PORT`              | HTTP port                                          | `4000`                 |
| `JWT_SECRET`        | **Change this** — signs login tokens               | insecure dev default   |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First-run super admin                 | `admin@expense.com`    |
| `SEED_DEMO`         | Import the demo workbook on first run              | `true`                 |
| `AUTO_BACKUP_CRON`  | Cron for automatic backups                         | `0 2 * * *` (2 AM)     |
| `BACKUP_RETENTION`  | How many auto-backups to keep                      | `14`                   |
| `DEFAULT_CURRENCY`  | Currency for new projects                          | `INR`                  |

---

## Features

### Roles & access control
- **Super Admin** — everything, including creating/deleting other admins.
- **Admin** — manage all users and projects, backups, activity log.
- **Member** — access only the projects they're assigned to.

Per project, each member gets an **access level** and a set of **enabled views**:
- `viewer` — read-only
- `collaborator` — can add / edit / delete expenses
- `manager` — full control (stakeholders, members, settings)
- **Views** (Dashboard / Expenses / Stakeholders / Settlement) are individually
  toggled per member, so admins assign *exactly* what each user sees.

### Projects
- Multiple construction projects, each with its own stakeholders, expenses,
  categories, payment methods, currency and sale price.
- **Import any `.xlsx`** in the tracker format as a new project (Projects → Import).

### Expenses
- Full CRUD with search, category / stakeholder / date / payment-method filters
  and sorting.
- **Split editor**: allocate each expense across stakeholders with a live
  balance check ("split equally", "paid all", over/under indicators).

### Dashboard & settlement
- KPIs (spend, sale price, gross profit, margin), spend-by-category donut,
  spend-over-time trend, stakeholder contribution/profit bars.
- **Settlement** computes who over/under-paid versus their cost share and who
  must pay or receive to balance the project.

### Backups & data
- **Automatic** daily snapshots (cron, with retention/pruning).
- **Manual** backup, one-click **download** of a `.db` snapshot.
- **Restore** from an uploaded snapshot (a safety snapshot is taken first).
- **CSV exports**: expenses, stakeholders, dashboard summary.
- **JSON export**: full portable data dump (no password hashes).

### Interface
- Clean, professional UI with a consistent **SVG icon set** (no emoji).
- **Collapsible / minimizable** left navigation (state remembered per browser).
- Fully **responsive** — the sidebar becomes a drawer on phones/tablets; tables
  scroll, cards stack.

### Audit log
Every meaningful action (logins, user/project/expense changes, backups,
restores, imports) is recorded and viewable by admins under **Activity Log**.

---

## Architecture

```
server/                     Node.js + Express API
  index.js                  app entry, route mounting, static client
  db.js                     better-sqlite3 schema + helpers
  auth.js                   bcrypt + JWT + role/project-access middleware
  finance.js                dashboard/settlement computation (matches xlsx)
  backup.js                 snapshot (VACUUM INTO), restore, retention, cron
  importXlsx.js             spreadsheet → project importer
  seed.js                   first-run super admin + demo seed
  routes/                   auth, users, projects, stakeholders, expenses,
                            dashboard, exporter, backups, import, audit
  test/smoke.js             end-to-end API smoke test
client/                     Vite + React SPA (responsive)
  src/pages/                Login, Projects, Dashboard, Expenses, Stakeholders,
                            Settlement, Members, ProjectSettings, Users,
                            Backups, Audit, Account
data/                       SQLite DB + backups (created at runtime, gitignored)
```

**Stack:** Node 18+, Express, better-sqlite3 (single-file DB → trivial backups),
JWT auth, bcrypt, node-cron, SheetJS (xlsx), React 18, React Router, Recharts.

### Data model
`users` · `projects` · `stakeholders` · `expenses` · `expense_splits` ·
`project_members` (access level + views) · `categories` · `payment_methods` ·
`audit_log` · `backups` · `settings`.

### The financial model (reproduced from the spreadsheet)
```
total_cost       = Σ expense.total
gross_profit     = sale_price − total_cost
net_margin       = gross_profit / sale_price
contributed[i]   = Σ split.amount paid by stakeholder i
share_of_cost[i] = total_cost   × split_pct[i]
profit_share[i]  = gross_profit × split_pct[i]
settlement[i]    = profit_share[i] − contributed[i]
over_under[i]    = contributed[i] − share_of_cost[i]   (>0 receive, <0 pay)
```

---

## Testing

```bash
npm start                 # in one terminal
npm run test:smoke        # in another — 22 end-to-end API checks
node server/test/ui.mjs   # headless browser walkthrough + screenshots (needs puppeteer)
```

---

## Deployment notes
- The app is **local-first** but cloud-ready: set `NODE_ENV=production`, a strong
  `JWT_SECRET`, and run behind HTTPS (a reverse proxy). Cookies are marked
  `secure` automatically in production.
- All data lives in `data/app.db`. Backups go to `data/backups/`. The data
  directory can be relocated with the `DATA_DIR` env var (point it at a
  persistent volume in the cloud). To migrate, copy `data/` or use a downloaded
  snapshot + Restore.

### Deploying to Railway (recommended)
This is a **stateful** app (SQLite file + on-disk backups + a daily cron), so it
needs a host with a persistent disk — **Railway** fits well; serverless platforms
like Vercel do not (no persistent filesystem).

1. Push this repo to GitHub and create a Railway project from it (Nixpacks build
   is preconfigured in `nixpacks.toml` / `railway.json`).
2. Add a **Volume** and mount it at e.g. `/data`.
3. Set environment variables:
   - `DATA_DIR=/data` (so the DB + backups live on the volume)
   - `JWT_SECRET=<long random string>`
   - `NODE_ENV=production`
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (first-run admin)
4. Deploy. Railway provides the public HTTPS URL — point your mobile/APK
   web-wrapper at it.

## Mobile / APK
The UI is fully responsive and ships a PWA manifest, so it works inside a web-view
wrapper. Build the APK against your deployed Railway URL.
