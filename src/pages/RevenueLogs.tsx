import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Banknote, Coins, IndianRupee, ReceiptText, RotateCcw, Wallet } from 'lucide-react';
import { useList } from '../hooks';
import { Badge, DataTable, DateRange, ErrorBanner, Pager, StatCard, type Column } from '../components';
import { dateTime, num, rupees } from '../format';

interface LogItem {
  id: string;
  at: string;
  source: 'COIN_SALE' | 'REFUND' | 'PLATFORM_FEE' | 'WITHDRAWAL_PAID';
  description: string;
  user: { id: string; displayName: string; email: string } | null;
  amountPaise?: number;
  coins?: number;
  direction: 'IN' | 'OUT';
  ref: { type: string; id: string; label: string };
}

interface Summary {
  salesPaise: number;
  salesCount: number;
  refundsPaise: number;
  withdrawalsPaise: number;
  withdrawalsCount: number;
  tdsPaise: number;
  netCashPaise: number;
  feeCoins: number;
  gameFeeCoins: number;
  tournamentFeeCoins: number;
  feeValuePaise: number;
}

const SOURCE_LABEL: Record<LogItem['source'], string> = {
  COIN_SALE: 'Coin sale',
  REFUND: 'Refund',
  PLATFORM_FEE: 'Platform fee',
  WITHDRAWAL_PAID: 'Withdrawal paid',
};

const SOURCE_TONE: Record<LogItem['source'], string> = {
  COIN_SALE: 'PAID',
  REFUND: 'REFUNDED',
  PLATFORM_FEE: 'TOURNAMENT',
  WITHDRAWAL_PAID: 'PENDING',
};

function refLink(item: LogItem) {
  if (item.ref.type === 'ORDER') return <Link to={`/payments?open=${item.ref.id}`}>{item.ref.label}</Link>;
  if (item.ref.type === 'WITHDRAWAL') return <Link to={`/withdrawals?open=${item.ref.id}`}>{item.ref.label}</Link>;
  if (item.ref.type === 'TOURNAMENT') return <Link to={`/tournaments?open=${item.ref.id}`}>{item.ref.label}</Link>;
  if (item.ref.type === 'MATCH') return <Link to={`/game-activity?open=${item.ref.id}`}>{item.ref.label}</Link>;
  return item.ref.label;
}

const COLUMNS: Column<LogItem>[] = [
  { key: 'at', header: 'Time', render: (i) => dateTime(i.at) },
  { key: 'source', header: 'Type', render: (i) => <Badge value={SOURCE_TONE[i.source]} label={SOURCE_LABEL[i.source]} /> },
  { key: 'description', header: 'Details', render: (i) => i.description },
  { key: 'user', header: 'Player', render: (i) => (i.user ? <Link to={`/players/${i.user.id}`}>{i.user.displayName}</Link> : <span className="muted">—</span>) },
  { key: 'ref', header: 'Reference', render: refLink },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    render: (i) => (
      <span className={i.direction === 'IN' ? 'pos' : 'neg'} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        {i.direction === 'IN' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
        {i.amountPaise !== undefined ? rupees(i.amountPaise) : `${num(i.coins)} coins`}
      </span>
    ),
  },
];

export default function RevenueLogs() {
  const list = useList<LogItem>('/admin/revenue-logs', { limit: '25' });
  const s = (list.data as unknown as { summary?: Summary } | null)?.summary;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1><ReceiptText size={22} /> Revenue logs</h1>
          <p>Every rupee in and out, plus the coins the platform keeps as fees.</p>
        </div>
      </header>
      <div className="toolbar">
        <select value={list.get('source') || 'ALL'} onChange={(e) => list.set({ source: e.target.value === 'ALL' ? undefined : e.target.value })} aria-label="Type">
          <option value="ALL">All types</option>
          <option value="COIN_SALE">Coin sales</option>
          <option value="REFUND">Refunds</option>
          <option value="PLATFORM_FEE">Platform fees</option>
          <option value="WITHDRAWAL_PAID">Withdrawals paid</option>
        </select>
        <DateRange from={list.get('from')} to={list.get('to')} onChange={(from, to) => list.set({ from, to })} />
      </div>
      <ErrorBanner message={list.error} />
      <section className="stats-grid">
        <StatCard label="Coin sales" icon={IndianRupee} tone="green" value={rupees(s?.salesPaise)} hint={`${num(s?.salesCount)} orders`} />
        <StatCard label="Refunds" icon={RotateCcw} tone="violet" value={rupees(s?.refundsPaise)} />
        <StatCard label="Withdrawals paid" icon={Banknote} tone="red" value={rupees(s?.withdrawalsPaise)} hint={`incl. TDS ${rupees(s?.tdsPaise)}`} />
        <StatCard label="Net cash" icon={Wallet} tone="blue" value={rupees(s?.netCashPaise)} hint="Sales − refunds − withdrawals" />
        <StatCard
          label="Platform fees"
          icon={Coins}
          tone="gold"
          value={`${num(s?.feeCoins)} coins`}
          hint={`Games ${num(s?.gameFeeCoins)} · Tournaments ${num(s?.tournamentFeeCoins)} · ≈ ${rupees(s?.feeValuePaise)}`}
        />
      </section>
      <DataTable columns={COLUMNS} rows={list.data?.items} loading={list.loading} rowKey={(i) => i.id} empty="Nothing in this period." />
      <Pager pagination={list.data?.pagination} onPage={(page) => list.set({ page }, false)} />
    </div>
  );
}
