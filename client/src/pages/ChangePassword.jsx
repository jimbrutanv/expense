import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Field, useToast } from '../components/ui.jsx';

export default function ChangePassword({ forced }) {
  const { user, refresh, logout } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (pw.length < 8) return setErr('Password must be at least 8 characters');
    if (pw !== pw2) return setErr('Passwords do not match');
    setBusy(true);
    try {
      await api.post('/auth/change-password', { current_password: cur, new_password: pw });
      toast.success('Password updated');
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const Wrap = ({ children }) => forced
    ? <div className="center-screen">{children}</div>
    : <div className="content" style={{ maxWidth: 480 }}>{children}</div>;

  return (
    <Wrap>
      <div className="card" style={{ width: '100%', maxWidth: 440 }}>
        <div className="card-head"><h3>{forced ? 'Set a new password' : 'Change password'}</h3></div>
        <form className="card-pad" onSubmit={submit}>
          {forced && <div className="notice" style={{ marginBottom: 14 }}>
            Welcome, {user.name}. For security, please choose a new password before continuing.
          </div>}
          {err && <div className="inline-err" style={{ marginBottom: 14 }}>{err}</div>}
          {!forced && (
            <Field label="Current password">
              <input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} required />
            </Field>
          )}
          <Field label="New password" hint="At least 8 characters">
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required />
          </Field>
          <Field label="Confirm new password">
            <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
          </Field>
          <div className="flex between" style={{ marginTop: 8 }}>
            {forced
              ? <button type="button" className="btn btn-ghost" onClick={logout}>Sign out</button>
              : <span />}
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
          </div>
        </form>
      </div>
    </Wrap>
  );
}
