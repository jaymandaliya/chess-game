import { useState, type FormEvent } from 'react';
import { changePassword } from '../api';
import { useAuth } from '../auth';
import { DetailList, ErrorBanner } from '../components';

export default function Account() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) return setError('The new passwords do not match');
    setBusy(true);
    try {
      await changePassword(current, next);
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>My account</h1>
      </header>
      <section className="card narrow">
        <DetailList items={[['Name', user?.displayName], ['Email', user?.email], ['Role', user?.role.replace('_', ' ')]]} />
      </section>
      <form className="card form narrow" onSubmit={submit}>
        <h2>Change password</h2>
        <ErrorBanner message={error} />
        {done ? <div className="success-banner">Password changed. Other devices have been signed out.</div> : null}
        <label>
          Current password
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label>
          New password
          <input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
          <span className="muted small">At least 8 characters, with a letter and a number.</span>
        </label>
        <label>
          Confirm new password
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        <footer className="form-footer">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </footer>
      </form>
    </div>
  );
}
