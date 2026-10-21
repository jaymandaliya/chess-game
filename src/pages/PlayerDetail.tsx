import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useApi } from '../hooks';
import { Badge, DataTable, DetailList, ErrorBanner, Modal, StatCard } from '../components';
import { date, dateTime, num, rupees } from '../format';
import type { PlayerRow } from './Players';

interface StatLine {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

interface Detail {
  player: PlayerRow & { country?: string; bio?: string; peakRating: number; lastLoginAt?: string; suspendedReason?: string; suspendedAt?: string };
  wallet: { balance: number };
  stats: StatLine & { rating: number; peakRating: number };
  purchases: {
    paidOrders: number;
    totalSpentPaise: number;
    recentOrders: { id: string; orderNumber: string; amountPaise: number; coins: number; status: string; createdAt: string; package: { name: string } }[];
  };
}

export default function PlayerDetail() {
  const { id } = useParams();
  const { user, isSuperAdmin } = useAuth();
  const { data, error, reload } = useApi<Detail>(`/admin/players/${id}`);
  const [dialog, setDialog] = useState<'status' | 'role' | null>(null);
  const [reason, setReason] = useState('');
  const [role, setRole] = useState('PLAYER');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <div className="page"><ErrorBanner message={error} /></div>;
  if (!data) return <div className="page muted">Loading…</div>;

  const p = data.player;
  const isSelf = user?.id === p.id;
  const isStaff = p.role !== 'PLAYER';
  const canManage = !isSelf && (!isStaff || isSuperAdmin);
  const suspending = p.status === 'ACTIVE';

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      setDialog(null);
      setReason('');
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <Link to="/players" className="muted small">‹ Players</Link>
          <h1>
            {p.displayName} <Badge value={p.status} /> <Badge value={p.role} />
          </h1>
        </div>
        <div className="actions">
          <Link className="button" to={`/game-activity?playerId=${p.id}`}>View games</Link>
          {canManage ? (
            <button type="button" className={suspending ? 'danger' : 'primary'} onClick={() => setDialog('status')}>
              {suspending ? 'Suspend' : 'Reactivate'}
            </button>
          ) : null}
          {isSuperAdmin && !isSelf ? (
            <button type="button" onClick={() => { setRole(p.role); setDialog('role'); }}>
              Change role
            </button>
          ) : null}
        </div>
      </header>

      <section className="stats-grid">
        <StatCard label="Rating" value={num(data.stats.rating)} hint={`Peak ${num(data.stats.peakRating)}`} />
        <StatCard label="Games" value={num(data.stats.played)} hint={`${data.stats.wins}W · ${data.stats.losses}L · ${data.stats.draws}D`} />
        <StatCard label="Win rate" value={`${data.stats.winRate}%`} />
        <StatCard label="Coin balance" value={num(data.wallet.balance)} />
        <StatCard label="Total spent" value={rupees(data.purchases.totalSpentPaise)} hint={`${data.purchases.paidOrders} paid orders`} />
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Account</h2>
          <DetailList
            items={[
              ['User ID', <code>{p.id}</code>],
              ['Email', p.email],
              ['Country', p.country],
              ['Bio', p.bio],
              ['Joined', date(p.createdAt)],
              ['Last login', dateTime(p.lastLoginAt)],
              ['Last active', dateTime(p.lastActiveAt)],
              ...(p.status === 'SUSPENDED'
                ? ([['Suspended', `${dateTime(p.suspendedAt)}${p.suspendedReason ? ` — ${p.suspendedReason}` : ''}`]] as [string, string][])
                : []),
            ]}
          />
        </section>
        <section className="card">
          <h2>Recent orders</h2>
          <DataTable
            rows={data.purchases.recentOrders}
            rowKey={(o) => o.id}
            empty="No orders"
            columns={[
              { key: 'orderNumber', header: 'Order', render: (o) => <Link to={`/payments?open=${o.id}`}>{o.orderNumber}</Link> },
              { key: 'package', header: 'Package', render: (o) => o.package.name },
              { key: 'amount', header: 'Amount', align: 'right', render: (o) => rupees(o.amountPaise) },
              { key: 'status', header: 'Status', render: (o) => <Badge value={o.status} /> },
              { key: 'createdAt', header: 'Created', render: (o) => dateTime(o.createdAt) },
            ]}
          />
        </section>
      </div>

      {dialog === 'status' ? (
        <Modal
          title={suspending ? `Suspend ${p.displayName}?` : `Reactivate ${p.displayName}?`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" onClick={() => setDialog(null)}>Cancel</button>
              <button
                type="button"
                className={suspending ? 'danger' : 'primary'}
                disabled={busy}
                onClick={() => run(() => api(`/admin/players/${p.id}/status`, { method: 'PATCH', body: { status: suspending ? 'SUSPENDED' : 'ACTIVE', ...(reason.trim() ? { reason: reason.trim() } : {}) } }))}
              >
                {suspending ? 'Suspend' : 'Reactivate'}
              </button>
            </>
          }
        >
          <ErrorBanner message={actionError} />
          {suspending ? <p>The player is signed out on all devices immediately and cannot sign in until reactivated.</p> : <p>The player will be able to sign in again.</p>}
          <label>
            Reason (recorded in the audit log)
            <textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} rows={3} />
          </label>
        </Modal>
      ) : null}

      {dialog === 'role' ? (
        <Modal
          title={`Change role of ${p.displayName}`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" onClick={() => setDialog(null)}>Cancel</button>
              <button type="button" className="primary" disabled={busy || role === p.role} onClick={() => run(() => api(`/admin/players/${p.id}/role`, { method: 'PATCH', body: { role } }))}>
                Save role
              </button>
            </>
          }
        >
          <ErrorBanner message={actionError} />
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="PLAYER">Player</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPER_ADMIN">Super admin</option>
            </select>
          </label>
          <p className="muted small">The user is signed out everywhere so the new role takes effect immediately.</p>
        </Modal>
      ) : null}
    </div>
  );
}
