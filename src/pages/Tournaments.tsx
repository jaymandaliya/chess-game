import { useState, type FormEvent } from 'react';
import { CalendarClock, Play, Plus, Trophy, Users, XCircle } from 'lucide-react';
import { api } from '../api';
import { useApi, useList } from '../hooks';
import { Badge, DataTable, DetailList, ErrorBanner, Modal, Pager, SearchInput, type Column } from '../components';
import { dateTime, num } from '../format';

interface Side {
  userId: string;
  displayName: string;
  seed: number;
}

interface Pairing {
  _id?: string;
  id?: string;
  a: Side | null;
  b: Side | null;
  status: string;
  winnerId: string | null;
  decidedBy?: string;
  draws: number;
  gameIds: string[];
}

interface Tournament {
  id: string;
  name: string;
  description?: string;
  entryFee: number;
  timeControl: { label: string };
  maxPlayers: number;
  prizeSplit: number[];
  feePercent: number;
  roundMinutes: number;
  startsAt: string;
  status: string;
  playerCount: number;
  prizePool: number;
  feeCoins: number;
  players?: { userId: string; displayName: string; rating: number; seed?: number; eliminatedInRound?: number }[];
  rounds?: { number: number; deadlineAt: string; pairings: Pairing[] }[];
  payouts?: { userId: string; displayName: string; place: number; coins: number }[];
  cancelReason?: string;
}

const COLUMNS: Column<Tournament>[] = [
  { key: 'name', header: 'Tournament', render: (t) => (<span><strong>{t.name}</strong><div className="muted small">{t.timeControl.label} · knockout</div></span>) },
  { key: 'status', header: 'Status', render: (t) => <Badge value={t.status} /> },
  { key: 'players', header: 'Players', align: 'right', render: (t) => `${t.playerCount} / ${t.maxPlayers}` },
  { key: 'entryFee', header: 'Entry', align: 'right', render: (t) => (t.entryFee ? `${num(t.entryFee)} T-coins` : 'Free') },
  { key: 'prizePool', header: 'Pool', align: 'right', render: (t) => num(t.prizePool) },
  { key: 'startsAt', header: 'Starts', sortable: true, render: (t) => dateTime(t.startsAt) },
];

const ROUND_NAMES = (total: number, n: number) => (n === total ? 'Final' : n === total - 1 ? 'Semi-finals' : n === total - 2 ? 'Quarter-finals' : `Round ${n}`);

