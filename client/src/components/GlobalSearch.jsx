import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Icon } from './Icon.jsx';

const TYPE_ICON = { project: 'folder', expense: 'receipt', income: 'trending', stakeholder: 'users', vendor: 'user', task: 'tasks', file: 'paperclip', contact: 'contacts' };

export default function GlobalSearch() {
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState([]);
  const [open, setOpen] = useState(false);       // desktop dropdown
  const [sheet, setSheet] = useState(false);      // mobile full-screen overlay
  const [loading, setLoading] = useState(false);
  const boxRef = useRef();
  const inputRef = useRef();
  const sheetInputRef = useRef();
  const navigate = useNavigate();

  const run = useCallback(async (term) => {
    if (term.trim().length < 1) { setGroups([]); return; }
    setLoading(true);
    try { setGroups((await api.get(`/search?q=${encodeURIComponent(term)}`)).groups); }
    catch { setGroups([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { const t = setTimeout(() => run(q), 200); return () => clearTimeout(t); }, [q, run]);

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); (window.innerWidth <= 640 ? openSheet : focusDesktop)(); }
      if (e.key === 'Escape') { setOpen(false); setSheet(false); }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, []);

  const focusDesktop = () => { inputRef.current?.focus(); setOpen(true); };
  const openSheet = () => { setSheet(true); setTimeout(() => sheetInputRef.current?.focus(), 50); };
  const closeAll = () => { setOpen(false); setSheet(false); };
  const reset = () => { setQ(''); setGroups([]); };
  const go = (to) => { closeAll(); reset(); navigate(to); };
  const seeAll = () => { if (q.trim()) { const term = q; closeAll(); navigate(`/search?q=${encodeURIComponent(term)}`); } };
  const total = groups.reduce((a, g) => a + g.items.length, 0);

  const Results = ({ onItem }) => (
    loading && total === 0 ? <div className="gs-empty">Searching…</div>
      : total === 0 ? <div className="gs-empty">No results for “{q}”.</div>
      : <>
        {groups.map((g) => (
          <div key={g.type} className="gs-group">
            <div className="gs-group-label">{g.label}</div>
            {g.items.map((it) => (
              <div key={`${g.type}-${it.id}`} className="gs-item" onClick={() => onItem(it.to)}>
                <Icon name={TYPE_ICON[g.type] || 'file'} size={16} />
                <div className="gs-item-text">
                  <div className="gs-item-title">{it.title}</div>
                  {it.sub && <div className="gs-item-sub">{it.sub}</div>}
                </div>
              </div>
            ))}
          </div>
        ))}
        <div className="gs-footer" onClick={seeAll}>View all results for “{q}” →</div>
      </>
  );

  return (
    <>
      {/* desktop inline bar */}
      <div className="global-search inline" ref={boxRef}>
        <Icon name="search" size={16} />
        <input ref={inputRef} className="gs-input" placeholder="Search everything…  (⌘K)" value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') seeAll(); }} />
        {q && <button className="gs-clear" onClick={() => { reset(); inputRef.current?.focus(); }} aria-label="Clear"><Icon name="x" size={14} /></button>}
        {open && q.trim().length >= 1 && <div className="search-results"><Results onItem={go} /></div>}
      </div>

      {/* mobile trigger */}
      <button className="gs-trigger btn btn-icon btn-ghost" onClick={openSheet} aria-label="Search"><Icon name="search" size={20} /></button>

      {/* mobile full-screen overlay — portalled to body so it escapes the
          topbar's backdrop-filter containing block and covers the screen */}
      {sheet && createPortal(
        <div className="gs-sheet">
          <div className="gs-sheet-bar">
            <Icon name="search" size={18} />
            <input ref={sheetInputRef} className="gs-input" placeholder="Search everything…" value={q}
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') seeAll(); }} />
            <button className="btn btn-sm" onClick={() => { reset(); closeAll(); }}>Cancel</button>
          </div>
          <div className="gs-sheet-body">
            {q.trim().length < 1 ? <div className="gs-empty">Search projects, expenses, payments, people, files…</div> : <Results onItem={go} />}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
