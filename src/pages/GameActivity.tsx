import { Link } from 'react-router-dom';
import { useApi, useList } from '../hooks';
import { Badge, DataTable, DateRange, DetailList, ErrorBanner, Modal, Pager, type Column } from '../components';
import { dateTime, humanize, num } from '../format';

interface Side {
  userId: string | null;
  displayName: string;
  ratingBefore?: number;
  ratingAfter?: number;
}

interface MatchRow {
  id: string;
  white: Side;
  black: Side;
  mode: string;
  timeControl: { label?: string; initialSeconds: number; incrementSeconds: number };
  status: string;
  result?: string;
  termination?: string;
  moveCount: number;
  startedAt: string;
  endedAt?: string;
  pgn?: string;
}

function sideLabel(s: Side) {
  const change = s.ratingAfter != null && s.ratingBefore != null ? s.ratingAfter - s.ratingBefore : null;
  return (
    <>
      {s.userId ? <Link to={`/players/${s.userId}`} onClick={(e) => e.stopPropagation()}>{s.displayName}</Link> : s.displayName}
      {s.ratingBefore != null ? <span className="muted small"> {s.ratingBefore}</span> : null}
      {change !== null ? <span className={change >= 0 ? 'pos small' : 'neg small'}> {change >= 0 ? '+' : ''}{change}</span> : null}
    </>
  );
}

const COLUMNS: Column<MatchRow>[] = [
  { key: 'white', header: 'White', render: (m) => sideLabel(m.white) },
  { key: 'black', header: 'Black', render: (m) => sideLabel(m.black) },
  { key: 'mode', header: 'Mode', render: (m) => `${humanize(m.mode)} · ${m.timeControl.label ?? ''}` },
  { key: 'status', header: 'Status', render: (m) => <Badge value={m.status} /> },
  { key: 'result', header: 'Result', render: (m) => (m.result ? `${humanize(m.result)}${m.termination ? ` · ${humanize(m.termination)}` : ''}` : '—') },
  { key: 'moveCount', header: 'Moves', sortable: true, align: 'right', render: (m) => num(m.moveCount) },
  { key: 'startedAt', header: 'Started', sortable: true, render: (m) => dateTime(m.startedAt) },
];

function MatchModal({ id, onClose }: { id: string; onClose(): void }) {
  const { data, error } = useApi<MatchRow>(`/admin/game-activity/${id}`);
  return (
    <Modal title="Match" onClose={onClose}>
      <ErrorBanner message={error} />
      {data ? (
        <>
          <DetailList
            items={[
              ['Match ID', <code>{data.id}</code>],
              ['White', sideLabel(data.white)],
              ['Black', sideLabel(data.black)],
              ['Mode', humanize(data.mode)],
              ['Time control', data.timeControl.label],
              ['Status', <Badge value={data.status} />],
              ['Result', humanize(data.result)],
              ['Termination', humanize(data.termination)],
              ['Moves', num(data.moveCount)],
              ['Started', dateTime(data.startedAt)],
              ['Ended', dateTime(data.endedAt)],
            ]}
          />
          <h3>PGN</h3>
          <pre className="pgn">{data.pgn || 'No moves recorded'}</pre>
        </>
      ) : null}
    </Modal>
  );
}

export default function GameActivity() {
  const list = useList<MatchRow>('/admin/game-activity', { sortBy: 'startedAt', sortOrder: 'desc', limit: '20' });
  const openId = list.get('open');
  return (
    <div className="page">
      <header className="page-header">
        <h1>Game activity</h1>
      </header>
      <p className="muted">Match records for reporting. Live games appear as ONGOING.</p>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Player name"
          defaultValue={list.get('search')}
          onKeyDown={(e) => e.key === 'Enter' && list.set({ search: e.currentTarget.value.trim() })}
          onBlur={(e) => e.currentTarget.value.trim() !== list.get('search') && list.set({ search: e.currentTarget.value.trim() })}
        />
        <select value={list.get('status')} onChange={(e) => list.set({ status: e.target.value })} aria-label="Status">
          <option value="">All statuses</option>
          <option value="ONGOING">Ongoing</option>
          <option value="COMPLETED">Completed</option>
          <option value="ABORTED">Aborted</option>
        </select>
        <select value={list.get('mode')} onChange={(e) => list.set({ mode: e.target.value })} aria-label="Mode">
          <option value="">All modes</option>
          <option value="RATED">Rated</option>
          <option value="CASUAL">Casual</option>
          <option value="VS_COMPUTER">Vs computer</option>
        </select>
        <select value={list.get('result')} onChange={(e) => list.set({ result: e.target.value })} aria-label="Result">
          <option value="">All results</option>
          <option value="WHITE_WIN">White won</option>
          <option value="BLACK_WIN">Black won</option>
          <option value="DRAW">Draw</option>
        </select>
        <DateRange from={list.get('from')} to={list.get('to')} onChange={(from, to) => list.set({ from, to })} />
        {list.get('playerId') ? (
          <button type="button" onClick={() => list.set({ playerId: undefined })}>
            Clear player filter ×
          </button>
        ) : null}
      </div>
      <ErrorBanner message={list.error} />
      <DataTable
        columns={COLUMNS}
        rows={list.data?.items}
        loading={list.loading}
        sortBy={list.get('sortBy')}
        sortOrder={list.get('sortOrder')}
        onSort={list.sort}
        rowKey={(m) => m.id}
        onRowClick={(m) => list.set({ open: m.id }, false)}
      />
      <Pager pagination={list.data?.pagination} onPage={(page) => list.set({ page }, false)} />
      {openId ? <MatchModal id={openId} onClose={() => list.set({ open: undefined }, false)} /> : null}
    </div>
  );
}
