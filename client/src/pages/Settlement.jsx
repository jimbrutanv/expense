import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useProject } from './ProjectLayout.jsx';
import { Loading, Empty, Badge } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { money, pct } from '../format.js';

export default function Settlement() {
  const { projectId } = useParams();
  const { project } = useProject();
  const [d, setD] = useState(null);
  const cur = { currency: project.currency, locale: project.locale };
  const m = (v) => money(v, cur);

  useEffect(() => { setD(null); api.get(`/projects/${projectId}/dashboard`).then(setD); }, [projectId]);
  if (!d) return <Loading />;
  if (d.stakeholders.length === 0) return <div className="card"><Empty icon="scale" title="No stakeholders to settle" /></div>;

  const toReceive = d.stakeholders.filter((s) => s.to_settle.action === 'receive');
  const toPay = d.stakeholders.filter((s) => s.to_settle.action === 'pay');

  return (
    <div className="stack">
      <h2 className="sec-head"><Icon name="scale" size={18} /> Expense Settlement</h2>
      <div className="notice">
        <Icon name="info" size={16} />
        <span>Each stakeholder should bear <b>their split %</b> of the total cost ({m(d.snapshot.total_spend)}).
        Those who paid more than their share <b>receive</b> the difference; those who paid less <b>pay</b> in.
        This nets to zero across the project.</span>
      </div>

      <div className="card table-wrap">
        <table className="tbl">
          <thead><tr>
            <th>Stakeholder</th><th className="num">Split %</th><th className="num">Expenses Paid</th>
            <th className="num">Share of Cost</th><th className="num">Over / Under-Paid</th><th>Settlement Action</th>
          </tr></thead>
          <tbody>
            {d.stakeholders.map((s) => (
              <tr key={s.id}>
                <td><b>{s.name}</b></td>
                <td className="num">{pct(s.split_pct)}</td>
                <td className="num">{m(s.contributed)}</td>
                <td className="num">{m(s.share_of_cost)}</td>
                <td className={`num ${s.over_under > 0 ? 'pos' : s.over_under < 0 ? 'neg' : ''}`}>
                  {s.over_under > 0 ? '+' : ''}{m(s.over_under)}
                </td>
                <td>
                  {s.to_settle.action === 'even' ? <Badge color="green"><Icon name="check" size={13} /> Settled</Badge>
                    : s.to_settle.action === 'receive'
                      ? <Badge color="green">Receive {m(s.to_settle.amount)}</Badge>
                      : <Badge color="red">Pay {m(s.to_settle.amount)}</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3><Icon name="arrow-right" size={16} /> Who Pays In</h3></div>
          <div className="card-pad stack" style={{ gap: 10 }}>
            {toPay.length === 0 ? <span className="muted">Nobody owes — fully settled.</span>
              : toPay.map((s) => <div key={s.id} className="flex between"><span>{s.name}</span><b className="neg">{m(s.to_settle.amount)}</b></div>)}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3><Icon name="check-circle" size={16} /> Who Receives</h3></div>
          <div className="card-pad stack" style={{ gap: 10 }}>
            {toReceive.length === 0 ? <span className="muted">Nobody is owed — fully settled.</span>
              : toReceive.map((s) => <div key={s.id} className="flex between"><span>{s.name}</span><b className="pos">{m(s.to_settle.amount)}</b></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
