import { Link } from 'react-router-dom';
import { useApi } from '../hooks';
import { BarChart, ErrorBanner, StatCard } from '../components';
import { dateTime, num, rupees } from '../format';

interface Summary {
  totalPlayers: number;
  activePlayers: number;
  totalRevenuePaise: number;
  totalOrders: number;
  pendingPayments: number;
  completedMatches: number;
  newPlayersToday: number;
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

const ACTIVITY_ICON: Record<string, string> = {
  PLAYER_SIGNUP: '👤',
  COIN_PURCHASE: '💰',
  MATCH_COMPLETED: '♟',
  ADMIN_ACTION: '🛡',
};

export default function Dashboard() {
  const summary = useApi<Summary>('/admin/dashboard');
  const revenue = useApi<Revenue>('/admin/dashboard/revenue?groupBy=day');
  const s = summary.data;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <button type="button" onClick={() => { summary.reload(); revenue.reload(); }}>
          Refresh
        </button>
      </header>
      <ErrorBanner message={summary.error || revenue.error} />

      <section className="stats-grid">
        <StatCard label="Total players" value={num(s?.totalPlayers)} hint={`${num(s?.newPlayersToday)} joined today`} />
        <StatCard label="Active players" value={num(s?.activePlayers)} hint="Used the app in the last 30 days" />
        <StatCard label="Total revenue" value={rupees(s?.totalRevenuePaise)} hint="PAID orders only" />
        <StatCard label="Paid orders" value={num(s?.totalOrders)} />
        <StatCard label="Pending payments" value={num(s?.pendingPayments)} hint="Awaiting provider confirmation" />
        <StatCard label="Completed matches" value={num(s?.completedMatches)} />
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Revenue · last 30 days</h2>
          <p className="muted">
            {rupees(revenue.data?.totals.revenuePaise)} from {num(revenue.data?.totals.paidOrders)} orders ·{' '}
            {num(revenue.data?.totals.coinsSold)} coins sold
          </p>
          <BarChart data={(revenue.data?.series ?? []).map((d) => ({ label: d.period, value: d.revenuePaise }))} format={rupees} />
        </section>

        <section className="card">
          <h2>Recent activity</h2>
          <ul className="activity">
            {s?.recentActivity.map((a) => (
              <li key={`${a.type}-${a.refId}`}>
                <span className="activity-icon" aria-hidden>
                  {ACTIVITY_ICON[a.type] ?? '•'}
                </span>
                <div>
                  {ACTIVITY_LINK[a.refType] ? <Link to={ACTIVITY_LINK[a.refType](a.refId)}>{a.message}</Link> : a.message}
                  <div className="muted small">{dateTime(a.at)}</div>
                </div>
              </li>
            ))}
            {s && s.recentActivity.length === 0 ? <li className="muted">Nothing yet</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
