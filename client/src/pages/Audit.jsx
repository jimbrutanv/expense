import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Loading, Badge } from '../components/ui.jsx';
import { fmtDateTime } from '../format.js';

const ACTION_COLOR = (a) =>
  a.startsWith('delete') || a.includes('restore') ? 'red'
    : a.startsWith('create') || a.includes('import') || a.includes('backup') ? 'green'
      : a.startsWith('update') || a.includes('member') ? 'blue' : 'gray';

export default function Audit() {
  const [entries, setEntries] = useState(null);
  useEffect(() => { api.get('/audit?limit=300').then((d) => setEntries(d.entries)); }, []);
  if (!entries) return <Loading />;

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Activity Log</h1><div className="sub">Most recent 300 actions across the system</div></div></div>
      <div className="card table-wrap">
        <table className="tbl">
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="muted">{fmtDateTime(e.created_at)}</td>
                <td>{e.user_email || <span className="muted">system</span>}</td>
                <td><Badge color={ACTION_COLOR(e.action)}>{e.action.replace(/_/g, ' ')}</Badge></td>
                <td className="muted">{e.entity}{e.entity_id ? ` #${e.entity_id}` : ''}</td>
                <td className="muted" style={{ fontSize: 12, maxWidth: 320, whiteSpace: 'normal' }}>
                  {e.details ? (typeof e.details === 'object' ? JSON.stringify(e.details) : String(e.details)) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
