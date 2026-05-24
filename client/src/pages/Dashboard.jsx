import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts';
import { api } from '../api.js';
import { Loading, Empty, Badge, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { money, moneyCompact, pct, num } from '../format.js';

const PIE = ['#0071e3', '#1a7f37', '#5e5ce6', '#ff9f0a', '#bf5af2', '#30b0c7', '#ff375f', '#34c759', '#a2845e', '#64d2ff', '#8e8e93'];

export default function Dashboard() {
  const { projectId } = useParams();
  const toast = useToast();
  const [d, setD] = useState(null);

  useEffect(() => {
    setD(null);
    api.get(`/projects/${projectId}/dashboard`).then(setD).catch((e) => toast.error(e.message));
  }, [projectId]);

  if (!d) return <Loading />;
  const cur = { currency: d.project.currency, locale: d.project.locale };
  const m = (v) => money(v, cur);
  const mc = (v) => moneyCompact(v, cur);
  const s = d.snapshot;

  return (
    <div className="stack">
      <div className="flex between wrap">
        <h2 className="sec-head"><Icon name="bar-chart" size={18} /> Project Snapshot</h2>
        <div className="flex wrap">
          <button className="btn btn-sm" onClick={() => api.download(`/projects/${projectId}/export/project.xlsx`)}><Icon name="table" size={15} />Excel (.xlsx)</button>
          <button className="btn btn-sm" onClick={() => api.download(`/projects/${projectId}/export/dashboard.csv`)}><Icon name="download" size={15} />Dashboard CSV</button>
          <button className="btn btn-sm" onClick={() => api.download(`/projects/${projectId}/export/project.json`)}><Icon name="download" size={15} />JSON</button>
        </div>
      </div>

      {(!s.split_pct_valid || s.split_mismatches > 0) && (
        <div className="notice warn">
          <Icon name="alert" size={16} />
          <div>
            {!s.split_pct_valid && <div>Stakeholder split is {pct(s.split_pct_total)} — it should total exactly 100%.</div>}
            {s.split_mismatches > 0 && <div>{s.split_mismatches} expense(s) are not fully allocated across stakeholders ({m(s.unallocated)} unallocated).</div>}
          </div>
        </div>
      )}

      <div className="kpi-grid">
        <Kpi label="Total Project Spend" value={mc(s.total_spend)} sub={`${s.total_expenses} expenses logged`} />
        <Kpi label="Sale / Contract Price" value={mc(s.sale_price)} accent="blue" />
        <Kpi label="Gross Profit" value={mc(s.gross_profit)} accent={s.gross_profit >= 0 ? 'green' : 'red'} sub={`${pct(s.net_margin)} margin`} />
        <Kpi label="Net Profit Margin" value={pct(s.net_margin)} accent={s.net_margin >= 0 ? 'green' : 'red'} />
        <Kpi label="Avg Expense / Entry" value={mc(s.avg_expense)} />
        <Kpi label="Split Validation" value={s.split_pct_valid ? '100%' : pct(s.split_pct_total)} accent={s.split_pct_valid ? 'green' : 'red'} />
      </div>

      {(s.total_received > 0 || s.total_incomes > 0) && (
        <>
          <h2 className="sec-head"><Icon name="trending" size={18} /> Cash Position</h2>
          <div className="kpi-grid">
            <Kpi label="Total Received" value={mc(s.total_received)} accent="green" sub={`${s.total_incomes} payments · ${pct(s.collection_pct)} of contract`} />
            <Kpi label="Net Cash Position" value={mc(s.cash_position)} accent={s.cash_position >= 0 ? 'green' : 'red'} sub="received − spent" />
            <Kpi label="Outstanding to Collect" value={mc(s.outstanding)} accent={s.outstanding > 0 ? 'red' : 'green'} />
            <Kpi label="Total Spent" value={mc(s.total_spend)} />
          </div>
        </>
      )}

      {d.budgets.length > 0 && (
        <div className="card">
          <div className="card-head"><h3><Icon name="pie-chart" size={17} /> Budget vs Actual</h3>{d.budgets.some((b) => b.over) && <Badge color="red">over budget</Badge>}</div>
          <div className="card-pad stack" style={{ gap: 12 }}>
            {d.budgets.map((b) => (
              <div key={b.category}>
                <div className="flex between" style={{ fontSize: 13, marginBottom: 5 }}>
                  <span>{b.category}</span>
                  <span className={b.over ? 'neg' : 'muted'}>{m(b.actual)} / {m(b.budget)}</span>
                </div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(b.used_pct * 100, 100)}%`, background: b.over ? 'var(--red)' : 'var(--brand)' }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3><Icon name="pie-chart" size={17} /> Spend by Category</h3></div>
          <div className="card-pad">
            {d.by_category.length === 0 ? <Empty title="No spend yet" /> : (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={d.by_category} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={90} innerRadius={50}>
                      {d.by_category.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => m(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="stack" style={{ gap: 8, marginTop: 6 }}>
                  {d.by_category.slice(0, 6).map((c, i) => (
                    <div key={c.category} className="flex between" style={{ fontSize: 13 }}>
                      <span className="flex" style={{ gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: PIE[i % PIE.length] }} />
                        {c.category}
                      </span>
                      <span><b>{m(c.total)}</b> <span className="muted">· {pct(c.share)} · {c.count}</span></span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="trending" size={17} /> Spend Over Time</h3></div>
          <div className="card-pad">
            {d.by_month.length === 0 ? <Empty title="No data" /> : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={d.by_month} margin={{ left: 4, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0071e3" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#0071e3" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e8ed" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#86868b" />
                  <YAxis tickFormatter={(v) => mc(v)} tick={{ fontSize: 11 }} width={64} stroke="#86868b" />
                  <Tooltip formatter={(v) => m(v)} />
                  <Area type="monotone" dataKey="total" stroke="#0071e3" strokeWidth={2} fill="url(#g1)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3><Icon name="users" size={17} /> Stakeholder Contributions &amp; Profit</h3></div>
        <div className="card-pad">
          {d.stakeholders.length === 0 ? <Empty title="No stakeholders configured" /> : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={d.stakeholders} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e8ed" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#86868b" />
                  <YAxis tickFormatter={(v) => mc(v)} tick={{ fontSize: 11 }} width={64} stroke="#86868b" />
                  <Tooltip formatter={(v) => m(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="contributed" name="Contributed" fill="#0071e3" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="profit_share" name="Profit Share" fill="#1a7f37" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table className="tbl">
                  <thead><tr>
                    <th>Stakeholder</th><th className="num">Split</th><th className="num">Contributed</th>
                    <th className="num">Profit Share</th><th className="num">Settlement</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {d.stakeholders.map((st) => (
                      <tr key={st.id}>
                        <td><b>{st.name}</b>{st.role && <div className="muted" style={{ fontSize: 12 }}>{st.role}</div>}</td>
                        <td className="num">{pct(st.split_pct)}</td>
                        <td className="num">{m(st.contributed)}</td>
                        <td className="num pos">{m(st.profit_share)}</td>
                        <td className="num">{m(st.settlement)}</td>
                        <td><Badge color={st.status === 'Profit Due' ? 'green' : 'gray'}>{st.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className={`kpi ${accent || ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
