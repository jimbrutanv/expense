import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Field } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setErr(e.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <div className="card" style={{ width: '100%', maxWidth: 400, overflow: 'hidden' }}>
        <div style={{ background: 'var(--sidebar)', color: '#fff', padding: '28px 30px' }}>
          <Icon name="building" size={30} style={{ color: 'var(--brand)' }} />
          <h1 style={{ fontSize: 22, marginTop: 12, fontWeight: 600 }}>BuildLedger</h1>
          <div style={{ color: '#a1a1a6', fontSize: 13.5, marginTop: 4 }}>
            Construction Expense &amp; Profit Management
          </div>
        </div>
        <form className="card-pad" onSubmit={submit} style={{ padding: 24 }}>
          {err && <div className="inline-err" style={{ marginBottom: 14 }}>{err}</div>}
          <Field label="Email">
            <input className="input" type="email" autoFocus value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </Field>
          <Field label="Password">
            <input className="input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 6 }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
