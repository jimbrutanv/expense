import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Icon } from './Icon.jsx';

/* ── Toasts ──────────────────────────────────────────── */
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const remove = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((message, type = 'default', opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type, action: opts.action, actionLabel: opts.actionLabel }]);
    setTimeout(() => remove(id), opts.action ? 7000 : 4200);
    return id;
  }, [remove]);
  const toast = {
    show: push,
    success: (m, opts) => push(m, 'success', opts),
    error: (m) => push(m, 'error'),
    // an "Undo"-style toast with an action button
    action: (m, label, fn) => push(m, 'default', { action: fn, actionLabel: label }),
  };
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <Icon name={t.type === 'success' ? 'check-circle' : t.type === 'error' ? 'alert' : 'info'} size={17} />
            <span style={{ flex: 1 }}>{t.message}</span>
            {t.action
              ? <button className="toast-action" onClick={() => { t.action(); remove(t.id); }}>{t.actionLabel || 'Undo'}</button>
              : <button className="toast-x" onClick={() => remove(t.id)} aria-label="Dismiss"><Icon name="x" size={14} /></button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ── Modal ───────────────────────────────────────────── */
export function Modal({ title, children, onClose, footer, size }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${size === 'lg' ? 'lg' : ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="x-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose, busy }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
          {busy ? '…' : confirmLabel}
        </button>
      </>}
    >
      <p style={{ margin: 0, color: 'var(--text-soft)' }}>{message}</p>
    </Modal>
  );
}

/* ── Bits ────────────────────────────────────────────── */
export const Spinner = () => <span className="spinner" />;
export const Loading = ({ label = 'Loading…' }) => (
  <div className="loading-screen"><Spinner /><div>{label}</div></div>
);
export const Empty = ({ icon = 'folder', title, children }) => (
  <div className="empty"><Icon name={icon} size={42} strokeWidth={1.4} /><h3>{title}</h3><div>{children}</div></div>
);

export function Field({ label, hint, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Badge({ children, color }) {
  return <span className={`badge ${color || ''}`}>{children}</span>;
}
