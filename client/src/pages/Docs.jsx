import { useAuth } from '../auth.jsx';
import { Icon } from '../components/Icon.jsx';

const SECTIONS = [
  {
    id: 'overview', icon: 'building', title: 'Overview',
    body: [
      ['p', 'BuildLedger is a multi-user platform for managing construction projects: tracking every expense, splitting costs between stakeholders, and computing profit-sharing and settlement when a project sells. It is a complete business workspace — projects, people, money, documents and reporting in one place.'],
      ['p', 'Each project keeps its own stakeholders, expenses, categories, vendors, dashboard and access list. Admins oversee everything; members see only the projects (and views) assigned to them.'],
    ],
  },
  {
    id: 'roles', icon: 'users', title: 'Roles & Permissions',
    body: [
      ['list', [
        ['Super Admin', 'Full control of the whole system, including creating and removing other admins, backups and restore.'],
        ['Admin', 'Manage all users and projects, run backups, view the activity log. Cannot manage Super Admins.'],
        ['Member', 'Sees only the projects they are assigned to, at the access level granted.'],
      ]],
      ['p', 'Within each project a member is given an access level and a set of enabled views:'],
      ['list', [
        ['Viewer', 'Read-only access to the enabled views.'],
        ['Collaborator', 'Can add, edit and delete expenses (this is "collaboration").'],
        ['Manager', 'Full control of the project: stakeholders, vendors, members and settings.'],
      ]],
      ['p', 'Enabled views (Dashboard, Expenses, Stakeholders, Settlement) are toggled per member, so you decide exactly what each person can open.'],
    ],
  },
  {
    id: 'projects', icon: 'folder', title: 'Projects',
    body: [
      ['p', 'Admins create projects from the Projects page (or by importing a spreadsheet). Each project has a name, description, sale/contract price, currency and status (active/archived).'],
      ['p', 'Open a project to access its tabs. Use Settings to edit details, manage categories, payment methods and vendors, or delete the project.'],
    ],
  },
  {
    id: 'stakeholders', icon: 'users', title: 'Stakeholders & Profit Split',
    body: [
      ['p', 'Stakeholders are the partners/investors in a project (up to 10). Each has a Fixed Split % used for both cost-sharing and profit distribution. The splits should total exactly 100% — a banner warns you if they do not.'],
    ],
  },
  {
    id: 'expenses', icon: 'receipt', title: 'Expenses & Splitting',
    body: [
      ['p', 'Log one expense per row: date, amount, category, vendor, payment method, receipt number and notes. Each expense is split across the stakeholders who actually paid for it.'],
      ['p', 'The split editor shows a live balance check. Use "Split equally" to divide by stakeholder count, or "paid all" to assign the whole amount to one stakeholder. A green "Balanced" badge confirms the split matches the total.'],
      ['p', 'Filter and search by text, category, stakeholder, vendor, date range or payment method, and sort by date or amount.'],
    ],
  },
  {
    id: 'settlement', icon: 'scale', title: 'Settlement',
    body: [
      ['p', 'Each stakeholder should bear their split % of the total cost. The Settlement tab compares what each actually paid against their fair share:'],
      ['list', [
        ['Receive', 'Paid more than their share — the project owes them the difference.'],
        ['Pay', 'Paid less than their share — they owe the difference.'],
      ]],
      ['p', 'The amounts always net to zero across the project, so everyone ends up sharing costs in proportion to their split.'],
    ],
  },
  {
    id: 'dashboard', icon: 'bar-chart', title: 'Dashboards',
    body: [
      ['p', 'Each project dashboard shows KPIs (total spend, sale price, gross profit, net margin, average expense, split validation), spend-by-category, spend-over-time, and stakeholder contribution vs profit.'],
      ['p', 'The Portfolio overview (home page for admins) aggregates KPIs across every project, so you can see total spend, profit and exposure at a glance.'],
    ],
  },
  {
    id: 'importexport', icon: 'table', title: 'Import & Export',
    body: [
      ['p', 'Import: from the Projects page, "Import .xlsx" creates a new project from a spreadsheet in the tracker format (Stakeholders / Expenses / Dashboard sheets). Both of the original reference workbooks import directly.'],
      ['p', 'Export: every project can be exported as:'],
      ['list', [
        ['Excel (.xlsx)', 'A full workbook mirroring the original layout — re-importable.'],
        ['CSV', 'Expenses, stakeholders or dashboard as comma-separated files (open in any spreadsheet).'],
        ['JSON', 'A portable data dump of the whole project.'],
      ]],
    ],
  },
  {
    id: 'backups', icon: 'database', title: 'Backups & Data',
    body: [
      ['p', 'Backups are vital for financial data. The system takes an automatic snapshot every day and keeps the most recent ones. Admins can also:'],
      ['list', [
        ['Create backup', 'Take a manual server-side snapshot.'],
        ['Download snapshot', 'Create and download a .db file to keep off-site.'],
        ['Export JSON', 'Portable export of all data (no passwords).'],
        ['Restore', 'Replace all data from an uploaded snapshot — a safety snapshot is taken first.'],
      ]],
    ],
  },
  {
    id: 'hosting', icon: 'hard-drive', title: 'Hosting & Mobile',
    body: [
      ['p', 'BuildLedger runs as a Node server with a single-file SQLite database (data/app.db) and on-disk backups, so it needs a host with persistent storage — a small VPS, or platforms like Railway, Render or Fly.io. Run it with "npm run setup && npm start".'],
      ['p', 'The interface is fully responsive and installable as a PWA, so it works well inside a mobile/APK web-wrapper. Point the wrapper at your deployed server URL.'],
    ],
  },
];

export default function Docs() {
  const { user } = useAuth();
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Documentation</h1><div className="sub">How BuildLedger works — for administrators</div></div>
      </div>

      <div className="docs-layout">
        <nav className="docs-toc card card-pad">
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginBottom: 8 }}>On this page</div>
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="docs-toc-link"><Icon name={s.icon} size={15} /> {s.title}</a>
          ))}
        </nav>

        <div className="stack" style={{ minWidth: 0 }}>
          <div className="notice">
            <Icon name="info" size={16} />
            <span>Signed in as <b>{user.name}</b> ({user.role === 'superadmin' ? 'Super Admin' : 'Admin'}). The default first-run admin is <code>admin@expense.com</code> — change its password from My Account.</span>
          </div>
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="card">
              <div className="card-head"><h3><Icon name={s.icon} size={17} /> {s.title}</h3></div>
              <div className="card-pad stack" style={{ gap: 12 }}>
                {s.body.map((block, i) => block[0] === 'p'
                  ? <p key={i} style={{ margin: 0, color: 'var(--text-soft)', lineHeight: 1.6 }}>{block[1]}</p>
                  : (
                    <div key={i} className="stack" style={{ gap: 8 }}>
                      {block[1].map(([term, desc]) => (
                        <div key={term} className="flex" style={{ alignItems: 'flex-start', gap: 10 }}>
                          <span className="badge blue" style={{ flexShrink: 0, minWidth: 92, justifyContent: 'center' }}>{term}</span>
                          <span style={{ color: 'var(--text-soft)' }}>{desc}</span>
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
