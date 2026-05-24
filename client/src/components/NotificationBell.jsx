import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Icon } from './Icon.jsx';

const SEV_COLOR = { danger: 'var(--red)', warn: 'var(--amber)', info: 'var(--brand)' };

export default function NotificationBell() {
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try { setAlerts((await api.get('/notifications')).alerts); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    load();
    const iv = setInterval(load, 120000); // refresh every 2 min
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const danger = alerts.filter((a) => a.severity === 'danger').length;
  const go = (to) => { setOpen(false); navigate(to); };

  return (
    <div className="notif" ref={boxRef}>
      <button className="btn btn-icon btn-ghost" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <Icon name="bell" size={19} />
        {alerts.length > 0 && <span className={`notif-badge ${danger ? 'danger' : ''}`}>{alerts.length > 9 ? '9+' : alerts.length}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">Notifications {alerts.length > 0 && <span className="muted">· {alerts.length}</span>}</div>
          {alerts.length === 0 ? (
            <div className="gs-empty"><Icon name="check-circle" size={20} style={{ color: 'var(--green)' }} /><div style={{ marginTop: 6 }}>All clear — nothing needs attention.</div></div>
          ) : alerts.map((a, i) => (
            <div key={i} className="notif-item" onClick={() => go(a.to)}>
              <Icon name={a.icon || 'info'} size={16} style={{ color: SEV_COLOR[a.severity], flexShrink: 0, marginTop: 1 }} />
              <div style={{ minWidth: 0 }}>
                <div className="notif-title">{a.title}</div>
                {a.sub && <div className="muted" style={{ fontSize: 11.5 }}>{a.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
