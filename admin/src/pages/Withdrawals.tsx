import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Check, X } from 'lucide-react';
import { api } from '../api';
import { useApi, useList } from '../hooks';
import { Badge, DataTable, DateRange, DetailList, ErrorBanner, Modal, Pager, SearchInput, UserCell, type Column } from '../components';
import { dateTime, num, rupees } from '../format';

interface WithdrawalRow {
  id: string;
  requestNumber: string;
  userId: { _id?: string; id?: string; displayName: string; email: string } | string;
  coins: number;
  coinValuePaise: number;
  grossPaise: number;
  tdsPercent: number;
  tdsPaise: number;
  netPaise: number;
  payoutMethod: string;
  payoutTo: string;
  status: string;
  payoutReference?: string;
  rejectionReason?: string;
  createdAt: string;
  reviewedAt?: string;
}

const userOf = (w: WithdrawalRow) => (typeof w.userId === 'object' ? w.userId : null);

const COLUMNS: Column<WithdrawalRow>[] = [
  { key: 'requestNumber', header: 'Request', render: (w) => <code>{w.requestNumber}</code> },
  { key: 'user', header: 'Player', render: (w) => <UserCell name={userOf(w)?.displayName ?? '—'} sub={userOf(w)?.email} /> },
  { key: 'coins', header: 'Coins', align: 'right', render: (w) => num(w.coins) },
  { key: 'netPaise', header: 'Pay out', sortable: true, align: 'right', render: (w) => <strong>{rupees(w.netPaise)}</strong> },
  { key: 'payout', header: 'To', render: (w) => `${w.payoutMethod} · ${w.payoutTo}` },
  { key: 'status', header: 'Status', render: (w) => <Badge value={w.status} /> },
  { key: 'createdAt', header: 'Requested', sortable: true, render: (w) => dateTime(w.createdAt) },
];

function ReviewModal({ id, onClose, onDone }: { id: string; onClose(): void; onDone(): void }) {
  const { data: w, error } = useApi<WithdrawalRow>(`/admin/withdrawals/${id}`);
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function decide(action: 'PAY' | 'REJECT') {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/admin/withdrawals/${id}`, {
        method: 'PATCH',
        body: action === 'PAY' ? { action, payoutReference: reference.trim() } : { action, reason: reason.trim() },
      });
      onDone();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  const u = w ? userOf(w) : null;
  return (
    <Modal
      title={w ? `Withdrawal ${w.requestNumber}` : 'Withdrawal'}
      onClose={onClose}
      footer={
        w?.status === 'PENDING' ? (
          <>
            <button type="button" className="danger-outline" disabled={busy || reason.trim().length < 3} onClick={() => decide('REJECT')}>
              <X size={15} /> Reject & refund coins
            </button>
            <button type="button" className="primary" disabled={busy || reference.trim().length < 3} onClick={() => decide('PAY')}>
              <Check size={15} /> Mark as paid
            </button>
          </>
        ) : undefined
      }
    >
      <ErrorBanner message={error || actionError} />
      {w ? (
        <>
          <DetailList
            items={[
              ['Status', <Badge value={w.status} />],
              ['Player', u ? <Link to={`/players/${u._id ?? u.id}`}>{u.displayName}</Link> : '—'],
              ['Coins', num(w.coins)],
              ['Rate', `${rupees(w.coinValuePaise)} per coin`],
              ['Gross', rupees(w.grossPaise)],
              ['TDS', `${w.tdsPercent}% · ${rupees(w.tdsPaise)}`],
              ['Pay to player', <strong>{rupees(w.netPaise)}</strong>],
              ['Destination', `${w.payoutMethod} · ${w.payoutTo}`],
              ['Requested', dateTime(w.createdAt)],
              ['Reviewed', dateTime(w.reviewedAt)],
              ...(w.payoutReference ? ([['Payout reference', <code>{w.payoutReference}</code>]] as [string, ReactNode][]) : []),
              ...(w.rejectionReason ? ([['Rejection reason', w.rejectionReason]] as [string, string][]) : []),
            ]}
          />
          {w.status === 'PENDING' ? (
            <>
              <p className="muted small">
                Send {rupees(w.netPaise)} to the player's verified {w.payoutMethod === 'UPI' ? 'UPI ID' : 'bank account'} (full details on their KYC page), then
                enter the bank/UPI transaction reference. Deposit the TDS with the tax department separately.
              </p>
              <div className="form-row">
                <label>
                  Payout reference (UTR)
                  <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 4321XXXX9876" />
                </label>
                <label>
                  Rejection reason
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shown to the player" />
                </label>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}

export default function Withdrawals() {
  const list = useList<WithdrawalRow>('/admin/withdrawals', { sortBy: 'createdAt', sortOrder: 'desc', limit: '20' });
  const openId = list.get('open');
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1><Banknote size={22} /> Withdrawals</h1>
          <p>Coins converted to money. Coins are held while a request is pending; rejecting returns them.</p>
        </div>
      </header>
      <div className="toolbar">
        <SearchInput value={list.get('search')} placeholder="Request no., player name or email" onSearch={(search) => list.set({ search })} />
        <select value={list.get('status')} onChange={(e) => list.set({ status: e.target.value })} aria-label="Status">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <DateRange from={list.get('from')} to={list.get('to')} onChange={(from, to) => list.set({ from, to })} />
      </div>
      <ErrorBanner message={list.error} />
      <DataTable
        columns={COLUMNS}
        rows={list.data?.items}
        loading={list.loading}
        sortBy={list.get('sortBy')}
        sortOrder={list.get('sortOrder')}
        onSort={list.sort}
        rowKey={(w) => w.id}
        onRowClick={(w) => list.set({ open: w.id }, false)}
        empty="No withdrawal requests."
      />
      <Pager pagination={list.data?.pagination} onPage={(page) => list.set({ page }, false)} />
      {openId ? (
        <ReviewModal
          id={openId}
          onClose={() => list.set({ open: undefined }, false)}
          onDone={() => {
            list.set({ open: undefined }, false);
            list.reload();
          }}
        />
      ) : null}
    </div>
  );
}
