import { useState } from 'react';
import { download, qs } from '../api';
import { useApi } from '../hooks';
import { BarChart, DateRange, ErrorBanner, StatCard } from '../components';
import { dayEndIso, dayStartIso, humanize, num, rupees } from '../format';

interface Overview {
  revenue: {
    totals: { revenuePaise: number; paidOrders: number; coinsSold: number };
    ordersByStatus: Record<string, number>;
    series: { period: string; revenuePaise: number; orders: number }[];
  };
  players: { newPlayers: number; playersByStatus: Record<string, number>; series: { period: string; newPlayers: number }[] };
  matches: {
    byResult: Record<string, number>;
    byMode: Record<string, number>;
    byTermination: Record<string, number>;
    series: { period: string; matches: number }[];
  };
}

function isoDay(d: Date) {
  return new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return (
    <div>
      <h3>{title}</h3>
      {entries.length === 0 ? <p className="muted">No data</p> : null}
      <ul className="breakdown">
        {entries.map(([k, v]) => (
          <li key={k}>
            <span>{humanize(k)}</span>
            <span className="bar-track"><span className="bar-fill" style={{ width: `${total ? (v / total) * 100 : 0}%` }} /></span>
            <strong>{num(v)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

const EXPORTS = [
  { type: 'payments', label: 'Payments' },
  { type: 'players', label: 'Players' },
  { type: 'matches', label: 'Matches' },
  { type: 'audit-logs', label: 'Audit logs' },
];

export default function Reports() {
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [groupBy, setGroupBy] = useState<'day' | 'month'>('day');
  const [exportError, setExportError] = useState<string | null>(null);
  const range = { from: dayStartIso(from), to: dayEndIso(to) };
  const { data, error, loading } = useApi<Overview>(from && to ? `/admin/reports${qs({ type: 'overview', groupBy, ...range })}` : null);

  async function exportCsv(type: string) {
    setExportError(null);
    try {
      await download(`/admin/reports/export${qs({ type, ...range })}`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Reports</h1>
      </header>
      <div className="toolbar">
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as 'day' | 'month')} aria-label="Group by">
          <option value="day">Daily</option>
          <option value="month">Monthly</option>
        </select>
        <span className="spacer" />
        {EXPORTS.map((x) => (
          <button key={x.type} type="button" onClick={() => exportCsv(x.type)}>
            Export {x.label}
          </button>
        ))}
      </div>
      <ErrorBanner message={error || exportError} />
      <p className="muted small">Dates are IST. Revenue counts PAID orders only, by payment date. Range up to 366 days.</p>

      {data ? (
        <div className={loading ? 'loading' : undefined}>
          <section className="stats-grid">
            <StatCard label="Revenue" value={rupees(data.revenue.totals.revenuePaise)} />
            <StatCard label="Paid orders" value={num(data.revenue.totals.paidOrders)} />
            <StatCard label="Coins sold" value={num(data.revenue.totals.coinsSold)} />
            <StatCard label="New players" value={num(data.players.newPlayers)} />
            <StatCard label="Matches" value={num(Object.values(data.matches.byMode).reduce((a, b) => a + b, 0))} />
          </section>

          <div className="two-col">
            <section className="card">
              <h2>Revenue</h2>
              <BarChart data={data.revenue.series.map((d) => ({ label: d.period, value: d.revenuePaise }))} format={rupees} />
              <Breakdown title="Orders created by status" data={data.revenue.ordersByStatus} />
            </section>
            <section className="card">
              <h2>New players</h2>
              <BarChart data={data.players.series.map((d) => ({ label: d.period, value: d.newPlayers }))} format={num} />
              <Breakdown title="All players by status" data={data.players.playersByStatus} />
            </section>
          </div>

          <section className="card">
            <h2>Matches</h2>
            <BarChart data={data.matches.series.map((d) => ({ label: d.period, value: d.matches }))} format={num} />
            <div className="three-col">
              <Breakdown title="By result" data={data.matches.byResult} />
              <Breakdown title="By mode" data={data.matches.byMode} />
              <Breakdown title="How games ended" data={data.matches.byTermination} />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
