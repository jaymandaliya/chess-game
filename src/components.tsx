import { useEffect, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Pagination as PageInfo } from './api';

export type Tone = 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'gold' | 'grey';

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
                    {sortBy === c.key ? sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} /> : null}
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
          {!rows && loading ? (
            <tr>
              <td colSpan={columns.length} className="empty">
                Loading…
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
        Previous
      </button>
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

const BADGE: Record<string, Tone | 'purple'> = {
  ACTIVE: 'green', PAID: 'green', COMPLETED: 'green', SUCCESS: 'green', APPROVED: 'green', WIN: 'green',
  SUSPENDED: 'red', FAILED: 'red', FAILURE: 'red', REJECTED: 'red', CANCELLED: 'red', LOSS: 'red',
  PENDING: 'amber', ONGOING: 'amber', REGISTRATION: 'blue', RUNNING: 'amber', WAITING: 'amber', PLAYING: 'blue',
  REFUNDED: 'violet', SUPER_ADMIN: 'violet', ADMIN: 'blue', PLAYER: 'grey', DRAW: 'grey', ABORTED: 'grey', DISABLED: 'grey',
  PLAY: 'green', TOURNAMENT: 'gold', TOURNAMENT_MODE: 'gold',
};

export function Badge({ value, label }: { value?: string | null; label?: string }) {
  if (!value) return <span className="muted">—</span>;
  const tone = BADGE[value] ?? 'grey';
  return <span className={`badge ${tone === 'violet' ? 'purple' : tone}`}>{label ?? value.replace(/_/g, ' ')}</span>;
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose(): void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal wide' : 'modal'} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </div>
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'green' }: { label: string; value: ReactNode; hint?: string; icon?: LucideIcon; tone?: Tone }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {Icon ? (
          <span className={`stat-icon tone-${tone}`}>
            <Icon size={17} />
          </span>
        ) : null}
      </div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}

const AVATAR_TONES: Tone[] = ['green', 'blue', 'violet', 'amber', 'gold', 'red'];
export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (
    <span className={`avatar tone-${AVATAR_TONES[h % AVATAR_TONES.length]}`} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

export function UserCell({ name, sub }: { name: string; sub?: string }) {
  return (
    <span className="cell-user">
      <Avatar name={name} />
      <span>
        <div style={{ fontWeight: 600 }}>{name}</div>
        {sub ? <div className="muted small">{sub}</div> : null}
      </span>
    </span>
  );
}

export function SearchInput({ value, placeholder, onSearch }: { value: string; placeholder: string; onSearch(v: string): void }) {
  return (
    <label className="search" aria-label={placeholder}>
      <Search size={16} />
      <input
        type="search"
        placeholder={placeholder}
        defaultValue={value}
        onKeyDown={(e) => e.key === 'Enter' && onSearch(e.currentTarget.value.trim())}
        onBlur={(e) => e.currentTarget.value.trim() !== value && onSearch(e.currentTarget.value.trim())}
      />
    </label>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange(t: T): void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={t.key === value} className={t.key === value ? 'active' : undefined} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
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

// Minimal SVG bar chart; values shown on hover via <title>
export function BarChart({ data, format = String, height = 190 }: { data: { label: string; value: number }[]; format?(v: number): string; height?: number }) {
  if (!data.length) return <div className="chart-empty">No data for this period</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const barW = 100 / data.length;
  return (
    <div className="chart">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label="Bar chart">
        {data.map((d, i) => {
          const h = Math.max((d.value / max) * (height - 4), d.value > 0 ? 2 : 0);
          return (
            <rect key={d.label} x={i * barW + barW * 0.18} y={height - h} width={barW * 0.64} height={h} rx={0.6} className="bar">
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="chart-axis">
        <span>{data[0].label}</span>
        <span>peak {format(max)}</span>
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
