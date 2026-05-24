import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, Field, Loading, Badge, ConfirmModal, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { fmtDate } from '../format.js';

export default function Users() {
  const { user: me, isSuperAdmin } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => { const { users } = await api.get('/users'); setUsers(users); }, []);
  useEffect(() => { load(); }, [load]);
  if (!users) return <Loading />;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Users</h1><div className="sub">Create and manage accounts and their roles</div></div>
        <button className="btn btn-primary" onClick={() => setEditing({ isNew: true })}><Icon name="plus" size={16} />New User</button>
      </div>

      <div className="card table-wrap">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th className="num">Projects</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name}</b>{u.id === me.id && <span className="muted" style={{ fontSize: 12 }}> (you)</span>}</td>
                <td className="muted">{u.email}</td>
                <td><Badge color={u.role === 'superadmin' ? 'amber' : u.role === 'admin' ? 'blue' : 'gray'}>{roleLabel(u.role)}</Badge></td>
                <td>{u.is_active ? <Badge color="green">Active</Badge> : <Badge color="red">Disabled</Badge>}{u.must_change_password ? <span className="muted" style={{ fontSize: 11, display: 'block' }}>must reset pw</span> : null}</td>
                <td className="num">{u.project_count}</td>
                <td className="muted">{fmtDate(u.created_at)}</td>
                <td><div className="row-actions">
                  <button className="btn btn-icon btn-ghost" title="Edit" onClick={() => setEditing({ ...u })}><Icon name="edit" size={16} /></button>
                  <button className="btn btn-icon btn-ghost" title="Reset password" onClick={() => setResetting(u)}><Icon name="key" size={16} /></button>
                  {u.id !== me.id && <button className="btn btn-icon btn-ghost" title="Delete" onClick={() => setDeleting(u)}><Icon name="trash" size={16} /></button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <UserModal me={me} isSuperAdmin={isSuperAdmin} user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {resetting && <ResetModal user={resetting} onClose={() => setResetting(null)} onDone={() => { setResetting(null); load(); }} />}
      {deleting && <ConfirmModal title="Delete user" danger confirmLabel="Delete"
        message={`Delete ${deleting.name} (${deleting.email})? They will lose all access immediately.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { try { await api.del(`/users/${deleting.id}`); toast.success('User deleted'); setDeleting(null); load(); } catch (e) { toast.error(e.message); } }} />}
    </div>
  );
}

const roleLabel = (r) => ({ superadmin: 'Super Admin', admin: 'Admin', user: 'Member' }[r] || r);

function UserModal({ me, isSuperAdmin, user, onClose, onSaved }) {
  const toast = useToast();
  const isNew = user.isNew;
  const [f, setF] = useState({ name: user.name || '', email: user.email || '', password: '', role: user.role || 'user', is_active: user.is_active ?? true });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const roles = [['user', 'Member'], ['admin', 'Admin']];
  if (isSuperAdmin) roles.push(['superadmin', 'Super Admin']);

  const save = async () => {
    setBusy(true);
    try {
      if (isNew) {
        if (!f.name.trim() || !f.email.trim() || !f.password) { setBusy(false); return toast.error('Name, email and password are required'); }
        await api.post('/users', { name: f.name, email: f.email, password: f.password, role: f.role });
        toast.success('User created — they must change their password on first login');
      } else {
        await api.patch(`/users/${user.id}`, { name: f.name, role: f.role, is_active: !!f.is_active });
        toast.success('User updated');
      }
      onSaved();
    } catch (e) { toast.error(e.message); setBusy(false); }
  };

  return (
    <Modal title={isNew ? 'New User' : `Edit ${user.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="row">
        <Field label="Name"><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} disabled={!isNew} /></Field>
      </div>
      {isNew && <Field label="Temporary password" hint="At least 8 characters; the user resets it on first login.">
        <input className="input" value={f.password} onChange={set('password')} />
      </Field>}
      <div className="row">
        <Field label="Role">
          <select className="input" value={f.role} onChange={set('role')} disabled={!isNew && user.id === me.id}>
            {roles.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        {!isNew && (
          <Field label="Account status">
            <select className="input" value={f.is_active ? '1' : '0'} onChange={(e) => setF({ ...f, is_active: e.target.value === '1' })} disabled={user.id === me.id}>
              <option value="1">Active</option><option value="0">Disabled</option>
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function ResetModal({ user, onClose, onDone }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (pw.length < 8) return toast.error('Password must be at least 8 characters');
    setBusy(true);
    try { await api.post(`/users/${user.id}/reset-password`, { new_password: pw }); toast.success(`Password reset for ${user.name}`); onDone(); }
    catch (e) { toast.error(e.message); setBusy(false); }
  };
  return (
    <Modal title={`Reset password — ${user.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? '…' : 'Reset Password'}</button></>}>
      <Field label="New temporary password" hint="The user will be required to change it on next login.">
        <input className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}
