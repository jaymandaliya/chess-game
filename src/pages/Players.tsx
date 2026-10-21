import { useNavigate } from 'react-router-dom';
import { useList } from '../hooks';
import { Users } from 'lucide-react';
import { Badge, DataTable, ErrorBanner, Pager, SearchInput, UserCell, type Column } from '../components';
import { date, dateTime, num } from '../format';

export interface PlayerRow {
  id: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
  rating: number;
  createdAt: string;
  lastActiveAt?: string;
}

const COLUMNS: Column<PlayerRow>[] = [
  { key: 'displayName', header: 'Player', sortable: true, render: (p) => <UserCell name={p.displayName} sub={p.email} /> },
  { key: 'role', header: 'Role', render: (p) => <Badge value={p.role} /> },
  { key: 'status', header: 'Status', render: (p) => <Badge value={p.status} /> },
  { key: 'rating', header: 'Rating', sortable: true, align: 'right', render: (p) => num(p.rating) },
  { key: 'createdAt', header: 'Joined', sortable: true, render: (p) => date(p.createdAt) },
  { key: 'lastActiveAt', header: 'Last active', sortable: true, render: (p) => dateTime(p.lastActiveAt) },
];

export default function Players() {
  const navigate = useNavigate();
  const list = useList<PlayerRow>('/admin/players', { sortBy: 'createdAt', sortOrder: 'desc', limit: '20' });

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1><Users size={22} /> Players</h1>
          <p>Search, filter and open any player for their full activity and coin ledger.</p>
        </div>
      </header>
      <div className="toolbar">
        <SearchInput value={list.get('search')} placeholder="Search name or email" onSearch={(search) => list.set({ search })} />
        <select value={list.get('status')} onChange={(e) => list.set({ status: e.target.value })} aria-label="Status">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <select value={list.get('role') || 'PLAYER'} onChange={(e) => list.set({ role: e.target.value })} aria-label="Role">
          <option value="PLAYER">Players</option>
          <option value="ADMIN">Admins</option>
          <option value="SUPER_ADMIN">Super admins</option>
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
        rowKey={(p) => p.id}
        onRowClick={(p) => navigate(`/players/${p.id}`)}
      />
      <Pager pagination={list.data?.pagination} onPage={(page) => list.set({ page }, false)} />
    </div>
  );
}
