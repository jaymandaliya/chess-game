import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  BadgeCheck,
  Coins,
  Gamepad2,
  IndianRupee,
  ShieldBan,
  ShieldCheck,
  ShoppingBag,
  Swords,
  Target,
  Trophy,
  UserCog,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api, qs, type Page } from '../api';
import { useAuth } from '../auth';
import { useApi } from '../hooks';
import { Avatar, Badge, DataTable, DetailList, ErrorBanner, Modal, Pager, StatCard, Tabs, type Tone } from '../components';
import { date, dateTime, humanize, num, rupees } from '../format';
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
  wallet: { balance: number; tournamentBalance: number };
  stats: StatLine & { rating: number; peakRating: number };
  purchases: {
    paidOrders: number;
    totalSpentPaise: number;
    recentOrders: { id: string; orderNumber: string; amountPaise: number; coins: number; status: string; createdAt: string; package: { name: string } }[];
  };
}

interface TimelineEntry {
  at: string;
  kind: 'ORDER' | 'COINS' | 'GAME' | 'TOURNAMENT' | 'WITHDRAWAL' | 'ACCOUNT';
  title: string;
  detail: string;
  coins?: number;
  amountPaise?: number;
  refId: string;
}

interface Activity {
  kyc: { status: string; fullName?: string; pan?: string; payoutTo?: string; rejectionReason?: string | null };
  timeline: TimelineEntry[];
}

interface Tx {
  id: string;
  coinType: 'PLAY' | 'TOURNAMENT';
  type: string;
  amount: number;
  balanceAfter: number;
  description?: string;
  createdAt: string;
}

const KIND: Record<TimelineEntry['kind'], { icon: LucideIcon; tone: Tone; label: string }> = {
  ORDER: { icon: ShoppingBag, tone: 'green', label: 'Purchase' },
  COINS: { icon: Coins, tone: 'gold', label: 'Coins' },
  GAME: { icon: Swords, tone: 'violet', label: 'Game' },
  TOURNAMENT: { icon: Trophy, tone: 'amber', label: 'Tournament' },
  WITHDRAWAL: { icon: Banknote, tone: 'red', label: 'Withdrawal' },
  ACCOUNT: { icon: UserCog, tone: 'blue', label: 'Account' },
};

type TabKey = 'overview' | 'activity' | 'ledger';

