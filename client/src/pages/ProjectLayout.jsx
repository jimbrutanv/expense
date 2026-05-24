import { useEffect, useState, useCallback } from 'react';
import { Outlet, NavLink, useParams, useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { Loading, Badge } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const TABS = [
  { to: 'dashboard', label: 'Dashboard', view: 'dashboard' },
  { to: 'expenses', label: 'Expenses', view: 'expenses' },
  { to: 'stakeholders', label: 'Stakeholders', view: 'stakeholders' },
  { to: 'settlement', label: 'Settlement', view: 'settlement' },
  { to: 'members', label: 'Members', view: 'members', manager: true },
  { to: 'settings', label: 'Settings', view: 'settings', manager: true },
];

export default function ProjectLayout() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await api.get(`/projects/${projectId}`);
      setData(d);
    } catch (e) {
      setErr(e.message);
    }
  }, [projectId]);

  useEffect(() => { setData(null); setErr(''); load(); }, [load]);

  if (err) return <div className="content"><div className="inline-err">{err}</div></div>;
  if (!data) return <Loading />;

  const { access } = data;
  const can = (tab) => {
    if (access.isAdmin) return true;
    if (tab.manager && access.level !== 'manager') return false;
    return access.views.includes(tab.view);
  };
  const visible = TABS.filter(can);

  // Land on the first view the user is allowed to see.
  const base = `/projects/${projectId}`;
  const atBase = location.pathname === base || location.pathname === `${base}/`;
  if (atBase && visible.length) return <RedirectTo to={`${base}/${visible[0].to}`} />;
  if (!visible.length) return <div className="inline-err">You have no enabled views for this project.</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="crumb" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
            <Icon name="folder" size={14} /> Projects
          </span>
          <h1 style={{ marginTop: 4 }}>{data.project.name}</h1>
          <div className="sub flex" style={{ gap: 6 }}>
            {data.project.status === 'archived' && <Badge color="gray"><Icon name="archive" size={13} /> Archived</Badge>}
            <span>{data.project.currency} · {data.stakeholders.length} stakeholders</span>
          </div>
        </div>
      </div>

      <div className="tabs">
        {visible.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            {t.label}
          </NavLink>
        ))}
      </div>

      <Outlet context={{ ...data, reload: load }} />
    </>
  );
}

function RedirectTo({ to }) {
  const navigate = useNavigate();
  useEffect(() => { navigate(to, { replace: true }); }, [to, navigate]);
  return <Loading />;
}

export const useProject = () => useOutletContext();
