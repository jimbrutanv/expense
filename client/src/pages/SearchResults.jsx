import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Loading, Empty, Badge } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const TYPE_ICON = { project: 'folder', expense: 'receipt', income: 'trending', stakeholder: 'users', vendor: 'user', task: 'tasks', file: 'paperclip', contact: 'contacts' };

export default function SearchResults() {
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!q) { setData({ groups: [], total: 0 }); return; }
    setData(null);
    api.get(`/search?q=${encodeURIComponent(q)}&full=1`).then(setData).catch(() => setData({ groups: [], total: 0 }));
  }, [q]);

  if (!data) return <Loading />;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Search</h1>
          <div className="sub">{q ? <>{data.total} result{data.total === 1 ? '' : 's'} for “<b>{q}</b>”</> : 'Type in the search bar above'}</div>
        </div>
      </div>

      {data.total === 0 ? (
        <Empty icon="search" title={q ? `No results for “${q}”` : 'Search across everything'}>
          Try a project, expense ref, vendor, amount, person, file name…
        </Empty>
      ) : data.groups.map((g) => (
        <div key={g.type} className="card">
          <div className="card-head"><h3><Icon name={TYPE_ICON[g.type] || 'file'} size={17} /> {g.label} <Badge color="gray">{g.items.length}</Badge></h3></div>
          <div className="card-pad stack" style={{ gap: 0 }}>
            {g.items.map((it) => (
              <div key={`${g.type}-${it.id}`} className="sr-item" onClick={() => navigate(it.to)}>
                <div style={{ minWidth: 0 }}>
                  <div className="sr-title">{it.title}</div>
                  {it.sub && <div className="muted" style={{ fontSize: 12.5 }}>{it.sub}</div>}
                </div>
                <Icon name="chevron-right" size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
