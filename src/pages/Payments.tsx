import { useState } from 'react';
import { Link } from 'react-router-dom';
import { download, qs } from '../api';
import { useApi, useList } from '../hooks';
import { Badge, DataTable, DateRange, DetailList, ErrorBanner, Modal, Pager, type Column } from '../components';
import { dateTime, dayEndIso, dayStartIso, humanize, num, rupees } from '../format';

interface PaymentRow {
  id: string;
  orderNumber: string;
  user: { id: string; displayName?: string; email?: string };
  package: { name: string; coins: number; pricePaise: number };
  coins: number;
  amountPaise: number;
  currency: string;
  provider: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  status: string;
  paidVia: string | null;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
}

interface LedgerRow {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
}

const COLUMNS: Column<PaymentRow>[] = [
  { key: 'orderNumber', header: 'Order', render: (p) => <code>{p.orderNumber}</code> },
  { key: 'user', header: 'Player', render: (p) => (<><div>{p.user.displayName ?? p.user.id}</div><div className="muted small">{p.user.email}</div></>) },
  { key: 'package', header: 'Package', render: (p) => `${p.package.name} · ${num(p.coins)} coins` },
  { key: 'amountPaise', header: 'Amount', sortable: true, align: 'right', render: (p) => rupees(p.amountPaise) },
  { key: 'status', header: 'Status', render: (p) => <Badge value={p.status} /> },
  { key: 'providerPaymentId', header: 'Payment ref', render: (p) => <code className="small">{p.providerPaymentId ?? '—'}</code> },
  { key: 'createdAt', header: 'Created', sortable: true, render: (p) => dateTime(p.createdAt) },
];

function PaymentModal({ id, onClose }: { id: string; onClose(): void }) {
  const { data, error } = useApi<PaymentRow & { ledger: LedgerRow[] }>(`/admin/payments/${id}`);
  return (
    <Modal title={data ? `Order ${data.orderNumber}` : 'Order'} onClose={onClose}>
      <ErrorBanner message={error} />
      {data ? (
        <>
          <DetailList
            items={[
              ['Status', <Badge value={data.status} />],
              ['Player', <Link to={`/players/${data.user.id}`}>{data.user.displayName ?? data.user.id}</Link>],
              ['Email', data.user.email],
              ['Package', `${data.package.name} (${num(data.package.coins)} coins at ${rupees(data.package.pricePaise)})`],
              ['Amount', `${rupees(data.amountPaise)} ${data.currency}`],
              ['Provider', data.provider],
              ['Provider order ID', <code>{data.providerOrderId}</code>],
              ['Provider payment ID', data.providerPaymentId ? <code>{data.providerPaymentId}</code> : '—'],
              ['Confirmed via', humanize(data.paidVia)],
              ['Failure reason', data.failureReason],
              ['Created', dateTime(data.createdAt)],
              ['Paid', dateTime(data.paidAt)],
              ['Refunded', dateTime(data.refundedAt)],
            ]}
          />
          <h3>Coin ledger</h3>
          {data.ledger.length ? (
            <ul className="plain">
              {data.ledger.map((l) => (
                <li key={l.id}>
                  {humanize(l.type)}: <strong>{l.amount > 0 ? '+' : ''}{num(l.amount)}</strong> coins → balance {num(l.balanceAfter)} · {dateTime(l.createdAt)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No coins credited for this order.</p>
          )}
          <p className="muted small">Payment status changes only through verified provider callbacks; it cannot be edited here.</p>
        </>
      ) : null}
    </Modal>
  );
}

export default function Payments() {
  const list = useList<PaymentRow>('/admin/payments', { sortBy: 'createdAt', sortOrder: 'desc', limit: '20' });
  const [exportError, setExportError] = useState<string | null>(null);
  const openId = list.get('open');

  async function exportCsv() {
    setExportError(null);
    try {
      await download(
        `/admin/reports/export${qs({
          type: 'payments',
          status: list.get('status'),
          search: list.get('search'),
          from: dayStartIso(list.get('from')),
          to: dayEndIso(list.get('to')),
        })}`,
      );
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Payments</h1>
        <button type="button" onClick={exportCsv}>Export CSV</button>
      </header>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Order no., payment ref or email"
          defaultValue={list.get('search')}
          onKeyDown={(e) => e.key === 'Enter' && list.set({ search: e.currentTarget.value.trim() })}
          onBlur={(e) => e.currentTarget.value.trim() !== list.get('search') && list.set({ search: e.currentTarget.value.trim() })}
        />
        <select value={list.get('status')} onChange={(e) => list.set({ status: e.target.value })} aria-label="Status">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="FAILED">Failed</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <DateRange from={list.get('from')} to={list.get('to')} onChange={(from, to) => list.set({ from, to })} />
      </div>
      <ErrorBanner message={list.error || exportError} />
      <DataTable
        columns={COLUMNS}
        rows={list.data?.items}
        loading={list.loading}
        sortBy={list.get('sortBy')}
        sortOrder={list.get('sortOrder')}
        onSort={list.sort}
        rowKey={(p) => p.id}
        onRowClick={(p) => list.set({ open: p.id }, false)}
      />
      <Pager pagination={list.data?.pagination} onPage={(page) => list.set({ page }, false)} />
      {openId ? <PaymentModal id={openId} onClose={() => list.set({ open: undefined }, false)} /> : null}
    </div>
  );
}
