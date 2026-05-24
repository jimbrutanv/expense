import { useAuth } from '../auth.jsx';
import { Badge } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { fmtDate } from '../format.js';
import { ChangePasswordCard } from './ChangePassword.jsx';

export default function Account() {
  const { user } = useAuth();
  const roleLabel = { superadmin: 'Super Admin', admin: 'Admin', user: 'Member' }[user.role] || user.role;
  const roleColor = user.role === 'superadmin' ? 'amber' : user.role === 'admin' ? 'blue' : 'gray';
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="stack" style={{ maxWidth: 920 }}>
      <div className="page-head"><div><h1>My Account</h1><div className="sub">Your profile and security settings</div></div></div>

      <div className="card">
        <div className="acct-hero">
          <div className="acct-avatar">{initials}</div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 20 }}>{user.name}</h2>
            <div className="muted" style={{ fontSize: 14 }}>{user.email}</div>
            <div style={{ marginTop: 8 }}><Badge color={roleColor}>{roleLabel}</Badge></div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3><Icon name="user" size={17} /> Profile</h3></div>
          <div className="card-pad">
            <Row label="Full name" value={user.name} />
            <Row label="Email" value={user.email} />
            <Row label="Role" value={<Badge color={roleColor}>{roleLabel}</Badge>} />
            <Row label="Member since" value={fmtDate(user.created_at)} last />
            <div className="notice" style={{ marginTop: 14 }}>
              <Icon name="info" size={16} />
              <span>Name, email and role are managed by an administrator. Contact your admin to change them.</span>
            </div>
          </div>
        </div>

        <ChangePasswordCard />
      </div>
    </div>
  );
}

function Row({ label, value, last }) {
  return (
    <div className="flex between" style={{ padding: '11px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <span className="muted">{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
