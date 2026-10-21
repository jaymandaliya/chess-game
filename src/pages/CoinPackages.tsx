import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useList } from '../hooks';
import { Badge, DataTable, ErrorBanner, Modal, Pager, type Column } from '../components';
import { dateTime, num, paiseToRupeesInput, rupees, rupeesToPaise } from '../format';

interface CoinPackage {
  id: string;
  name: string;
  coins: number;
  pricePaise: number;
  tag?: string;
  active: boolean;
  sortOrder: number;
  updatedAt: string;
}

interface FormState {
  id?: string;
  name: string;
  coins: string;
  price: string;
  tag: string;
  sortOrder: string;
}

const EMPTY: FormState = { name: '', coins: '', price: '', tag: '', sortOrder: '0' };

export default function CoinPackages() {
  const list = useList<CoinPackage>('/admin/coin-packages', { sortBy: 'sortOrder', sortOrder: 'asc', limit: '50' });
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(pkg: CoinPackage) {
    try {
      await api(`/admin/coin-packages/${pkg.id}/status`, { method: 'PATCH', body: { active: !pkg.active } });
      list.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const pricePaise = rupeesToPaise(form.price);
    const coins = Number(form.coins);
    if (pricePaise === null || pricePaise < 100) return setError('Price must be at least ₹1, up to 2 decimals');
    if (!Number.isInteger(coins) || coins < 1) return setError('Coins must be a whole number above 0');
    const body = {
      name: form.name.trim(),
      coins,
      pricePaise,
      tag: form.tag.trim() || (form.id ? null : undefined),
      sortOrder: Number(form.sortOrder) || 0,
    };
    setBusy(true);
    setError(null);
    try {
      if (form.id) await api(`/admin/coin-packages/${form.id}`, { method: 'PATCH', body });
      else await api('/admin/coin-packages', { method: 'POST', body });
      setForm(null);
      list.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<CoinPackage>[] = [
    { key: 'name', header: 'Name', sortable: true, render: (p) => <strong>{p.name}</strong> },
    { key: 'coins', header: 'Coins', sortable: true, align: 'right', render: (p) => num(p.coins) },
    { key: 'pricePaise', header: 'Price', sortable: true, align: 'right', render: (p) => rupees(p.pricePaise) },
    { key: 'perCoin', header: '₹ / 100 coins', align: 'right', render: (p) => rupees(Math.round((p.pricePaise * 100) / p.coins)) },
    { key: 'tag', header: 'Tag', render: (p) => p.tag ?? <span className="muted">—</span> },
    { key: 'active', header: 'Status', render: (p) => <Badge value={p.active ? 'ACTIVE' : 'DISABLED'} /> },
    { key: 'sortOrder', header: 'Order', sortable: true, align: 'right', render: (p) => p.sortOrder },
    { key: 'updatedAt', header: 'Updated', render: (p) => dateTime(p.updatedAt) },
    {
      key: 'actions',
      header: '',
      render: (p) => (
        <div className="row-actions">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setForm({ id: p.id, name: p.name, coins: String(p.coins), price: paiseToRupeesInput(p.pricePaise), tag: p.tag ?? '', sortOrder: String(p.sortOrder) });
            }}
          >
            Edit
          </button>
          <button type="button" className={p.active ? 'danger-outline' : 'primary'} onClick={() => toggle(p)}>
            {p.active ? 'Disable' : 'Enable'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Coin packages</h1>
        <button type="button" className="primary" onClick={() => { setError(null); setForm(EMPTY); }}>
          New package
        </button>
      </header>
      <p className="muted">Disabled packages are hidden from players. Price changes apply to new orders only; past orders keep their price.</p>
      <ErrorBanner message={list.error} />
      <DataTable columns={columns} rows={list.data?.items} loading={list.loading} sortBy={list.get('sortBy')} sortOrder={list.get('sortOrder')} onSort={list.sort} rowKey={(p) => p.id} />
      <Pager pagination={list.data?.pagination} onPage={(page) => list.set({ page }, false)} />

      {form ? (
        <Modal title={form.id ? `Edit ${form.name}` : 'New coin package'} onClose={() => setForm(null)}>
          <form className="form" onSubmit={save}>
            <ErrorBanner message={error} />
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={40} pattern="[A-Za-z0-9 &'\-]+" title="Letters, numbers, spaces, & ' -" />
            </label>
            <div className="form-row">
              <label>
                Coins
                <input type="number" min={1} step={1} value={form.coins} onChange={(e) => setForm({ ...form, coins: e.target.value })} required />
              </label>
              <label>
                Price (₹)
                <input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="399" required />
              </label>
            </div>
            <div className="form-row">
              <label>
                Tag (optional)
                <input value={form.tag} maxLength={20} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="MOST POPULAR" />
              </label>
              <label>
                Display order
                <input type="number" min={0} max={1000} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
              </label>
            </div>
            <footer className="form-footer">
              <button type="button" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
