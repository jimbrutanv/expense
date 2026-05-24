import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { api } from '../api.js';
import { useProject } from './ProjectLayout.jsx';
import { Loading, Badge } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { money, moneyCompact, pct } from '../format.js';

export default function Reports() {
  const { projectId } = useParams();
  const { project } = useProject();
  const [d, setD] = useState(null);
  const cur = { currency: project.currency, locale: project.locale };
  const m = (v) => money(v, cur);
  const mc = (v) => moneyCompact(v, cur);

  useEffect(() => { setD(null); api.get(`/projects/${projectId}/dashboard`).then(setD); }, [projectId]);
  if (!d) return <Loading />;
  const s = d.snapshot;

  return (
    <div className="stack report">
      <div className="flex between wrap no-print">
        <h2 className="sec-head"><Icon name="file" size={18} /> Reports</h2>
        <div className="flex wrap">
          <button className="btn btn-sm" onClick={() => api.download(`/projects/${projectId}/export/project.xlsx`)}><Icon name="table" size={15} />Excel</button>
          <button className="btn btn-sm" onClick={() => window.print()}><Icon name="file" size={15} />Print / PDF</button>
        </div>
      </div>

      <div className="report-head">
        <h1 style={{ fontSize: 22 }}>{project.name}</h1>
        <div className="muted">Financial Report · generated {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} · {project.currency}</div>
      </div>

      {/* Profit & Loss */}
      <div className="card">
        <div className="card-head"><h3><Icon name="scale" size={17} /> Profit &amp; Loss</h3></div>
        <div className="card-pad">
          <table className="tbl statement">
            <tbody>
              <Line label="Sale / Contract Price" value={m(s.sale_price)} />
              <Line label="Total Project Cost (expenses)" value={`(${m(s.total_spend)})`} neg />
              <Line label="Gross Profit" value={m(s.gross_profit)} strong cls={s.gross_profit >= 0 ? 'pos' : 'neg'} />
              <Line label="Net Profit Margin" value={pct(s.net_margin)} />
            </tbody>
          </table>
        </div>
      </div>

      {/* Cash position */}
      <div className="card">
        <div className="card-head"><h3><Icon name="trending" size={17} /> Cash Position</h3></div>
        <div className="card-pad">
          <table className="tbl statement">
            <tbody>
              <Line label="Total Received (payments in)" value={m(s.total_received)} cls="pos" />
              <Line label="Total Spent (expenses out)" value={`(${m(s.total_spend)})`} neg />
              <Line label="Net Cash Position" value={m(s.cash_position)} strong cls={s.cash_position >= 0 ? 'pos' : 'neg'} />
              <Line label={`Outstanding to collect (of ${mc(s.sale_price)})`} value={m(s.outstanding)} />
              <Line label="Collection Progress" value={pct(s.collection_pct)} />
            </tbody>
          </table>
        </div>
      </div>

      {/* Cash flow chart */}
      {d.by_month.length > 0 && (
        <div className="card">
          <div className="card-head"><h3><Icon name="bar-chart" size={17} /> Cash Flow — Income vs Expense</h3></div>
          <div className="card-pad">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={d.by_month} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e8ed" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#86868b" />
                <YAxis tickFormatter={(v) => mc(v)} tick={{ fontSize: 11 }} width={64} stroke="#86868b" />
                <Tooltip formatter={(v) => m(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Income" fill="#1a7f37" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total" name="Expense" fill="#c4002b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Budget vs actual */}
      {d.budgets.length > 0 && (
        <div className="card">
          <div className="card-head"><h3><Icon name="pie-chart" size={17} /> Budget vs Actual</h3></div>
          <div className="table-wrap">
            <table className="tbl cards">
              <thead><tr><th>Category</th><th className="num">Budget</th><th className="num">Actual</th><th className="num">Remaining</th><th>Used</th></tr></thead>
              <tbody>
                {d.budgets.map((b) => (
                  <tr key={b.category}>
                    <td data-label="Category"><b>{b.category}</b></td>
                    <td data-label="Budget" className="num">{m(b.budget)}</td>
                    <td data-label="Actual" className="num">{m(b.actual)}</td>
                    <td data-label="Remaining" className={`num ${b.remaining < 0 ? 'neg' : ''}`}>{m(b.remaining)}</td>
                    <td data-label="Used">
                      <div className="flex" style={{ gap: 8 }}>
                        <div className="bar-track" style={{ flex: 1, minWidth: 60 }}><div className="bar-fill" style={{ width: `${Math.min(b.used_pct * 100, 100)}%`, background: b.over ? 'var(--red)' : 'var(--brand)' }} /></div>
                        <span style={{ fontSize: 12 }} className={b.over ? 'neg' : 'muted'}>{pct(b.used_pct, 0)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Spend by category */}
      <div className="card">
        <div className="card-head"><h3><Icon name="pie-chart" size={17} /> Spend by Category</h3></div>
        <div className="table-wrap">
          <table className="tbl cards">
            <thead><tr><th>Category</th><th className="num">Total</th><th className="num">% of Spend</th><th className="num"># Entries</th></tr></thead>
            <tbody>
              {d.by_category.map((c) => (
                <tr key={c.category}>
                  <td data-label="Category">{c.category}</td>
                  <td data-label="Total" className="num">{m(c.total)}</td>
                  <td data-label="% of Spend" className="num">{pct(c.share)}</td>
                  <td data-label="# Entries" className="num">{c.count}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}><td>Total</td><td className="num">{m(s.total_spend)}</td><td className="num">100%</td><td className="num">{s.total_expenses}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Stakeholder statement */}
      {d.stakeholders.length > 0 && (
        <div className="card">
          <div className="card-head"><h3><Icon name="users" size={17} /> Stakeholder Statement</h3></div>
          <div className="table-wrap">
            <table className="tbl cards">
              <thead><tr><th>Stakeholder</th><th className="num">Split</th><th className="num">Contributed</th><th className="num">Share of Cost</th><th className="num">Profit Share</th><th>Settlement</th></tr></thead>
              <tbody>
                {d.stakeholders.map((st) => (
                  <tr key={st.id}>
                    <td data-label="Stakeholder"><b>{st.name}</b></td>
                    <td data-label="Split" className="num">{pct(st.split_pct)}</td>
                    <td data-label="Contributed" className="num">{m(st.contributed)}</td>
                    <td data-label="Share of Cost" className="num">{m(st.share_of_cost)}</td>
                    <td data-label="Profit Share" className="num pos">{m(st.profit_share)}</td>
                    <td data-label="Settlement">{st.to_settle.action === 'even' ? <Badge color="green">Settled</Badge> : st.to_settle.action === 'receive' ? <Badge color="green">Receive {m(st.to_settle.amount)}</Badge> : <Badge color="red">Pay {m(st.to_settle.amount)}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Line({ label, value, strong, neg, cls }) {
  return (
    <tr className={strong ? 'statement-strong' : ''}>
      <td>{label}</td>
      <td className={`num ${cls || ''}`}>{value}</td>
    </tr>
  );
}
