import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useProject } from './ProjectLayout.jsx';
import { Modal, Field, Loading, Empty, Badge, ConfirmModal, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { fmtDate } from '../format.js';

const COLUMNS = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];
const PRIO_COLOR = { high: 'red', medium: 'amber', low: 'gray' };

export default function Tasks() {
  const { projectId } = useParams();
  const { access } = useProject();
  const toast = useToast();
  const canEdit = access.isAdmin || access.level === 'collaborator' || access.level === 'manager';
  const [tasks, setTasks] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => { setTasks((await api.get(`/projects/${projectId}/tasks`)).tasks); }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const move = async (t, status) => {
    setTasks((cur) => cur.map((x) => x.id === t.id ? { ...x, status } : x));
    try { await api.patch(`/projects/${projectId}/tasks/${t.id}`, { status }); } catch (e) { toast.error(e.message); load(); }
  };

  if (!tasks) return <Loading />;
  const overdue = (t) => t.due_date && t.status !== 'done' && t.due_date < new Date().toISOString().slice(0, 10);

  return (
    <div className="stack">
      <div className="flex between wrap">
        <h2 className="sec-head"><Icon name="tasks" size={18} /> Tasks <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {tasks.length}</span></h2>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size={15} />Add Task</button>}
      </div>

      {tasks.length === 0 ? (
        <div className="card"><Empty icon="tasks" title="No tasks yet">{canEdit ? 'Track site work, approvals, follow-ups and deadlines here.' : 'No tasks yet.'}</Empty></div>
      ) : (
        <div className="grid-3">
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="card">
                <div className="card-head"><h3>{col.label} <Badge color="gray">{items.length}</Badge></h3></div>
                <div className="card-pad stack" style={{ gap: 10 }}>
                  {items.length === 0 ? <span className="muted" style={{ fontSize: 13 }}>Nothing here.</span> : items.map((t) => (
                    <div key={t.id} className="task-card">
                      <div className="flex between" style={{ alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ fontWeight: 500, fontSize: 13.5 }}>{t.title}</span>
                        <Badge color={PRIO_COLOR[t.priority]}>{t.priority}</Badge>
                      </div>
                      <div className="flex wrap" style={{ gap: 8, marginTop: 6, fontSize: 12 }}>
                        {t.due_date && <span className={overdue(t) ? 'neg' : 'muted'}><Icon name="clock" size={12} style={{ verticalAlign: '-2px' }} /> {fmtDate(t.due_date)}</span>}
                        {t.assignee && <span className="muted"><Icon name="user" size={12} style={{ verticalAlign: '-2px' }} /> {t.assignee}</span>}
                      </div>
                      {canEdit && (
                        <div className="flex between" style={{ marginTop: 8 }}>
                          <select className="input" style={{ padding: '4px 8px', fontSize: 12, width: 'auto' }} value={t.status} onChange={(e) => move(t, e.target.value)}>
                            {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                          <div className="row-actions">
                            <button className="btn btn-icon btn-ghost" title="Edit" onClick={() => setEditing(t)}><Icon name="edit" size={15} /></button>
                            <button className="btn btn-icon btn-ghost" title="Delete" onClick={() => setDeleting(t)}><Icon name="trash" size={15} /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <TaskModal projectId={projectId} task={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {deleting && <ConfirmModal title="Delete task" danger confirmLabel="Delete" message={`Delete "${deleting.title}"?`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const d = deleting;
          try {
            await api.del(`/projects/${projectId}/tasks/${d.id}`);
            setDeleting(null); load();
            toast.action('Task deleted', 'Undo', async () => {
              try { await api.post(`/projects/${projectId}/tasks`, { title: d.title, status: d.status, priority: d.priority, due_date: d.due_date, assignee: d.assignee, notes: d.notes }); toast.success('Task restored'); load(); }
              catch (e) { toast.error(`Undo failed: ${e.message}`); }
            });
          } catch (e) { toast.error(e.message); }
        }} />}
    </div>
  );
}

function TaskModal({ projectId, task, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !task.id;
  const [f, setF] = useState({
    title: task.title || '', status: task.status || 'todo', priority: task.priority || 'medium',
    due_date: task.due_date || '', assignee: task.assignee || '', notes: task.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.title.trim()) return toast.error('Title is required');
    setBusy(true);
    try {
      if (isNew) await api.post(`/projects/${projectId}/tasks`, f);
      else await api.patch(`/projects/${projectId}/tasks/${task.id}`, f);
      toast.success('Saved'); onSaved();
    } catch (e) { toast.error(e.message); setBusy(false); }
  };
  return (
    <Modal title={isNew ? 'Add Task' : 'Edit Task'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <Field label="Title"><input className="input" autoFocus value={f.title} onChange={set('title')} placeholder="What needs doing?" /></Field>
      <div className="row">
        <Field label="Status"><select className="input" value={f.status} onChange={set('status')}>{COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
        <Field label="Priority"><select className="input" value={f.priority} onChange={set('priority')}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
      </div>
      <div className="row">
        <Field label="Due date"><input className="input" type="date" value={f.due_date} onChange={set('due_date')} /></Field>
        <Field label="Assignee"><input className="input" value={f.assignee} onChange={set('assignee')} placeholder="Name" /></Field>
      </div>
      <Field label="Notes"><textarea className="input" value={f.notes} onChange={set('notes')} /></Field>
    </Modal>
  );
}
