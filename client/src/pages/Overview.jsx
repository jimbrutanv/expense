import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Loading, Empty, Badge } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { moneyCompact, pct, fmtDateTime } from '../format.js';

export default function Overview() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [d, setD] = useState(null);

  useEffect(() => { api.get('/overview').then(setD).catch(() => setD({ totals: { projects: 0, active: 0, expenses: 0, by_currency: [] }, projects: [], recent: [] })); }, []);
  if (!d) return <Loading />;

  const main = d.totals.by_currency[0];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Welcome back, {user.name.split(' ')[0]}</h1>
          <div className="sub">Portfolio overview across all your projects</div>
        </div>
        <button className="btn" onClick={() => navigate('/projects')}><Icon name="folder" size={16} />All Projects</button>
      </div>

      {d.projects.length === 0 ? (
        <Empty icon="grid" title="Nothing here yet">{isAdmin ? 'Create or import a project to get started.' : 'You have not been assigned to any projects yet.'}</Empty>
      ) : (
        <>
          <div className="kpi-grid">
            <Kpi label="Projects" value={d.totals.projects} sub={`${d.totals.active} active`} icon="folder" />
            <Kpi label="Total Expenses Logged" value={d.totals.expenses} icon="receipt" />
            {main && <Kpi label="Total Spend" value={moneyCompact(main.spend, main)} sub={d.totals.by_currency.length > 1 ? '+ other currencies' : main.currency} icon="bar-chart" />}
            {main && <Kpi label="Combined Gross Profit" value={moneyCompact(main.profit, main)} accent={main.profit >= 0 ? 'green' : 'red'} icon="trending" />}
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-head"><h3><Icon name="folder" size={17} /> Projects</h3></div>
              <div className="card-pad stack" style={{ gap: 10 }}>
                {d.projects.map((p) => (
                  <div key={p.id} className="ov-project" onClick={() => navigate(`/projects/${p.id}/dashboard`)}>
                    <div style={{ minWidth: 0 }}>
                      <div className="flex" style={{ gap: 8 }}>
                        <b style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</b>
                        {p.status === 'archived' && <Badge color="gray">archived</Badge>}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>{p.expenses} expenses · {p.stakeholders} stakeholders</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{moneyCompact(p.total_spend, p)}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{pct(p.net_margin)} margin</div>
                    </div>
                    <Icon name="chevron-right" size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h3><Icon name="clock" size={17} /> Recent Activity</h3></div>
              <div className="card-pad stack" style={{ gap: 0 }}>
                {d.recent.length === 0 ? <span className="muted">No recent activity.</span> : d.recent.map((r) => (
                  <div key={r.id} className="ov-activity">
                    <Icon name={actionIcon(r.action)} size={15} style={{ color: 'var(--text-muted)' }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13 }}>{r.action.replace(/_/g, ' ')} <span className="muted">{r.entity}</span></div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{r.user_email || 'system'} · {fmtDateTime(r.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function actionIcon(a) {
  if (a.includes('delete')) return 'trash';
  if (a.includes('create') || a.includes('upload') || a.includes('import')) return 'plus';
  if (a.includes('backup')) return 'database';
  if (a.includes('login')) return 'user';
  return 'edit';
}

function Kpi({ label, value, sub, accent, icon }) {
  return (
    <div className={`kpi ${accent || ''}`}>
      <div className="label"><Icon name={icon} size={14} /> {label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
