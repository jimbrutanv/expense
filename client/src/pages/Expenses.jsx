import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useProject } from './ProjectLayout.jsx';
import { Modal, Field, Loading, Empty, Badge, ConfirmModal, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { money, num, fmtDate } from '../format.js';

export default function Expenses() {
  const { projectId } = useParams();
  const { project, access, stakeholders, categories, payment_methods, vendors = [] } = useProject();
  const toast = useToast();
  const cur = { currency: project.currency, locale: project.locale };
  const canEdit = access.isAdmin || access.level === 'collaborator' || access.level === 'manager';

  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ search: '', category: '', payment_method: '', vendor: '', from: '', to: '', stakeholder_id: '', sort: 'date_desc' });
  const [editing, setEditing] = useState(null); // expense object or {} for new
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    const d = await api.get(`/projects/${projectId}/expenses?${qs}`);
    setData(d);
  }, [projectId, filters]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const shName = (id) => stakeholders.find((s) => s.id === id)?.name || '—';
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <div className="stack">
      <div className="flex between wrap">
        <h2 style={{ fontSize: 17 }}>Expenses {data && <span className="muted" style={{ fontWeight: 500, fontSize: 14 }}>· {data.count} entries · {money(data.sum, cur)}</span>}</h2>
        <div className="flex wrap">
          <button className="btn btn-sm" onClick={() => api.download(`/projects/${projectId}/export/expenses.xlsx`)}><Icon name="table" size={15} />Excel</button>
          <button className="btn btn-sm" onClick={() => api.download(`/projects/${projectId}/export/expenses.csv`)}><Icon name="download" size={15} />CSV</button>
          {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size={15} />Add Expense</button>}
        </div>
      </div>

      <div className="card card-pad">
        <div className="row">
          <div className="search-field">
            <Icon name="search" size={16} />
            <input className="input" placeholder="Search description, ref, receipt…" value={filters.search} onChange={set('search')} />
          </div>
          <select className="input" value={filters.category} onChange={set('category')}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <select className="input" value={filters.stakeholder_id} onChange={set('stakeholder_id')}>
            <option value="">All stakeholders</option>
            {stakeholders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="input" value={filters.sort} onChange={set('sort')}>
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="amount_desc">Amount (high to low)</option>
            <option value="amount_asc">Amount (low to high)</option>
            <option value="ref_asc">Reference (A to Z)</option>
          </select>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <Field label="From"><input className="input" type="date" value={filters.from} onChange={set('from')} /></Field>
          <Field label="To"><input className="input" type="date" value={filters.to} onChange={set('to')} /></Field>
          <select className="input" value={filters.payment_method} onChange={set('payment_method')} style={{ alignSelf: 'flex-end', marginBottom: 14 }}>
            <option value="">All payment methods</option>
            {payment_methods.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
          {vendors.length > 0 && (
            <select className="input" value={filters.vendor} onChange={set('vendor')} style={{ alignSelf: 'flex-end', marginBottom: 14 }}>
              <option value="">All vendors</option>
              {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="card">
        {!data ? <Loading /> : data.expenses.length === 0 ? (
          <Empty icon="receipt" title="No expenses found">{canEdit ? 'Add your first expense or adjust the filters.' : 'No expenses match the filters.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="tbl cards">
              <thead><tr>
                <th>Date</th><th>Ref</th><th>Description</th><th>Category</th>
                <th className="num">Total</th><th>Paid by</th><th>Check</th><th>Payment</th>
                {canEdit && <th></th>}
              </tr></thead>
              <tbody>
                {data.expenses.map((e) => (
                  <tr key={e.id}>
                    <td data-label="Date">{fmtDate(e.expense_date)}</td>
                    <td data-label="Ref"><span className="muted">{e.ref}</span></td>
                    <td data-label="Description">
                      {e.description || <span className="muted">—</span>}
                      {e.vendor && <div className="muted" style={{ fontSize: 11.5 }}>{e.vendor}</div>}
                      {e.receipt_no && <div className="muted flex" style={{ fontSize: 11.5, gap: 4 }}><Icon name="receipt" size={12} /> {e.receipt_no}</div>}
                    </td>
                    <td data-label="Category">{e.category ? <Badge color="gray">{e.category}</Badge> : <span className="muted">—</span>}</td>
                    <td data-label="Total" className="num"><b>{money(e.total, cur)}</b></td>
                    <td data-label="Paid by">
                      <div className="flex wrap" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        {e.splits.length === 0 ? <span className="muted">unallocated</span>
                          : e.splits.map((sp) => (
                            <span key={sp.stakeholder_id} className="badge gray" style={{ fontSize: 11 }}>
                              {shName(sp.stakeholder_id)}: {num(sp.amount, project.locale)}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td data-label="Check">{e.split_check === 'ok' ? <Badge color="green">OK</Badge> : <Badge color="red">{e.split_check}</Badge>}</td>
                    <td data-label="Payment" className="muted">{e.payment_method || '—'}</td>
                    {canEdit && (
                      <td data-label="">
                        <div className="row-actions">
                          <button className="btn btn-icon btn-ghost" title="Edit" onClick={() => setEditing(e)}><Icon name="edit" size={16} /></button>
                          <button className="btn btn-icon btn-ghost" title="Delete" onClick={() => setDeleting(e)}><Icon name="trash" size={16} /></button>
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

      {editing && (
        <ExpenseModal
          projectId={projectId} project={project} stakeholders={stakeholders}
          categories={categories} paymentMethods={payment_methods} vendors={vendors} expense={editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {deleting && (
        <ConfirmModal title="Delete expense" danger confirmLabel="Delete"
          message={`Delete ${deleting.ref}${deleting.description ? ` — ${deleting.description}` : ''}? This cannot be undone.`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => { try { await api.del(`/projects/${projectId}/expenses/${deleting.id}`); toast.success('Expense deleted'); setDeleting(null); load(); } catch (e) { toast.error(e.message); } }}
        />
      )}
    </div>
  );
}

function ExpenseModal({ projectId, project, stakeholders, categories, paymentMethods, vendors = [], expense, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !expense.id;
  const cur = { currency: project.currency, locale: project.locale };
  const [f, setF] = useState({
    expense_date: expense.expense_date || new Date().toISOString().slice(0, 10),
    ref: expense.ref || '',
    description: expense.description || '',
    category: expense.category || '',
    total: expense.total ?? '',
    vendor: expense.vendor || '',
    receipt_no: expense.receipt_no || '',
    payment_method: expense.payment_method || '',
    notes: expense.notes || '',
  });
  const [splits, setSplits] = useState(() => {
    const map = {};
    (expense.splits || []).forEach((s) => { map[s.stakeholder_id] = s.amount; });
    return map;
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const total = Number(f.total) || 0;
  const allocated = Object.values(splits).reduce((a, v) => a + (Number(v) || 0), 0);
  const diff = Math.round((total - allocated) * 100) / 100;

  const setSplit = (id, v) => setSplits({ ...splits, [id]: v });
  const splitEqually = () => {
    if (!stakeholders.length) return;
    const each = Math.round((total / stakeholders.length) * 100) / 100;
    const m = {};
    stakeholders.forEach((s, i) => { m[s.id] = i === stakeholders.length - 1 ? Math.round((total - each * (stakeholders.length - 1)) * 100) / 100 : each; });
    setSplits(m);
  };
  const payAll = (id) => { const m = {}; m[id] = total; setSplits(m); };
  const clearSplits = () => setSplits({});

  const save = async () => {
    if (!f.expense_date) return toast.error('Date is required');
    setBusy(true);
    const payload = {
      ...f, total,
      splits: Object.entries(splits).map(([sid, amount]) => ({ stakeholder_id: Number(sid), amount: Number(amount) || 0 })).filter((s) => s.amount),
    };
    try {
      if (isNew) await api.post(`/projects/${projectId}/expenses`, payload);
      else await api.patch(`/projects/${projectId}/expenses/${expense.id}`, payload);
      toast.success(isNew ? 'Expense added' : 'Expense updated');
      onSaved();
    } catch (e) { toast.error(e.message); setBusy(false); }
  };

  return (
    <Modal title={isNew ? 'Add Expense' : `Edit ${expense.ref}`} onClose={onClose} size="lg"
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : isNew ? 'Add Expense' : 'Save Changes'}</button>
      </>}>
      <div className="row">
        <Field label="Date"><input className="input" type="date" value={f.expense_date} onChange={set('expense_date')} /></Field>
        <Field label="Expense Ref" hint={isNew ? 'Leave blank to auto-generate' : ''}><input className="input" value={f.ref} onChange={set('ref')} placeholder="EXP-001" /></Field>
        <Field label="Total Amount"><input className="input" type="number" value={f.total} onChange={set('total')} placeholder="0" /></Field>
      </div>
      <Field label="Description"><input className="input" value={f.description} onChange={set('description')} placeholder="What was this for?" /></Field>
      <div className="row">
        <Field label="Category">
          <select className="input" value={f.category} onChange={set('category')}>
            <option value="">— none —</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Vendor / Supplier" hint={vendors.length ? 'Pick or type a vendor' : 'Type a vendor name'}>
          <input className="input" list="vendor-list" value={f.vendor} onChange={set('vendor')} placeholder="e.g. ACME Cement Co." />
          <datalist id="vendor-list">{vendors.map((v) => <option key={v.id} value={v.name} />)}</datalist>
        </Field>
      </div>
      <div className="row">
        <Field label="Payment Method">
          <select className="input" value={f.payment_method} onChange={set('payment_method')}>
            <option value="">— none —</option>
            {paymentMethods.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Receipt #"><input className="input" value={f.receipt_no} onChange={set('receipt_no')} /></Field>
      </div>

      <div className="divider" style={{ margin: '6px 0 14px' }} />
      <div className="flex between wrap" style={{ marginBottom: 8 }}>
        <label style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-soft)' }}>Who paid? (split across stakeholders)</label>
        <div className="flex wrap" style={{ gap: 6 }}>
          <button type="button" className="btn btn-sm" onClick={splitEqually}>Split equally</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={clearSplits}>Clear</button>
        </div>
      </div>
      {stakeholders.length === 0 ? (
        <div className="notice warn">No stakeholders configured yet. Add stakeholders first to split this expense.</div>
      ) : (
        <>
          {stakeholders.map((s) => (
            <div key={s.id} className="split-row">
              <div className="nm flex between">
                <span>{s.name} <span className="muted" style={{ fontSize: 12 }}>· {(s.split_pct * 100).toFixed(0)}%</span></span>
                <button type="button" className="btn btn-sm btn-ghost" style={{ fontSize: 11 }} onClick={() => payAll(s.id)}>paid all</button>
              </div>
              <input className="input" type="number" placeholder="0" value={splits[s.id] ?? ''} onChange={(e) => setSplit(s.id, e.target.value)} />
            </div>
          ))}
          <div className="split-meter">
            <span>Allocated <b>{money(allocated, cur)}</b> of <b>{money(total, cur)}</b></span>
            <span className="grow" style={{ flex: 1 }} />
            {Math.abs(diff) < 0.01
              ? <Badge color="green"><Icon name="check" size={13} /> Balanced</Badge>
              : <Badge color="red">{diff > 0 ? `${money(diff, cur)} unallocated` : `${money(-diff, cur)} over`}</Badge>}
          </div>
        </>
      )}
    </Modal>
  );
}