function ActivityTab({ playerId }: { playerId: string }) {
  const { data, error } = useApi<Activity>(`/admin/players/${playerId}/activity`);
  const [kind, setKind] = useState<'' | TimelineEntry['kind']>('');
  const items = (data?.timeline ?? []).filter((e) => !kind || e.kind === kind);
  return (
    <div className="split">
      <section className="card">
        <div className="card-header">
          <h2>Timeline</h2>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Filter">
            <option value="">Everything</option>
            {Object.entries(KIND).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <ErrorBanner message={error} />
        <ul className="timeline">
          {items.map((e, i) => {
            const meta = KIND[e.kind];
            const Icon = meta.icon;
            return (
              <li key={`${e.kind}-${e.refId}-${i}`}>
                <span className={`activity-icon tone-${meta.tone}`}><Icon size={15} /></span>
                <div>
                  <div style={{ fontWeight: 600 }}>{e.title}</div>
                  <div className="muted small">{dateTime(e.at)} · {e.detail}</div>
                </div>
                <div className="mono" style={{ textAlign: 'right' }}>
                  {e.coins !== undefined ? <div className={e.coins >= 0 ? 'pos' : 'neg'}>{e.coins >= 0 ? '+' : ''}{num(e.coins)}</div> : null}
                  {e.amountPaise !== undefined ? <div className="muted small">{rupees(e.amountPaise)}</div> : null}
                </div>
              </li>
            );
          })}
          {data && items.length === 0 ? <li className="muted">Nothing yet</li> : null}
        </ul>
      </section>
      <section className="card">
        <div className="card-header"><h2>KYC</h2>{data ? <Badge value={data.kyc.status === 'NOT_SUBMITTED' ? 'DISABLED' : data.kyc.status} label={humanize(data.kyc.status)} /> : null}</div>
        {data && data.kyc.status !== 'NOT_SUBMITTED' ? (
          <>
            <DetailList items={[['Legal name', data.kyc.fullName], ['PAN', <code>{data.kyc.pan}</code>], ['Payout to', data.kyc.payoutTo], ...(data.kyc.rejectionReason ? ([['Rejected', data.kyc.rejectionReason]] as [string, string][]) : [])]} />
            <Link to={`/kyc?open=${playerId}`}>Open full KYC record</Link>
          </>
        ) : (
          <p className="muted">Not submitted.</p>
        )}
      </section>
    </div>
  );
}

function LedgerTab({ playerId }: { playerId: string }) {
  const [coinType, setCoinType] = useState<'' | 'PLAY' | 'TOURNAMENT'>('');
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApi<Page<Tx>>(`/admin/players/${playerId}/transactions${qs({ coinType, page, limit: 25 })}`);
  return (
    <>
      <div className="toolbar">
        <Tabs
          tabs={[{ key: '' as const, label: 'All coins' }, { key: 'PLAY' as const, label: 'Play coins' }, { key: 'TOURNAMENT' as const, label: 'Tournament coins' }]}
          value={coinType}
          onChange={(v) => { setCoinType(v); setPage(1); }}
        />
      </div>
      <ErrorBanner message={error} />
      <DataTable
        rows={data?.items}
        loading={loading}
        rowKey={(t) => t.id}
        empty="No coin movements."
        columns={[
          { key: 'createdAt', header: 'Time', render: (t) => dateTime(t.createdAt) },
          { key: 'coinType', header: 'Coins', render: (t) => <Badge value={t.coinType} label={t.coinType === 'PLAY' ? 'Play' : 'Tournament'} /> },
          { key: 'type', header: 'Type', render: (t) => humanize(t.type) },
          { key: 'description', header: 'Details', render: (t) => t.description ?? '—' },
          { key: 'amount', header: 'Amount', align: 'right', render: (t) => <span className={t.amount >= 0 ? 'pos' : 'neg'}>{t.amount >= 0 ? '+' : ''}{num(t.amount)}</span> },
          { key: 'balanceAfter', header: 'Balance after', align: 'right', render: (t) => num(t.balanceAfter) },
        ]}
      />
      <Pager pagination={data?.pagination} onPage={setPage} />
    </>
  );
}

export default function PlayerDetail() {
  const { id = '' } = useParams();
  const { user, isSuperAdmin } = useAuth();
  const { data, error, reload } = useApi<Detail>(`/admin/players/${id}`);
  const [tab, setTab] = useState<TabKey>('overview');
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
          <Link to="/players" className="back"><ArrowLeft size={14} /> Players</Link>
          <h1>
            <Avatar name={p.displayName} size={40} />
            {p.displayName} <Badge value={p.status} /> <Badge value={p.role} />
          </h1>
          <p>{p.email} · joined {date(p.createdAt)}</p>
        </div>
        <div className="actions">
          <Link className="button" to={`/game-activity?playerId=${p.id}`}><Gamepad2 size={15} /> Games</Link>
          {canManage ? (
            <button type="button" className={suspending ? 'danger-outline' : 'primary'} onClick={() => setDialog('status')}>
              {suspending ? <ShieldBan size={15} /> : <ShieldCheck size={15} />} {suspending ? 'Suspend' : 'Reactivate'}
            </button>
          ) : null}
          {isSuperAdmin && !isSelf ? (
            <button type="button" onClick={() => { setRole(p.role); setDialog('role'); }}>
              <UserCog size={15} /> Change role
            </button>
          ) : null}
        </div>
      </header>

      <section className="stats-grid">
        <StatCard label="Play coins" icon={Wallet} tone="green" value={num(data.wallet.balance)} />
        <StatCard label="Tournament coins" icon={Trophy} tone="gold" value={num(data.wallet.tournamentBalance)} />
        <StatCard label="Total spent" icon={IndianRupee} tone="blue" value={rupees(data.purchases.totalSpentPaise)} hint={`${data.purchases.paidOrders} paid orders`} />
        <StatCard label="Rating" icon={Target} tone="violet" value={num(data.stats.rating)} hint={`Peak ${num(data.stats.peakRating)} · ${data.stats.winRate}% wins`} />
        <StatCard label="Games" icon={Swords} tone="grey" value={num(data.stats.played)} hint={`${data.stats.wins}W · ${data.stats.losses}L · ${data.stats.draws}D`} />
      </section>

      <Tabs<TabKey>
        tabs={[{ key: 'overview', label: 'Overview' }, { key: 'activity', label: 'All activity' }, { key: 'ledger', label: 'Coin ledger' }]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'overview' ? (
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
                  ? ([['Suspended', `${dateTime(p.suspendedAt)}${p.suspendedReason ? ` — ${p.suspendedReason}` : ''}`]] as [string, ReactNode][])
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
              ]}
            />
          </section>
        </div>
      ) : null}
      {tab === 'activity' ? <ActivityTab playerId={p.id} /> : null}
      {tab === 'ledger' ? <LedgerTab playerId={p.id} /> : null}

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
                <BadgeCheck size={15} /> Save role
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
