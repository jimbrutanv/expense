import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, Field, Loading, Empty, Badge, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { moneyCompact, pct } from '../format.js';

const CURRENCIES = ['INR', 'USD', 'PKR', 'EUR', 'GBP', 'AED'];

export default function Projects() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [projects, setProjects] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef();

  const load = async () => {
    const { projects } = await api.get('/projects');
    setProjects(projects);
  };
  useEffect(() => { load(); }, []);

  const onImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { project, stats } = await api.postForm('/import/xlsx', form);
      toast.success(`Imported "${project.name}" — ${stats.expenses} expenses, ${stats.stakeholders} stakeholders`);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (!projects) return <Loading />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <div className="sub">Construction projects you can access</div>
        </div>
        {isAdmin && (
          <div className="flex wrap">
            <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={onImport} />
            <button className="btn" onClick={() => fileRef.current?.click()} disabled={importing}>
              <Icon name="upload" size={16} />{importing ? 'Importing…' : 'Import .xlsx'}
            </button>
            <button className="btn btn-primary" onClick={() => setShowNew(true)}><Icon name="plus" size={16} />New Project</button>
          </div>
        )}
      </div>

      {projects.length > 1 && <PortfolioBand projects={projects} />}

      {projects.length === 0 ? (
        <Empty icon="building" title="No projects yet">
          {isAdmin ? 'Create a project or import an existing spreadsheet to get started.' : 'You have not been assigned to any projects yet. Contact your administrator.'}
        </Empty>
      ) : (
        <div className="kpi-grid">
          {projects.map((p) => (
            <div key={p.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${p.id}`)}>
              <div className="card-pad">
                <div className="flex between" style={{ alignItems: 'flex-start' }}>
                  <h3 style={{ fontSize: 16 }}>{p.name}</h3>
                  {p.status === 'archived' && <Badge color="gray">Archived</Badge>}
                </div>
                {p.description && <div className="soft" style={{ fontSize: 13, margin: '4px 0 10px' }}>{p.description}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                  <Stat label="Total Spend" value={moneyCompact(p.summary.total_spend, p)} />
                  <Stat label="Gross Profit" value={moneyCompact(p.summary.gross_profit, p)}
                    cls={p.summary.gross_profit >= 0 ? 'pos' : 'neg'} />
                  <Stat label="Margin" value={pct(p.summary.net_margin)} />
                  <Stat label="Expenses" value={p.summary.total_expenses} />
                </div>
                <div className="divider" style={{ margin: '14px 0 10px' }} />
                <div className="flex between">
                  <Badge color={accessColor(p.access_level)}>{accessLabel(p.access_level)}</Badge>
                  <span className="muted flex" style={{ fontSize: 12, gap: 5 }}>{p.summary.stakeholders} stakeholders <Icon name="arrow-right" size={14} /></span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreated={(p) => { setShowNew(false); load(); navigate(`/projects/${p.id}`); }} />}
    </>
  );
}

function PortfolioBand({ projects }) {
  // Aggregate across projects. Currencies may differ; group totals by currency.
  const byCur = {};
  let expenses = 0;
  for (const p of projects) {
    const c = p.currency || 'INR';
    byCur[c] = byCur[c] || { spend: 0, profit: 0, sale: 0, locale: p.locale };
    byCur[c].spend += p.summary.total_spend;
    byCur[c].profit += p.summary.gross_profit;
    byCur[c].sale += p.sale_price || 0;
    expenses += p.summary.total_expenses;
  }
  const curs = Object.entries(byCur);
  const main = curs[0];
  return (
    <div className="card card-pad" style={{ marginBottom: 4 }}>
      <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginBottom: 12 }}>Portfolio Overview</div>
      <div className="kpi-grid">
        <div className="kpi"><div className="label">Projects</div><div className="value">{projects.length}</div></div>
        <div className="kpi"><div className="label">Total Expenses</div><div className="value">{expenses}</div></div>
        <div className="kpi"><div className="label">Total Spend</div><div className="value">{moneyCompact(main[1].spend, { currency: main[0], locale: main[1].locale })}</div>{curs.length > 1 && <div className="sub">+ other currencies</div>}</div>
        <div className="kpi"><div className="label">Combined Gross Profit</div><div className="value" style={{ color: main[1].profit >= 0 ? 'var(--green)' : 'var(--red)' }}>{moneyCompact(main[1].profit, { currency: main[0], locale: main[1].locale })}</div></div>
      </div>
    </div>
  );
}

const Stat = ({ label, value, cls }) => (
  <div>
    <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 600 }}>{label}</div>
    <div className={cls} style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>
);

const accessLabel = (l) => ({ manager: 'Manager', collaborator: 'Collaborator', viewer: 'Viewer' }[l] || l);
const accessColor = (l) => ({ manager: 'amber', collaborator: 'blue', viewer: 'gray' }[l] || 'gray');

function NewProjectModal({ onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', description: '', sale_price: '', currency: 'INR' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    if (!form.name.trim()) return toast.error('Project name is required');
    setBusy(true);
    try {
      const { project } = await api.post('/projects', {
        ...form, sale_price: Number(form.sale_price) || 0,
        locale: form.currency === 'INR' ? 'en-IN' : 'en-US',
      });
      toast.success('Project created');
      onCreated(project);
    } catch (e) { toast.error(e.message); setBusy(false); }
  };

  return (
    <Modal title="New Project" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
      </>}>
      <Field label="Project name"><input className="input" autoFocus value={form.name} onChange={set('name')} placeholder="e.g. Riverside Towers — Block A" /></Field>
      <Field label="Description (optional)"><input className="input" value={form.description} onChange={set('description')} /></Field>
      <div className="row">
        <Field label="Sale / Contract price"><input className="input" type="number" value={form.sale_price} onChange={set('sale_price')} placeholder="0" /></Field>
        <Field label="Currency">
          <select className="input" value={form.currency} onChange={set('currency')}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
