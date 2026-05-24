import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Modal, Field, Loading, Empty, Badge, ConfirmModal, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const TYPES = ['client', 'supplier', 'contractor', 'labor', 'consultant', 'other'];
const TYPE_COLOR = { client: 'green', supplier: 'blue', contractor: 'amber', labor: 'gray', consultant: 'blue', other: 'gray' };

export default function Contacts() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [contacts, setContacts] = useState(null);
  const [filter, setFilter] = useState({ search: '', type: '' });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
    setContacts((await api.get(`/contacts?${qs}`)).contacts);
  }, [filter]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  if (!contacts) return <Loading />;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Contacts</h1><div className="sub">Clients, suppliers, contractors &amp; labour — your business directory</div></div>
        <button className="btn btn-primary" onClick={() => setEditing({})}><Icon name="plus" size={16} />Add Contact</button>
      </div>

      <div className="card card-pad">
        <div className="row">
          <div className="search-field"><Icon name="search" size={16} /><input className="input" placeholder="Search name, company, phone, email…" value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} /></div>
          <select className="input" value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {contacts.length === 0 ? (
        <div className="card"><Empty icon="contacts" title="No contacts yet">Add the people and companies you work with — clients, suppliers, contractors, labour.</Empty></div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl cards">
            <thead><tr><th>Name</th><th>Type</th><th>Company</th><th>Phone</th><th>Email</th><th></th></tr></thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} style={params.get('focus') == c.id ? { background: 'var(--brand-soft)' } : undefined}>
                  <td data-label="Name"><b>{c.name}</b>{c.notes && <div className="muted" style={{ fontSize: 11.5 }}>{c.notes}</div>}</td>
                  <td data-label="Type"><Badge color={TYPE_COLOR[c.type]}>{c.type}</Badge></td>
                  <td data-label="Company" className="muted">{c.company || '—'}</td>
                  <td data-label="Phone">{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : <span className="muted">—</span>}</td>
                  <td data-label="Email">{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span className="muted">—</span>}</td>
                  <td data-label="">
                    <div className="row-actions">
                      <button className="btn btn-icon btn-ghost" title="Edit" onClick={() => setEditing(c)}><Icon name="edit" size={16} /></button>
                      <button className="btn btn-icon btn-ghost" title="Delete" onClick={() => setDeleting(c)}><Icon name="trash" size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <ContactModal contact={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {deleting && <ConfirmModal title="Delete contact" danger confirmLabel="Delete" message={`Delete ${deleting.name}?`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const d = deleting;
          try {
            await api.del(`/contacts/${d.id}`); setDeleting(null); load();
            toast.action('Contact deleted', 'Undo', async () => { try { await api.post('/contacts', { name: d.name, type: d.type, company: d.company, phone: d.phone, email: d.email, address: d.address, notes: d.notes }); toast.success('Contact restored'); load(); } catch (e) { toast.error(`Undo failed: ${e.message}`); } });
          } catch (e) { toast.error(e.message); }
        }} />}
    </div>
  );
}

function ContactModal({ contact, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !contact.id;
  const [f, setF] = useState({ name: contact.name || '', type: contact.type || 'client', company: contact.company || '', phone: contact.phone || '', email: contact.email || '', address: contact.address || '', notes: contact.notes || '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.name.trim()) return toast.error('Name is required');
    setBusy(true);
    try { if (isNew) await api.post('/contacts', f); else await api.patch(`/contacts/${contact.id}`, f); toast.success('Saved'); onSaved(); }
    catch (e) { toast.error(e.message); setBusy(false); }
  };
  return (
    <Modal title={isNew ? 'Add Contact' : 'Edit Contact'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="row">
        <Field label="Name"><input className="input" autoFocus value={f.name} onChange={set('name')} /></Field>
        <Field label="Type"><select className="input" value={f.type} onChange={set('type')}>{TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}</select></Field>
      </div>
      <Field label="Company"><input className="input" value={f.company} onChange={set('company')} /></Field>
      <div className="row">
        <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
      </div>
      <Field label="Address"><input className="input" value={f.address} onChange={set('address')} /></Field>
      <Field label="Notes"><textarea className="input" value={f.notes} onChange={set('notes')} /></Field>
    </Modal>
  );
}
