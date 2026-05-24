import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Icon } from './Icon.jsx';

const TYPE_ICON = { project: 'folder', expense: 'receipt', income: 'trending', stakeholder: 'users', vendor: 'user', task: 'tasks' };

export default function GlobalSearch() {
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef();
  const navigate = useNavigate();

  const run = useCallback(async (term) => {
    if (term.trim().length < 2) { setGroups([]); return; }
    setLoading(true);
    try {
      const { groups } = await api.get(`/search?q=${encodeURIComponent(term)}`);
      setGroups(groups);
    } catch { setGroups([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { const t = setTimeout(() => run(q), 250); return () => clearTimeout(t); }, [q, run]);

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, []);

  const go = (to) => { setOpen(false); setQ(''); setGroups([]); navigate(to); };
  const total = groups.reduce((a, g) => a + g.items.length, 0);

  return (
    <div className="global-search" ref={boxRef}>
      <Icon name="search" size={16} />
      <input
        className="gs-input"
        placeholder="Search everything…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {q && <button className="gs-clear" onClick={() => { setQ(''); setGroups([]); }} aria-label="Clear"><Icon name="x" size={14} /></button>}
      {open && q.trim().length >= 2 && (
        <div className="search-results">
          {loading && total === 0 ? <div className="gs-empty">Searching…</div>
            : total === 0 ? <div className="gs-empty">No results for “{q}”.</div>
            : groups.map((g) => (
              <div key={g.type} className="gs-group">
                <div className="gs-group-label">{g.label}</div>
                {g.items.map((it) => (
                  <div key={`${g.type}-${it.id}`} className="gs-item" onClick={() => go(it.to)}>
                    <Icon name={TYPE_ICON[g.type] || 'file'} size={15} />
                    <div className="gs-item-text">
                      <div className="gs-item-title">{it.title}</div>
                      {it.sub && <div className="gs-item-sub">{it.sub}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
