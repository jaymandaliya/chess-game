import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useApi } from '../hooks';
import { ErrorBanner } from '../components';

interface PlatformSettings {
  maintenanceMode: boolean;
  registrationOpen: boolean;
  defaultRating: number;
  supportEmail: string;
  minAppVersion: string;
}

export default function Settings() {
  const { isSuperAdmin } = useAuth();
  const { data, error, setData } = useApi<PlatformSettings>('/admin/settings');
  const [form, setForm] = useState<PlatformSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (!form) return <div className="page"><ErrorBanner message={error} />{!error ? <span className="muted">Loading…</span> : null}</div>;

  const changed = data ? (Object.keys(form) as (keyof PlatformSettings)[]).filter((k) => form[k] !== data[k]) : [];

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form || !changed.length) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const patch = Object.fromEntries(changed.map((k) => [k, form[k]]));
      setData(await api<PlatformSettings>('/admin/settings', { method: 'PATCH', body: patch }));
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const readOnly = !isSuperAdmin;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Platform settings</h1>
      </header>
      {readOnly ? <p className="notice">Only a super admin can change settings. You can view them.</p> : null}
      <form className="card form narrow" onSubmit={save}>
        <ErrorBanner message={saveError} />
        {saved ? <div className="success-banner">Settings saved and recorded in the audit log.</div> : null}

        <label className="check">
          <input type="checkbox" disabled={readOnly} checked={form.maintenanceMode} onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })} />
          <span>
            <strong>Maintenance mode</strong>
            <span className="muted small">Players cannot use the app or start games. Admin portal stays available.</span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" disabled={readOnly} checked={form.registrationOpen} onChange={(e) => setForm({ ...form, registrationOpen: e.target.checked })} />
          <span>
            <strong>Registration open</strong>
            <span className="muted small">New players can create accounts.</span>
          </span>
        </label>
        <div className="form-row">
          <label>
            Starting rating for new players
            <input type="number" min={100} max={3000} disabled={readOnly} value={form.defaultRating} onChange={(e) => setForm({ ...form, defaultRating: Number(e.target.value) })} />
          </label>
          <label>
            Minimum app version
            <input disabled={readOnly} value={form.minAppVersion} pattern="\d+\.\d+\.\d+" title="e.g. 1.2.0" onChange={(e) => setForm({ ...form, minAppVersion: e.target.value })} />
          </label>
        </div>
        <label>
          Support email
          <input type="email" disabled={readOnly} value={form.supportEmail} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} />
        </label>
        {!readOnly ? (
          <footer className="form-footer">
            <button type="button" disabled={!changed.length} onClick={() => data && setForm(data)}>Reset</button>
            <button type="submit" className="primary" disabled={saving || !changed.length}>
              {saving ? 'Saving…' : `Save${changed.length ? ` (${changed.length})` : ''}`}
            </button>
          </footer>
        ) : null}
      </form>
    </div>
  );
}
