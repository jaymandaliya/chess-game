import { useState } from 'react';
import { download, qs } from '../api';
import { useApi, useList } from '../hooks';
import { Badge, DataTable, DateRange, DetailList, ErrorBanner, Modal, Pager, type Column } from '../components';
import { dateTime, dayEndIso, dayStartIso, humanize } from '../format';

interface AuditRow {
  id: string;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  outcome: string;
  metadata?: unknown;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

const ACTIONS = [
  'ADMIN_LOGIN', 'PLAYER_SUSPENDED', 'PLAYER_ACTIVATED', 'ROLE_CHANGED', 'PACKAGE_CREATED', 'PACKAGE_UPDATED',
  'PACKAGE_PRICE_CHANGED', 'PACKAGE_ENABLED', 'PACKAGE_DISABLED', 'SETTINGS_UPDATED', 'REPORT_EXPORTED',
  'PAYMENT_CAPTURED', 'PAYMENT_REFUNDED', 'PAYMENT_VERIFY_FAILED', 'PASSWORD_RESET',
];

const COLUMNS: Column<AuditRow>[] = [
  { key: 'createdAt', header: 'Time', sortable: true, render: (l) => dateTime(l.createdAt) },
  { key: 'actor', header: 'Actor', render: (l) => (<>{l.actorEmail ?? <span className="muted">system</span>}{l.actorRole ? <div className="muted small">{l.actorRole}</div> : null}</>) },
  { key: 'action', header: 'Action', render: (l) => <strong>{humanize(l.action)}</strong> },
  { key: 'target', header: 'Target', render: (l) => (l.targetType ? <>{humanize(l.targetType)} <code className="small">{l.targetId}</code></> : '—') },
  { key: 'outcome', header: 'Outcome', render: (l) => <Badge value={l.outcome} /> },
];

function AuditModal({ id, onClose }: { id: string; onClose(): void }) {
  const { data, error } = useApi<AuditRow>(`/admin/audit-logs/${id}`);
  return (
    <Modal title="Audit event" onClose={onClose}>
      <ErrorBanner message={error} />
      {data ? (
        <>
          <DetailList
            items={[
              ['Time', dateTime(data.createdAt)],
              ['Actor', data.actorEmail ?? 'system'],
              ['Role', data.actorRole],
              ['Action', data.action],
              ['Target', data.targetType ? `${data.targetType} ${data.targetId ?? ''}` : '—'],
              ['Outcome', <Badge value={data.outcome} />],
              ['IP address', data.ip],
              ['User agent', <span className="small">{data.userAgent}</span>],
            ]}
          />
          <h3>Details</h3>
          <pre className="pgn">{data.metadata ? JSON.stringify(data.metadata, null, 2) : 'None'}</pre>
        </>
      ) : null}
    </Modal>
  );
}

export default function AuditLogs() {
  const list = useList<AuditRow>('/admin/audit-logs', { sortBy: 'createdAt', sortOrder: 'desc', limit: '25' });
  const [exportError, setExportError] = useState<string | null>(null);
  const openId = list.get('open');

  async function exportCsv() {
    setExportError(null);
    try {
      await download(
        `/admin/reports/export${qs({
          type: 'audit-logs',
          action: list.get('action'),
          outcome: list.get('outcome'),
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
        <h1>Audit logs</h1>
        <button type="button" onClick={exportCsv}>Export CSV</button>
      </header>
      <p className="muted">Append-only record of sensitive actions. Entries cannot be edited or deleted.</p>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Actor email or action"
          defaultValue={list.get('search')}
          onKeyDown={(e) => e.key === 'Enter' && list.set({ search: e.currentTarget.value.trim() })}
          onBlur={(e) => e.currentTarget.value.trim() !== list.get('search') && list.set({ search: e.currentTarget.value.trim() })}
        />
        <select value={list.get('action')} onChange={(e) => list.set({ action: e.target.value })} aria-label="Action">
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{humanize(a)}</option>
          ))}
        </select>
        <select value={list.get('outcome')} onChange={(e) => list.set({ outcome: e.target.value })} aria-label="Outcome">
          <option value="">All outcomes</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILURE">Failure</option>
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
        rowKey={(l) => l.id}
        onRowClick={(l) => list.set({ open: l.id }, false)}
      />
      <Pager pagination={list.data?.pagination} onPage={(page) => list.set({ page }, false)} />
      {openId ? <AuditModal id={openId} onClose={() => list.set({ open: undefined }, false)} /> : null}
    </div>
  );
}
