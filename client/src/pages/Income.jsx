import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useProject } from './ProjectLayout.jsx';
import { Modal, Field, Loading, Empty, Badge, ConfirmModal, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { money, fmtDate } from '../format.js';

export default function Income() {
  const { projectId } = useParams();
  const { project, access, payment_methods, income_categories = [] } = useProject();
  const toast = useToast();
  const cur = { currency: project.currency, locale: project.locale };
  const canEdit = access.isAdmin || access.level === 'collaborator' || access.level === 'manager';

  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ search: '', category: '', from: '', to: '', sort: 'date_desc' });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    setData(await api.get(`/projects/${projectId}/income?${qs}`));
  }, [projectId, filters]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  const [sp, setSp] = useSearchParams();
  useEffect(() => {
    const openId = sp.get('open');
    if (!openId || !data) return;
    const found = data.incomes.find((i) => String(i.id) === openId);
    if (found) setEditing(found);
    sp.delete('open'); setSp(sp, { replace: true });
  }, [sp, data, setSp]);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const exportQs = new URLSearchParams(Object.entries(filters).filter(([k, v]) => v && k !== 'sort')).toString();

  return (
    <div className="stack">
      <div className="flex between wrap">
        <h2 className="sec-head"><Icon name="trending" size={18} /> Income / Payments Received {data && <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {data.count} · {money(data.sum, cur)}</span>}</h2>
        <div className="flex wrap">
          <button className="btn btn-sm" title={exportQs ? 'Exports the filtered rows' : 'Exports all income'} onClick={() => api.download(`/projects/${projectId}/export/income.csv?${exportQs}`)}><Icon name="download" size={15} />CSV{exportQs ? ' (filtered)' : ''}</button>
          {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size={15} />Record Payment</button>}
        </div>
      </div>

      <div className="card card-pad">
        <div className="row">
          <div className="search-field"><Icon name="search" size={16} /><input className="input" placeholder="Search source, ref, notes…" value={filters.search} onChange={set('search')} /></div>
          <select className="input" value={filters.category} onChange={set('category')}>
            <option value="">All categories</option>
            {income_categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input" value={filters.sort} onChange={set('sort')}>
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="amount_desc">Amount (high to low)</option>
            <option value="amount_asc">Amount (low to high)</option>
          </select>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <Field label="From"><input className="input" type="date" value={filters.from} onChange={set('from')} /></Field>
          <Field label="To"><input className="input" type="date" value={filters.to} onChange={set('to')} /></Field>
        </div>
      </div>

      <div className="card">
        {!data ? <Loading /> : data.incomes.length === 0 ? (
          <Empty icon="trending" title="No payments recorded">{canEdit ? 'Record money received — advances, milestone payments, final settlement.' : 'No income recorded.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="tbl cards">
              <thead><tr><th>Date</th><th>Ref</th><th>Source / Payer</th><th>Category</th><th className="num">Amount</th><th>Method</th>{canEdit && <th></th>}</tr></thead>
              <tbody>
                {data.incomes.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Date">{fmtDate(i.income_date)}</td>
                    <td data-label="Ref"><span className="muted">{i.ref}</span></td>
                    <td data-label="Source">{i.source || <span className="muted">—</span>}{i.notes && <div className="muted" style={{ fontSize: 11.5 }}>{i.notes}</div>}</td>
                    <td data-label="Category">{i.category ? <Badge color="green">{i.category}</Badge> : <span className="muted">—</span>}</td>
                    <td data-label="Amount" className="num"><b className="pos">{money(i.amount, cur)}</b></td>
                    <td data-label="Method" className="muted">{i.method || '—'}</td>
                    {canEdit && (
                      <td data-label="">
                        <div className="row-actions">
                          <button className="btn btn-icon btn-ghost" title="Edit" onClick={() => setEditing(i)}><Icon name="edit" size={16} /></button>
                          <button className="btn btn-icon btn-ghost" title="Delete" onClick={() => setDeleting(i)}><Icon name="trash" size={16} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <IncomeModal projectId={projectId} project={project} categories={income_categories} paymentMethods={payment_methods} income={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {deleting && <ConfirmModal title="Delete payment" danger confirmLabel="Delete"
        message={`Delete ${deleting.ref}${deleting.source ? ` from ${deleting.source}` : ''}?`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const d = deleting;
          try {
            await api.del(`/projects/${projectId}/income/${d.id}`);
            setDeleting(null); load();
            toast.action('Payment deleted', 'Undo', async () => {
              try { await api.post(`/projects/${projectId}/income`, { income_date: d.income_date, ref: d.ref, source: d.source, category: d.category, amount: d.amount, method: d.method, notes: d.notes }); toast.success('Payment restored'); load(); }
              catch (e) { toast.error(`Undo failed: ${e.message}`); }
            });
          } catch (e) { toast.error(e.message); }
        }} />}
    </div>
  );
}

function IncomeModal({ projectId, project, categories, paymentMethods, income, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !income.id;
  const [f, setF] = useState({
    income_date: income.income_date || new Date().toISOString().slice(0, 10),
    ref: income.ref || '', source: income.source || '', category: income.category || '',
    amount: income.amount ?? '', method: income.method || '', notes: income.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.income_date) return toast.error('Date is required');
    setBusy(true);
    try {
      const payload = { ...f, amount: Number(f.amount) || 0 };
      if (isNew) await api.post(`/projects/${projectId}/income`, payload);
      else await api.patch(`/projects/${projectId}/income/${income.id}`, payload);
      toast.success(isNew ? 'Payment recorded' : 'Payment updated');
      onSaved();
    } catch (e) { toast.error(e.message); setBusy(false); }
  };
  return (
    <Modal title={isNew ? 'Record Payment' : `Edit ${income.ref}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : isNew ? 'Record Payment' : 'Save'}</button></>}>
      <div className="row">
        <Field label="Date"><input className="input" type="date" value={f.income_date} onChange={set('income_date')} /></Field>
        <Field label="Ref" hint={isNew ? 'Blank = auto' : ''}><input className="input" value={f.ref} onChange={set('ref')} placeholder="INC-001" /></Field>
        <Field label="Amount received"><input className="input" type="number" value={f.amount} onChange={set('amount')} placeholder="0" /></Field>
      </div>
      <Field label="Source / Payer"><input className="input" value={f.source} onChange={set('source')} placeholder="e.g. Client name / buyer" /></Field>
      <div className="row">
        <Field label="Category">
          <select className="input" value={f.category} onChange={set('category')}>
            <option value="">— none —</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Method">
          <select className="input" value={f.method} onChange={set('method')}>
            <option value="">— none —</option>
            {paymentMethods.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notes"><textarea className="input" value={f.notes} onChange={set('notes')} /></Field>
    </Modal>
  );
}
