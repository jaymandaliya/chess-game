import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Save, Settings as SettingsIcon } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useApi } from '../hooks';
import { ErrorBanner } from '../components';
import { paiseToRupeesInput, rupees, rupeesToPaise } from '../format';

interface PlatformSettings {
  maintenanceMode: boolean;
  registrationOpen: boolean;
  defaultRating: number;
  supportEmail: string;
  minAppVersion: string;
  winningsFeePercent: number;
  stakeOptions: number[];
  withdrawalsEnabled: boolean;
  coinValuePaise: number;
  minWithdrawalCoins: number;
  withdrawalTdsPercent: number;
}

type Form = Omit<PlatformSettings, 'stakeOptions' | 'coinValuePaise'> & { stakeOptions: string; coinValue: string };

const toForm = (s: PlatformSettings): Form => ({ ...s, stakeOptions: s.stakeOptions.join(', '), coinValue: paiseToRupeesInput(s.coinValuePaise) });

export default function Settings() {
  const { isSuperAdmin } = useAuth();
  const { data, error, setData } = useApi<PlatformSettings>('/admin/settings');
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  if (!form || !data) return <div className="page"><ErrorBanner message={error} />{!error ? <span className="muted">Loading…</span> : null}</div>;

  const readOnly = !isSuperAdmin;
  const stakes = form.stakeOptions.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  const coinValuePaise = rupeesToPaise(form.coinValue);
  const next: Partial<PlatformSettings> = {
    maintenanceMode: form.maintenanceMode,
    registrationOpen: form.registrationOpen,
    defaultRating: Number(form.defaultRating),
    supportEmail: form.supportEmail,
    minAppVersion: form.minAppVersion,
    winningsFeePercent: Number(form.winningsFeePercent),
    stakeOptions: stakes,
    withdrawalsEnabled: form.withdrawalsEnabled,
    coinValuePaise: coinValuePaise ?? data.coinValuePaise,
    minWithdrawalCoins: Number(form.minWithdrawalCoins),
    withdrawalTdsPercent: Number(form.withdrawalTdsPercent),
  };
  const changed = (Object.keys(next) as (keyof PlatformSettings)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(data[k]));
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!changed.length) return;
    if (stakes.some((n) => !Number.isInteger(n) || n < 0)) return setSaveError('Entry options must be whole numbers, e.g. 0, 10, 50, 100');
    if (coinValuePaise === null || coinValuePaise < 1) return setSaveError('Coin value must be a rupee amount like 0.80');
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const patch = Object.fromEntries(changed.map((k) => [k, next[k]]));
      setData(await api<PlatformSettings>('/admin/settings', { method: 'PATCH', body: patch }));
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1><SettingsIcon size={22} /> Platform settings</h1>
          <p>Changes apply immediately and are recorded in the audit log.</p>
        </div>
      </header>
      {readOnly ? <p className="notice">Only a super admin can change settings. You can view them.</p> : null}

      <form className="form narrow" onSubmit={save}>
        <ErrorBanner message={saveError} />
        {saved ? <div className="success-banner">Settings saved.</div> : null}

        <section className="card form">
          <h2>General</h2>
          <label className="check">
            <input type="checkbox" disabled={readOnly} checked={form.maintenanceMode} onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })} />
            <span><strong>Maintenance mode</strong><span className="muted small">Players cannot use the app or start games. The admin portal stays available.</span></span>
          </label>
          <label className="check">
            <input type="checkbox" disabled={readOnly} checked={form.registrationOpen} onChange={(e) => setForm({ ...form, registrationOpen: e.target.checked })} />
            <span><strong>Registration open</strong><span className="muted small">New players can create accounts.</span></span>
          </label>
          <div className="form-row three">
            <label>Starting rating<input type="number" min={100} max={3000} disabled={readOnly} value={form.defaultRating} onChange={set('defaultRating')} /></label>
            <label>Minimum app version<input disabled={readOnly} value={form.minAppVersion} pattern="\d+\.\d+\.\d+" onChange={set('minAppVersion')} /></label>
            <label>Support email<input type="email" disabled={readOnly} value={form.supportEmail} onChange={set('supportEmail')} /></label>
          </div>
        </section>

        <section className="card form">
          <h2>Coin economy</h2>
          <div className="form-row">
            <label>
              Platform fee on winnings (%)
              <input type="number" min={0} max={50} disabled={readOnly} value={form.winningsFeePercent} onChange={set('winningsFeePercent')} />
              <span className="muted small">Taken from game pots and tournament prize pools.</span>
            </label>
            <label>
              Game entry options (coins)
              <input disabled={readOnly} value={form.stakeOptions} onChange={set('stakeOptions')} placeholder="0, 10, 50, 100" />
              <span className="muted small">0 = free game. Players with the same entry are paired.</span>
            </label>
          </div>
        </section>

        <section className="card form">
          <h2>Withdrawals (coins → money)</h2>
          <div className="notice">
            <AlertTriangle size={16} />
            Turning this on makes coins redeemable for money. Get legal clearance first (India's online gaming law, 2025).
          </div>
          <label className="check">
            <input type="checkbox" disabled={readOnly} checked={form.withdrawalsEnabled} onChange={(e) => setForm({ ...form, withdrawalsEnabled: e.target.checked })} />
            <span><strong>Allow withdrawals</strong><span className="muted small">Players with approved KYC can convert play coins to money.</span></span>
          </label>
          <div className="form-row three">
            <label>
              Value of 1 coin (₹)
              <input disabled={readOnly} inputMode="decimal" value={form.coinValue} onChange={set('coinValue')} />
              <span className="muted small">100 coins = {coinValuePaise ? rupees(coinValuePaise * 100) : '—'}</span>
            </label>
            <label>Minimum (coins)<input type="number" min={1} disabled={readOnly} value={form.minWithdrawalCoins} onChange={set('minWithdrawalCoins')} /></label>
            <label>TDS (%)<input type="number" min={0} max={50} disabled={readOnly} value={form.withdrawalTdsPercent} onChange={set('withdrawalTdsPercent')} /></label>
          </div>
        </section>

        {!readOnly ? (
          <footer className="form-footer">
            <button type="button" disabled={!changed.length} onClick={() => setForm(toForm(data))}>Reset</button>
            <button type="submit" className="primary" disabled={saving || !changed.length}>
              <Save size={15} /> {saving ? 'Saving…' : `Save${changed.length ? ` (${changed.length})` : ''}`}
            </button>
          </footer>
        ) : null}
      </form>
    </div>
  );
}
