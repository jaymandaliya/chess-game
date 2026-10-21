import { useEffect, type ReactNode } from 'react';
import type { Pagination as PageInfo } from './api';

export interface Column<T> {
  key: string;
  header: string;
  render(row: T): ReactNode;
  sortable?: boolean;
  align?: 'right';
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  sortBy?: string;
  sortOrder?: string;
  onSort?(key: string): void;
  onRowClick?(row: T): void;
  rowKey(row: T): string;
  empty?: string;
}

export function DataTable<T>({ columns, rows, loading, sortBy, sortOrder, onSort, onRowClick, rowKey, empty = 'No records found' }: TableProps<T>) {
  return (
    <div className="table-wrap">
      <table className={loading ? 'table loading' : 'table'}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === 'right' ? 'right' : undefined}>
                {c.sortable && onSort ? (
                  <button type="button" className="sort" onClick={() => onSort(c.key)}>
                    {c.header}
                    <span aria-hidden>{sortBy === c.key ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows?.map((row) => (
            <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? 'clickable' : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'right' : undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows && rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty">
                {empty}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ pagination, onPage }: { pagination?: PageInfo; onPage(page: number): void }) {
  if (!pagination) return null;
  const { page, totalPages, total, limit } = pagination;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="pager">
      <span>
        {from}–{to} of {total.toLocaleString('en-IN')}
      </span>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹ Prev
      </button>
      <span>
        Page {page} / {Math.max(totalPages, 1)}
      </span>
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next ›
      </button>
    </div>
  );
}

const BADGE: Record<string, string> = {
  ACTIVE: 'green', PAID: 'green', COMPLETED: 'green', SUCCESS: 'green', WHITE_WIN: 'neutral', BLACK_WIN: 'neutral',
  SUSPENDED: 'red', FAILED: 'red', FAILURE: 'red', ABORTED: 'grey',
  PENDING: 'amber', ONGOING: 'amber', REFUNDED: 'purple', DRAW: 'grey',
  SUPER_ADMIN: 'purple', ADMIN: 'blue', PLAYER: 'grey',
};

export function Badge({ value }: { value?: string | null }) {
  if (!value) return <span className="muted">—</span>;
  return <span className={`badge ${BADGE[value] ?? 'grey'}`}>{value.replace(/_/g, ' ')}</span>;
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose(): void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </div>
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string | null }) {
  return message ? <div className="error-banner">{message}</div> : null;
}

export function DetailList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="details">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

// Minimal SVG bar chart: one series, labels on hover via <title>
export function BarChart({ data, format = String, height = 180 }: { data: { label: string; value: number }[]; format?(v: number): string; height?: number }) {
  if (!data.length) return <div className="chart-empty">No data for this period</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const barW = 100 / data.length;
  return (
    <div className="chart">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label="Bar chart">
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 4);
          return (
            <rect key={d.label} x={i * barW + barW * 0.15} y={height - h} width={barW * 0.7} height={h} className="bar">
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="chart-axis">
        <span>{data[0].label}</span>
        <span>max {format(max)}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange(from: string, to: string): void }) {
  return (
    <>
      <label className="inline">
        From <input type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} />
      </label>
      <label className="inline">
        To <input type="date" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} />
      </label>
    </>
  );
}