function Bracket({ t }: { t: Tournament }) {
  if (!t.rounds?.length) return <p className="muted">The bracket appears when the tournament starts.</p>;
  const totalRounds = Math.log2(Math.max(2, 2 ** Math.ceil(Math.log2(t.playerCount))));
  return (
    <div className="bracket">
      {t.rounds.map((r) => (
        <div key={r.number} className="bracket-round">
          <div className="bracket-title">{ROUND_NAMES(totalRounds, r.number)}</div>
          {r.pairings.map((p, i) => (
            <div key={p._id ?? p.id ?? i} className="pairing">
              {[p.a, p.b].map((s, j) => (
                <div key={j} className={`pairing-side${s && p.winnerId === s.userId ? ' win' : ''}`}>
                  <span>{s ? `${s.displayName}` : <span className="muted">bye</span>}</span>
                  <span className="muted small">{s ? `#${s.seed}` : ''}</span>
                </div>
              ))}
              <div className="pairing-meta">
                {p.status === 'DONE' ? `Decided by ${(p.decidedBy ?? '').toLowerCase()}` : p.status.toLowerCase()}
                {p.draws ? ` · ${p.draws} draw${p.draws > 1 ? 's' : ''}` : ''}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TournamentModal({ id, onClose, onChanged }: { id: string; onClose(): void; onChanged(): void }) {
  const { data: t, error, reload } = useApi<Tournament>(`/admin/tournaments/${id}`);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/admin/tournaments/${id}/${path}`, { method: 'POST', body });
      reload();
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      wide
      title={t?.name ?? 'Tournament'}
      onClose={onClose}
      footer={
        t && ['REGISTRATION', 'RUNNING'].includes(t.status) ? (
          <>
            <button
              type="button"
              className="danger-outline"
              disabled={busy}
              onClick={() => {
                const reason = window.prompt('Reason for cancelling (players are refunded):');
                if (reason && reason.trim().length >= 3) act('cancel', { reason: reason.trim() });
              }}
            >
              <XCircle size={15} /> Cancel & refund
            </button>
            {t.status === 'REGISTRATION' ? (
              <button type="button" className="primary" disabled={busy || t.playerCount < 2} onClick={() => act('start')}>
                <Play size={15} /> Start now
              </button>
            ) : null}
          </>
        ) : undefined
      }
    >
      <ErrorBanner message={error || actionError} />
      {t ? (
        <>
          <div className="stats-grid">
            <div className="stat-card"><span className="stat-label">Status</span><Badge value={t.status} /></div>
            <div className="stat-card"><span className="stat-label">Players</span><span className="stat-value">{t.playerCount}/{t.maxPlayers}</span></div>
            <div className="stat-card"><span className="stat-label">Prize pool</span><span className="stat-value">{num(t.prizePool)}</span></div>
            <div className="stat-card"><span className="stat-label">Platform fee</span><span className="stat-value">{t.feePercent}%</span></div>
          </div>
          <DetailList
            items={[
              ['Format', `Knockout · ${t.timeControl.label} · ${t.roundMinutes} min per round`],
              ['Entry', t.entryFee ? `${num(t.entryFee)} tournament coins` : 'Free'],
              ['Prize split', t.prizeSplit.map((p, i) => `${['1st', '2nd', '3rd–4th'][i]} ${p}%`).join(' · ')],
              ['Starts', dateTime(t.startsAt)],
              ...(t.cancelReason ? ([['Cancelled', t.cancelReason]] as [string, string][]) : []),
            ]}
          />
          {t.payouts?.length ? (
            <>
              <h3>Prizes paid (play coins)</h3>
              <ul className="plain">
                {t.payouts.map((p) => (
                  <li key={p.userId}>
                    {['', '🥇', '🥈', '🥉'][p.place]} {p.displayName}: <strong>{num(p.coins)}</strong> coins
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <h3>Bracket</h3>
          <Bracket t={t} />
          <h3>Players ({t.players?.length ?? 0})</h3>
          <div className="muted small">
            {(t.players ?? []).map((p) => `${p.seed ? `#${p.seed} ` : ''}${p.displayName} (${p.rating})`).join(' · ') || 'No players yet'}
          </div>
        </>
      ) : null}
    </Modal>
  );
}

function CreateModal({ onClose, onCreated }: { onClose(): void; onCreated(): void }) {
  const soon = new Date(Date.now() + 60 * 60 * 1000);
  const local = new Date(soon.getTime() - soon.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [form, setForm] = useState({
    name: '',
    description: '',
    entryFee: '30',
    timeControl: '5+0',
    maxPlayers: '8',
    first: '70',
    second: '30',
    third: '0',
    roundMinutes: '10',
    startsAt: local,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const split = [Number(form.first), Number(form.second), Number(form.third)].filter((n, i) => i === 0 || n > 0);
    setBusy(true);
    setError(null);
    try {
      await api('/admin/tournaments', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          ...(form.description.trim() ? { description: form.description.trim() } : {}),
          entryFee: Number(form.entryFee),
          timeControl: form.timeControl,
          maxPlayers: Number(form.maxPlayers),
          prizeSplit: split,
          roundMinutes: Number(form.roundMinutes),
          startsAt: new Date(form.startsAt).toISOString(),
        },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New tournament" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <ErrorBanner message={error} />
        <label>
          Name
          <input value={form.name} onChange={set('name')} required minLength={3} maxLength={60} placeholder="Sunday Blitz Cup" />
        </label>
        <label>
          Description (optional)
          <input value={form.description} onChange={set('description')} maxLength={300} />
        </label>
        <div className="form-row three">
          <label>
            Entry (tournament coins)
            <input type="number" min={0} value={form.entryFee} onChange={set('entryFee')} required />
          </label>
          <label>
            Time control
            <select value={form.timeControl} onChange={set('timeControl')}>
              {['1+0', '3+0', '3+2', '5+0', '10+0', '15+10'].map((tc) => <option key={tc}>{tc}</option>)}
            </select>
          </label>
          <label>
            Players
            <select value={form.maxPlayers} onChange={set('maxPlayers')}>
              {[4, 8, 16, 32].map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="section-title">Prize split (% of pool after platform fee)</div>
        <div className="form-row three">
          <label>1st<input type="number" min={0} max={100} value={form.first} onChange={set('first')} /></label>
          <label>2nd<input type="number" min={0} max={100} value={form.second} onChange={set('second')} /></label>
          <label>3rd–4th (shared)<input type="number" min={0} max={100} value={form.third} onChange={set('third')} /></label>
        </div>
        <div className="form-row">
          <label>
            Starts at
            <input type="datetime-local" value={form.startsAt} onChange={set('startsAt')} required />
          </label>
          <label>
            Minutes per round
            <input type="number" min={3} max={120} value={form.roundMinutes} onChange={set('roundMinutes')} />
          </label>
        </div>
        <p className="muted small">
          Starts automatically when full, or at the start time with at least 2 players (otherwise it is cancelled and entries refunded).
          Players who do not show up before a round's time runs out forfeit.
        </p>
        <footer className="form-footer">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>
            <Plus size={15} /> {busy ? 'Creating…' : 'Create tournament'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export default function Tournaments() {
  const list = useList<Tournament>('/admin/tournaments', { sortBy: 'startsAt', sortOrder: 'desc', limit: '20' });
  const [creating, setCreating] = useState(false);
  const openId = list.get('open');

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1><Trophy size={22} /> Tournaments</h1>
          <p>Knockout events paid with tournament coins. Prizes are credited as play coins.</p>
        </div>
        <button type="button" className="primary" onClick={() => setCreating(true)}>
          <Plus size={15} /> New tournament
        </button>
      </header>
      <div className="toolbar">
        <SearchInput value={list.get('search')} placeholder="Search by name" onSearch={(search) => list.set({ search })} />
        <select value={list.get('status')} onChange={(e) => list.set({ status: e.target.value })} aria-label="Status">
          <option value="">All statuses</option>
          <option value="REGISTRATION">Registration</option>
          <option value="RUNNING">Running</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <span className="spacer" />
        <span className="muted small"><Users size={13} /> <CalendarClock size={13} /> Click a row for the bracket</span>
      </div>
      <ErrorBanner message={list.error} />
      <DataTable
        columns={COLUMNS}
        rows={list.data?.items}
        loading={list.loading}
        sortBy={list.get('sortBy')}
        sortOrder={list.get('sortOrder')}
        onSort={list.sort}
        rowKey={(t) => t.id}
        onRowClick={(t) => list.set({ open: t.id }, false)}
        empty="No tournaments yet. Create the first one."
      />
      <Pager pagination={list.data?.pagination} onPage={(page) => list.set({ page }, false)} />
      {creating ? <CreateModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); list.reload(); }} /> : null}
      {openId ? <TournamentModal id={openId} onClose={() => list.set({ open: undefined }, false)} onChanged={list.reload} /> : null}
    </div>
  );
}
