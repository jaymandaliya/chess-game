import { Link } from 'react-router-dom';
import {
  Activity,
  BadgeCheck,
  Banknote,
  Clock,
  Coins,
  IndianRupee,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Swords,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useApi } from '../hooks';
import { BarChart, ErrorBanner, StatCard, type Tone } from '../components';
import { dateTime, fillSeries, istDay, num, periodsBetween, rupees } from '../format';

interface Summary {
  totalPlayers: number;
  activePlayers: number;
  totalRevenuePaise: number;
  totalOrders: number;
  pendingPayments: number;
  completedMatches: number;
  newPlayersToday: number;
  pendingKyc: number;
  pendingWithdrawals: number;
  activeTournaments: number;
  platformFeeCoins: number;
  recentActivity: { type: string; at: string; message: string; refType: string; refId: string }[];
}

interface Revenue {
  totals: { revenuePaise: number; paidOrders: number; coinsSold: number };
  series: { period: string; revenuePaise: number; orders: number }[];
}

const ACTIVITY_LINK: Record<string, (id: string) => string> = {
  USER: (id) => `/players/${id}`,
  ORDER: (id) => `/payments?open=${id}`,
  MATCH: (id) => `/game-activity?open=${id}`,
  AUDIT_LOG: (id) => `/audit-logs?open=${id}`,
};

const ACTIVITY_ICON: Record<string, { icon: LucideIcon; tone: Tone }> = {
  PLAYER_SIGNUP: { icon: UserPlus, tone: 'blue' },
  COIN_PURCHASE: { icon: ShoppingBag, tone: 'green' },
  MATCH_COMPLETED: { icon: Swords, tone: 'violet' },
  ADMIN_ACTION: { icon: ShieldCheck, tone: 'amber' },
};

export default function Dashboard() {
  const summary = useApi<Summary>('/admin/dashboard');
  const revenue = useApi<Revenue>('/admin/dashboard/revenue?groupBy=day');
  const s = summary.data;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Live numbers from players, payments and games.</p>
        </div>
        <button type="button" onClick={() => { summary.reload(); revenue.reload(); }}>
          <RefreshCw size={15} /> Refresh
        </button>
      </header>
      <ErrorBanner message={summary.error || revenue.error} />

      {s && (s.pendingKyc || s.pendingWithdrawals) ? (
        <div className="notice">
          <Clock size={16} />
          Waiting for review:&nbsp;
          {s.pendingKyc ? <Link to="/kyc?status=PENDING">{s.pendingKyc} KYC</Link> : null}
          {s.pendingKyc && s.pendingWithdrawals ? ' · ' : null}
          {s.pendingWithdrawals ? <Link to="/withdrawals?status=PENDING">{s.pendingWithdrawals} withdrawals</Link> : null}
        </div>
      ) : null}

      <section className="stats-grid">
        <StatCard label="Total players" icon={Users} tone="blue" value={num(s?.totalPlayers)} hint={`${num(s?.newPlayersToday)} joined today`} />
        <StatCard label="Active players" icon={Activity} tone="green" value={num(s?.activePlayers)} hint="Used the app in the last 30 days" />
        <StatCard label="Total revenue" icon={IndianRupee} tone="green" value={rupees(s?.totalRevenuePaise)} hint={`${num(s?.totalOrders)} paid orders`} />
        <StatCard label="Platform fees" icon={Coins} tone="gold" value={`${num(s?.platformFeeCoins)} coins`} hint="From game pots and tournaments" />
        <StatCard label="Completed matches" icon={Swords} tone="violet" value={num(s?.completedMatches)} />
        <StatCard label="Active tournaments" icon={Trophy} tone="gold" value={num(s?.activeTournaments)} hint="Open or running" />
        <StatCard label="Pending KYC" icon={BadgeCheck} tone="amber" value={num(s?.pendingKyc)} />
        <StatCard label="Pending withdrawals" icon={Banknote} tone="red" value={num(s?.pendingWithdrawals)} hint={`${num(s?.pendingPayments)} payments pending`} />
      </section>

      <div className="split">
        <section className="card">
          <div className="card-header">
            <h2>Revenue · last 30 days</h2>
            <span className="muted small">
              {rupees(revenue.data?.totals.revenuePaise)} · {num(revenue.data?.totals.coinsSold)} coins sold
            </span>
          </div>
          <BarChart
            data={fillSeries(revenue.data?.series ?? [], periodsBetween(istDay(new Date(Date.now() - 29 * 86400000)), istDay(new Date())), (d) => d.revenuePaise)}
            format={rupees}
          />
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Recent activity</h2>
          </div>
          <ul className="activity">
            {s?.recentActivity.map((a) => {
              const meta = ACTIVITY_ICON[a.type] ?? { icon: Activity, tone: 'grey' as Tone };
              const Icon = meta.icon;
              return (
                <li key={`${a.type}-${a.refId}`}>
                  <span className={`activity-icon tone-${meta.tone}`}>
                    <Icon size={15} />
                  </span>
                  <div>
                    {ACTIVITY_LINK[a.refType] ? <Link to={ACTIVITY_LINK[a.refType](a.refId)}>{a.message}</Link> : a.message}
                    <div className="muted small">{dateTime(a.at)}</div>
                  </div>
                </li>
              );
            })}
            {s && s.recentActivity.length === 0 ? <li className="muted">Nothing yet</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
