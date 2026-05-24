import { useAuth } from '../auth.jsx';
import { Badge } from '../components/ui.jsx';
import ChangePassword from './ChangePassword.jsx';

export default function Account() {
  const { user } = useAuth();
  const roleLabel = { superadmin: 'Super Admin', admin: 'Admin', user: 'Member' }[user.role] || user.role;
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <div className="page-head"><div><h1>My Account</h1></div></div>
      <div className="card card-pad">
        <div className="flex between"><span className="muted">Name</span><b>{user.name}</b></div>
        <div className="divider" style={{ margin: '10px 0' }} />
        <div className="flex between"><span className="muted">Email</span><b>{user.email}</b></div>
        <div className="divider" style={{ margin: '10px 0' }} />
        <div className="flex between"><span className="muted">Role</span><Badge color={user.role === 'superadmin' ? 'amber' : user.role === 'admin' ? 'blue' : 'gray'}>{roleLabel}</Badge></div>
      </div>
      <ChangePassword />
    </div>
  );
}
