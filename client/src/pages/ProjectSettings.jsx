import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useProject } from './ProjectLayout.jsx';
import { Field, Badge, ConfirmModal, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const CURRENCIES = ['INR', 'USD', 'PKR', 'EUR', 'GBP', 'AED'];

export default function ProjectSettings() {
  const { projectId } = useParams();
  const { project, categories, payment_methods, vendors = [], reload } = useProject();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [f, setF] = useState({
    name: project.name, description: project.description || '',
    sale_price: project.sale_price, currency: project.currency, status: project.status,
  });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const saveDetails = async () => {
    setBusy(true);
    try {
      await api.patch(`/projects/${projectId}`, {
        ...f, sale_price: Number(f.sale_price) || 0,
        locale: f.currency === 'INR' ? 'en-IN' : 'en-US',
      });
      toast.success('Project updated');
      reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <h2 style={{ fontSize: 17 }}>Project Settings</h2>

      <div className="card">
        <div className="card-head"><h3>Details</h3></div>
        <div className="card-pad">
          <Field label="Project name"><input className="input" value={f.name} onChange={set('name')} /></Field>
          <Field label="Description"><input className="input" value={f.description} onChange={set('description')} /></Field>
          <div className="row">
            <Field label="Sale / Contract price"><input className="input" type="number" value={f.sale_price} onChange={set('sale_price')} /></Field>
            <Field label="Currency"><select className="input" value={f.currency} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Status"><select className="input" value={f.status} onChange={set('status')}><option value="active">Active</option><option value="archived">Archived</option></select></Field>
          </div>
          <button className="btn btn-primary" onClick={saveDetails} disabled={busy}>{busy ? 'Saving…' : 'Save Details'}</button>
        </div>
      </div>

      <div className="grid-2">
        <ListEditor title="Categories" projectId={projectId} items={categories} endpoint="categories" reload={reload} />
        <ListEditor title="Payment Methods" projectId={projectId} items={payment_methods} endpoint="payment-methods" reload={reload} />
      </div>

      <VendorsEditor projectId={projectId} vendors={vendors} reload={reload} />

      {isAdmin && (
        <div className="card" style={{ borderColor: '#fecaca' }}>
          <div className="card-head"><h3 style={{ color: 'var(--red)' }}>Danger Zone</h3></div>
          <div className="card-pad flex between wrap">
            <div><b>Delete this project</b><div className="muted" style={{ fontSize: 13 }}>Permanently removes all expenses, stakeholders and members.</div></div>
            <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>Delete Project</button>
          </div>
        </div>
      )}

      {confirmDel && <ConfirmModal title="Delete project" danger confirmLabel="Delete permanently"
        message={`Delete "${project.name}" and ALL its data? This cannot be undone. Make sure you have a backup.`}
        onClose={() => setConfirmDel(false)}
        onConfirm={async () => { try { await api.del(`/projects/${projectId}`); toast.success('Project deleted'); navigate('/'); } catch (e) { toast.error(e.message); } }} />}
    </div>
  );
}

function VendorsEditor({ projectId, vendors, reload }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', contact: '' });
  const add = async () => {
    if (!f.name.trim()) return toast.error('Vendor name is required');
    try { await api.post(`/projects/${projectId}/vendors`, f); setF({ name: '', contact: '' }); reload(); }
    catch (e) { toast.error(e.message); }
  };
  const del = async (id) => { try { await api.del(`/projects/${projectId}/vendors/${id}`); reload(); } catch (e) { toast.error(e.message); } };
  return (
    <div className="card">
      <div className="card-head"><h3><Icon name="users" size={16} /> Vendors &amp; Suppliers</h3></div>
      <div className="card-pad">
        <div className="row" style={{ marginBottom: 12 }}>
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Vendor / supplier name" />
          <input className="input" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} placeholder="Contact (phone / email)" />
          <button className="btn btn-primary" style={{ flex: '0 0 auto' }} onClick={add}><Icon name="plus" size={15} />Add</button>
        </div>
        {vendors.length === 0 ? <span className="muted">No vendors yet. Add suppliers to tag expenses and filter by vendor.</span> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Vendor</th><th>Contact</th><th></th></tr></thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id}>
                    <td><b>{v.name}</b></td>
                    <td className="muted">{v.contact || '—'}</td>
                    <td><div className="row-actions"><button className="btn btn-icon btn-ghost" title="Remove" onClick={() => del(v.id)}><Icon name="trash" size={16} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ListEditor({ title, projectId, items, endpoint, reload }) {
  const toast = useToast();
  const [val, setVal] = useState('');
  const add = async () => {
    if (!val.trim()) return;
    try { await api.post(`/projects/${projectId}/${endpoint}`, { name: val.trim() }); setVal(''); reload(); }
    catch (e) { toast.error(e.message); }
  };
  const del = async (id) => { try { await api.del(`/projects/${projectId}/${endpoint}/${id}`); reload(); } catch (e) { toast.error(e.message); } };
  return (
    <div className="card">
      <div className="card-head"><h3>{title}</h3></div>
      <div className="card-pad">
        <div className="flex" style={{ marginBottom: 12 }}>
          <input className="input" value={val} onChange={(e) => setVal(e.target.value)} placeholder={`Add a ${title.toLowerCase().replace(/s$/, '')}…`} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn btn-primary" onClick={add}>Add</button>
        </div>
        <div className="flex wrap" style={{ gap: 6 }}>
          {items.map((it) => (
            <span key={it.id} className="badge gray" style={{ paddingRight: 5 }}>
              {it.name}
              <button className="x-btn" style={{ padding: 1, marginLeft: 1 }} onClick={() => del(it.id)}><Icon name="x" size={13} /></button>
            </span>
          ))}
          {items.length === 0 && <span className="muted">None yet.</span>}
        </div>
      </div>
    </div>
  );
}
