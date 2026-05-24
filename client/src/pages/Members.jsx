import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Modal, Field, Loading, Empty, Badge, ConfirmModal, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const VIEW_OPTIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'income', label: 'Income' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'stakeholders', label: 'Stakeholders' },
  { key: 'settlement', label: 'Settlement' },
  { key: 'files', label: 'Files' },
  { key: 'reports', label: 'Reports' },
];
const LEVELS = [
  { key: 'viewer', label: 'Viewer', desc: 'Read-only access to the enabled views' },
  { key: 'collaborator', label: 'Collaborator', desc: 'Can add, edit and delete expenses' },
  { key: 'manager', label: 'Manager', desc: 'Full control: stakeholders, members, settings' },
];

export default function Members() {
  const { projectId } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    const d = await api.get(`/projects/${projectId}/members`);
    setData(d);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <Loading />;

  return (
    <div className="stack">
      <div className="flex between wrap">
        <div>
          <h2 style={{ fontSize: 17 }}>Members &amp; Access</h2>
          <div className="sub muted" style={{ fontSize: 13 }}>Assign who can see and collaborate on this project, and which views they get.</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ isNew: true })} disabled={data.candidates.length === 0}><Icon name="plus" size={15} />Add Member</button>
      </div>

      {data.members.length === 0 ? (
        <div className="card"><Empty icon="users" title="No members assigned">Only admins can access this project. Add members to share it.</Empty></div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>User</th><th>Access Level</th><th>Enabled Views</th><th></th></tr></thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.user_id}>
                  <td><b>{m.name}</b><div className="muted" style={{ fontSize: 12 }}>{m.email}</div></td>
                  <td><Badge color={m.access_level === 'manager' ? 'amber' : m.access_level === 'collaborator' ? 'blue' : 'gray'}>{m.access_level}</Badge></td>
                  <td>
                    <div className="flex wrap" style={{ gap: 4 }}>
                      {m.access_level === 'manager'
                        ? <span className="muted" style={{ fontSize: 12.5 }}>All views</span>
                        : m.views.map((v) => <span key={v} className="badge gray" style={{ fontSize: 11 }}>{v}</span>)}
                    </div>
                  </td>
                  <td><div className="row-actions">
                    <button className="btn btn-icon btn-ghost" title="Edit access" onClick={() => setEditing({ ...m })}><Icon name="edit" size={16} /></button>
                    <button className="btn btn-icon btn-ghost" title="Remove" onClick={() => setRemoving(m)}><Icon name="trash" size={16} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <MemberModal projectId={projectId} member={editing} candidates={data.candidates} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {removing && <ConfirmModal title="Remove member" danger confirmLabel="Remove"
        message={`Remove ${removing.name}'s access to this project?`}
        onClose={() => setRemoving(null)}
        onConfirm={async () => { try { await api.del(`/projects/${projectId}/members/${removing.user_id}`); toast.success('Member removed'); setRemoving(null); load(); } catch (e) { toast.error(e.message); } }} />}
    </div>
  );
}

function MemberModal({ projectId, member, candidates, onClose, onSaved }) {
  const toast = useToast();
  const isNew = member.isNew;
  const [userId, setUserId] = useState(member.user_id || (candidates[0] && candidates[0].id) || '');
  const [level, setLevel] = useState(member.access_level || 'viewer');
  const [views, setViews] = useState(member.views || ['dashboard', 'expenses', 'income', 'tasks', 'stakeholders', 'settlement', 'files', 'reports']);
  const [busy, setBusy] = useState(false);

  const toggle = (v) => setViews((cur) => cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);

  const save = async () => {
    if (isNew && !userId) return toast.error('Select a user');
    setBusy(true);
    try {
      if (isNew) await api.post(`/projects/${projectId}/members`, { user_id: Number(userId), access_level: level, views });
      else await api.patch(`/projects/${projectId}/members/${member.user_id}`, { access_level: level, views });
      toast.success('Access saved');
      onSaved();
    } catch (e) { toast.error(e.message); setBusy(false); }
  };

  return (
    <Modal title={isNew ? 'Add Member' : `Edit ${member.name}`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Access'}</button>
      </>}>
      {isNew && (
        <Field label="User">
          <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
          </select>
        </Field>
      )}
      <Field label="Access level">
        <div className="stack" style={{ gap: 8 }}>
          {LEVELS.map((l) => (
            <label key={l.key} className={`tag-toggle ${level === l.key ? 'on' : ''}`} style={{ borderRadius: 8, justifyContent: 'flex-start', padding: '10px 12px' }}>
              <input type="radio" name="level" checked={level === l.key} onChange={() => setLevel(l.key)} style={{ marginRight: 6 }} />
              <span><b>{l.label}</b> <span className="muted" style={{ fontWeight: 400 }}>— {l.desc}</span></span>
            </label>
          ))}
        </div>
      </Field>
      <Field label="Enabled views" hint={level === 'manager' ? 'Managers always see every view.' : 'Choose which sections this member can open.'}>
        <div className="flex wrap" style={{ gap: 8, opacity: level === 'manager' ? 0.5 : 1, pointerEvents: level === 'manager' ? 'none' : 'auto' }}>
          {VIEW_OPTIONS.map((v) => (
            <span key={v.key} className={`tag-toggle ${views.includes(v.key) ? 'on' : ''}`} onClick={() => toggle(v.key)}>{v.label}</span>
          ))}
        </div>
      </Field>
    </Modal>
  );
}
