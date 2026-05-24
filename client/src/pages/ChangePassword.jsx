import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Field, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

// Reusable card body — used inside My Account and the forced first-login screen.
export function ChangePasswordCard({ forced }) {
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
      setCur(''); setPw(''); setPw2('');
      await refresh();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <div className="card-head"><h3><Icon name="key" size={17} /> {forced ? 'Set a new password' : 'Password & Security'}</h3></div>
      <form className="card-pad" onSubmit={submit}>
        {forced && <div className="notice" style={{ marginBottom: 14 }}><Icon name="info" size={16} /><span>Welcome, {user.name}. For security, please choose a new password before continuing.</span></div>}
        {err && <div className="inline-err" style={{ marginBottom: 14 }}>{err}</div>}
        {!forced && (
          <Field label="Current password">
            <input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} required autoComplete="current-password" />
          </Field>
        )}
        <div className="row">
          <Field label="New password" hint="At least 8 characters">
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password">
            <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required autoComplete="new-password" />
          </Field>
        </div>
        <div className="flex between" style={{ marginTop: 8 }}>
          {forced ? <button type="button" className="btn btn-ghost" onClick={logout}>Sign out</button> : <span />}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
        </div>
      </form>
    </div>
  );
}

// Forced first-login full-screen wrapper.
export default function ChangePassword() {
  return (
    <div className="center-screen">
      <div style={{ width: '100%', maxWidth: 460 }}><ChangePasswordCard forced /></div>
    </div>
  );
}
