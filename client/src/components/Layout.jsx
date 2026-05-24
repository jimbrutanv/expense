import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Icon } from './Icon.jsx';

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === '1');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const navigate = useNavigate();
  const close = () => setOpen(false);

  useEffect(() => { localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('theme', theme); }, [theme]);

  const doLogout = async () => { await logout(); navigate('/'); };
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const link = (to, icon, label, end) => (
    <NavLink to={to} end={end} className="nav-link" onClick={close} title={collapsed ? label : undefined}>
      <Icon name={icon} size={18} /><span className="label-text">{label}</span>
    </NavLink>
  );

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand"><Icon name="building" size={22} /><span className="brand-text">BuildLedger</span></div>

        <div className="nav-section">
          {link('/', 'folder', 'Projects', true)}
        </div>
        {isAdmin && (
          <div className="nav-section">
            <div className="nav-title">Administration</div>
            {link('/users', 'users', 'Users')}
            {link('/backups', 'database', 'Backups & Data')}
            {link('/audit', 'history', 'Activity Log')}
            {link('/docs', 'file', 'Documentation')}
          </div>
        )}

        <div className="spacer" />

        <div className="nav-section">
          {link('/account', 'settings', 'My Account')}
          <div className="nav-link" onClick={doLogout} title={collapsed ? 'Sign out' : undefined}>
            <Icon name="logout" size={18} /><span className="label-text">Sign out</span>
          </div>
        </div>

        <div className="collapse-toggle" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
          <Icon name={collapsed ? 'chevrons-right' : 'chevrons-left'} size={18} />
          <span className="label-text">Collapse</span>
        </div>

        <div className="user-box">
          <div className="avatar">{initials}</div>
          <div className="details">
            <div className="nm">{user.name}</div>
            <div className="em">{user.role === 'superadmin' ? 'Super Admin' : user.role === 'admin' ? 'Admin' : 'Member'}</div>
          </div>
        </div>
      </aside>

      <div className={`scrim ${open ? 'show' : ''}`} onClick={close} />

      <div className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setOpen((o) => !o)} aria-label="Menu"><Icon name="menu" size={22} /></button>
          <span className="mobile-title"><Icon name="building" size={18} style={{ color: 'var(--brand)', verticalAlign: '-3px' }} /> BuildLedger</span>
          <div className="grow" />
          <button className="btn btn-icon btn-ghost" title={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={19} />
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
