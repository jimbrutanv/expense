import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useProject } from './ProjectLayout.jsx';
import { Modal, Field, Empty, Badge, ConfirmModal, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { pct } from '../format.js';

export default function Stakeholders() {
  const { projectId } = useParams();
  const { stakeholders, access, reload } = useProject();
  const toast = useToast();
  const canEdit = access.isAdmin || access.level === 'manager';
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const totalPct = stakeholders.reduce((a, s) => a + (s.split_pct || 0), 0);
  const valid = Math.abs(totalPct - 1) < 0.0001;

  return (
    <div className="stack">
      <div className="flex between wrap">
        <h2 style={{ fontSize: 17 }}>Stakeholders &amp; Profit Split</h2>
        <div className="flex wrap">
          <button className="btn btn-sm" onClick={() => api.download(`/projects/${projectId}/export/project.xlsx`)}><Icon name="table" size={15} />Excel</button>
          <button className="btn btn-sm" onClick={() => api.download(`/projects/${projectId}/export/stakeholders.csv`)}><Icon name="download" size={15} />CSV</button>
          {canEdit && stakeholders.length < 10 && <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size={15} />Add Stakeholder</button>}
        </div>
      </div>

      <div className={`notice ${valid ? '' : 'warn'}`}>
        <Icon name={valid ? 'check-circle' : 'alert'} size={16} />
        <span>{valid ? `Fixed split totals 100% across ${stakeholders.length} stakeholders.`
          : `Fixed split currently totals ${pct(totalPct)} — adjust so it equals exactly 100%.`}</span>
      </div>

      {stakeholders.length === 0 ? (
        <div className="card"><Empty icon="users" title="No stakeholders yet">{canEdit ? 'Add the partners/investors and their profit-split percentages.' : 'No stakeholders configured.'}</Empty></div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>Name</th><th>Role / Company</th><th>Contact</th><th className="num">Fixed Split %</th>{canEdit && <th></th>}
            </tr></thead>
            <tbody>
              {stakeholders.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.name}</b>{s.notes && <div className="muted" style={{ fontSize: 12 }}>{s.notes}</div>}</td>
                  <td>{s.role || <span className="muted">—</span>}</td>
                  <td className="muted">{s.contact || '—'}</td>
                  <td className="num"><Badge color="amber">{pct(s.split_pct)}</Badge></td>
                  {canEdit && <td><div className="row-actions">
                    <button className="btn btn-icon btn-ghost" title="Edit" onClick={() => setEditing(s)}><Icon name="edit" size={16} /></button>
                    <button className="btn btn-icon btn-ghost" title="Remove" onClick={() => setDeleting(s)}><Icon name="trash" size={16} /></button>
                  </div></td>}
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ fontWeight: 700 }}>
              <td colSpan={3}>TOTAL</td>
              <td className="num"><Badge color={valid ? 'green' : 'red'}>{pct(totalPct)}</Badge></td>
              {canEdit && <td></td>}
            </tr></tfoot>
          </table>
        </div>
      )}

      {editing && <StakeholderModal projectId={projectId} stakeholder={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {deleting && <ConfirmModal title="Remove stakeholder" danger confirmLabel="Remove"
        message={`Remove "${deleting.name}"? This is only possible if they are not referenced by any expense split.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { try { await api.del(`/projects/${projectId}/stakeholders/${deleting.id}`); toast.success('Stakeholder removed'); setDeleting(null); reload(); } catch (e) { toast.error(e.message); } }} />}
    </div>
  );
}

function StakeholderModal({ projectId, stakeholder, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !stakeholder.id;
  const [f, setF] = useState({
    name: stakeholder.name || '', role: stakeholder.role || '', contact: stakeholder.contact || '',
    notes: stakeholder.notes || '', split: stakeholder.split_pct != null ? (stakeholder.split_pct * 100) : '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.name.trim()) return toast.error('Name is required');
    setBusy(true);
    const payload = { name: f.name, role: f.role, contact: f.contact, notes: f.notes, split_pct: (Number(f.split) || 0) / 100 };
    try {
      if (isNew) await api.post(`/projects/${projectId}/stakeholders`, payload);
      else await api.patch(`/projects/${projectId}/stakeholders/${stakeholder.id}`, payload);
      toast.success('Saved');
      onSaved();
    } catch (e) { toast.error(e.message); setBusy(false); }
  };

  return (
    <Modal title={isNew ? 'Add Stakeholder' : 'Edit Stakeholder'} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="row">
        <Field label="Name"><input className="input" autoFocus value={f.name} onChange={set('name')} /></Field>
        <Field label="Fixed Split %" hint="Used for profit & cost share"><input className="input" type="number" value={f.split} onChange={set('split')} placeholder="50" /></Field>
      </div>
      <div className="row">
        <Field label="Role / Company"><input className="input" value={f.role} onChange={set('role')} /></Field>
        <Field label="Contact"><input className="input" value={f.contact} onChange={set('contact')} /></Field>
      </div>
      <Field label="Notes"><textarea className="input" value={f.notes} onChange={set('notes')} /></Field>
    </Modal>
  );
}
