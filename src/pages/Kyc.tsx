import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Check, ShieldAlert, X } from 'lucide-react';
import { api } from '../api';
import { useApi, useList } from '../hooks';
import { Badge, DataTable, DetailList, ErrorBanner, Modal, Pager, SearchInput, UserCell, type Column } from '../components';
import { date, dateTime } from '../format';

interface KycRow {
  id: string;
  status: string;
  fullName: string;
  pan: string;
  payoutMethod: string;
  payoutTo: string;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  user: { id: string; displayName: string; email: string } | null;
}

interface KycFull extends KycRow {
  userId: string;
  dateOfBirth: string;
  upiId: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  accountHolderName: string | null;
}

const COLUMNS: Column<KycRow>[] = [
  { key: 'user', header: 'Player', render: (k) => <UserCell name={k.user?.displayName ?? '—'} sub={k.user?.email} /> },
  { key: 'fullName', header: 'Legal name', render: (k) => k.fullName },
  { key: 'pan', header: 'PAN', render: (k) => <code>{k.pan}</code> },
  { key: 'payout', header: 'Payout to', render: (k) => `${k.payoutMethod} · ${k.payoutTo}` },
  { key: 'status', header: 'Status', render: (k) => <Badge value={k.status} /> },
  { key: 'submittedAt', header: 'Submitted', sortable: true, render: (k) => dateTime(k.submittedAt) },
];

function ReviewModal({ userId, onClose, onDone }: { userId: string; onClose(): void; onDone(): void }) {
  // Opening this reveals full identity details and is recorded in the audit log
  const { data: k, error } = useApi<KycFull>(`/admin/kyc/${userId}`);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function decide(status: 'APPROVED' | 'REJECTED') {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/admin/kyc/${userId}`, { method: 'PATCH', body: { status, ...(reason.trim() ? { reason: reason.trim() } : {}) } });
      onDone();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="KYC review"
      onClose={onClose}
      footer={
        k?.status === 'PENDING' ? (
          <>
            <button type="button" className="danger-outline" disabled={busy} onClick={() => decide('REJECTED')}>
              <X size={15} /> Reject
            </button>
            <button type="button" className="primary" disabled={busy} onClick={() => decide('APPROVED')}>
              <Check size={15} /> Approve
            </button>
          </>
        ) : undefined
      }
    >
      <ErrorBanner message={error || actionError} />
      <div className="notice">
        <ShieldAlert size={16} /> Full identity details. Viewing this is recorded in the audit log.
      </div>
      {k ? (
        <>
          <DetailList
            items={[
              ['Status', <Badge value={k.status} />],
              ['Player', <Link to={`/players/${k.userId}`}>Open profile</Link>],
              ['Legal name', k.fullName],
              ['Date of birth', date(k.dateOfBirth)],
              ['PAN', <code>{k.pan}</code>],
              ['Payout method', k.payoutMethod],
              ...(k.payoutMethod === 'UPI'
                ? ([['UPI ID', <code>{k.upiId}</code>]] as [string, ReactNode][])
                : ([
                    ['Account holder', k.accountHolderName],
                    ['Account number', <code>{k.bankAccount}</code>],
                    ['IFSC', <code>{k.ifsc}</code>],
                  ] as [string, ReactNode][])),
              ['Submitted', dateTime(k.submittedAt)],
              ['Reviewed', dateTime(k.reviewedAt)],
              ...(k.rejectionReason ? ([['Rejection reason', k.rejectionReason]] as [string, string][]) : []),
            ]}
          />
          {k.status === 'PENDING' ? (
            <label>
              Reason (required to reject; shown to the player)
              <textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Name does not match PAN" />
            </label>
          ) : null}
          <p className="muted small">Check the PAN and name against the player's documents (or a PAN verification service) before approving.</p>
        </>
      ) : null}
    </Modal>
  );
}

export default function Kyc() {
  const list = useList<KycRow>('/admin/kyc', { sortBy: 'submittedAt', sortOrder: 'desc', limit: '20' });
  const openUser = list.get('open');

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1><BadgeCheck size={22} /> KYC review</h1>
          <p>Identity and payout details players submit before they can withdraw.</p>
        </div>
      </header>
      <div className="toolbar">
        <SearchInput value={list.get('search')} placeholder="Player name or email" onSearch={(search) => list.set({ search })} />
        <select value={list.get('status')} onChange={(e) => list.set({ status: e.target.value })} aria-label="Status">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>
      <ErrorBanner message={list.error} />
      <DataTable
        columns={COLUMNS}
        rows={list.data?.items}
        loading={list.loading}
        sortBy={list.get('sortBy')}
        sortOrder={list.get('sortOrder')}
        onSort={list.sort}
        rowKey={(k) => k.id}
        onRowClick={(k) => k.user && list.set({ open: k.user.id }, false)}
        empty="No KYC submissions."
      />
      <Pager pagination={list.data?.pagination} onPage={(page) => list.set({ page }, false)} />
      {openUser ? (
        <ReviewModal
          userId={openUser}
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
