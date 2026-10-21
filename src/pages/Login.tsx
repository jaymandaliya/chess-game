import { useState, type FormEvent } from 'react';
import { LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth';
import { ErrorBanner } from '../components';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-hero">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark" aria-hidden>
            ♞
          </span>
          Chess Admin
        </div>
        <div>
          <h1>Run your chess platform from one place.</h1>
          <p>Players, tournaments, coin sales, payouts and every audit trail — live from the same data your players see.</p>
        </div>
        <p className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ShieldCheck size={16} /> Every admin action is recorded in the audit log.
        </p>
      </section>
      <section className="login-side">
        <form className="login-card" onSubmit={submit}>
          <div>
            <h1>Sign in</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              Use an admin or super admin account.
            </p>
          </div>
          <ErrorBanner message={error} />
          <label>
            Email
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@company.com" required />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            <LogIn size={16} />
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </div>
  );
}
