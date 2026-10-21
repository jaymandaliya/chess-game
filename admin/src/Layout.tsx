import { NavLink, Outlet } from 'react-router-dom';
import {
  BadgeCheck,
  BarChart3,
  Banknote,
  Coins,
  CreditCard,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  ScrollText,
  Settings,
  Swords,
  Trophy,
  UserCog,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from './auth';
import { useApi } from './hooks';

interface Counters {
  pendingKyc: number;
  pendingWithdrawals: number;
  activeTournaments: number;
}

const GROUPS: { label: string; items: { to: string; label: string; icon: LucideIcon; end?: boolean; badge?: keyof Counters }[] }[] = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/revenue-logs', label: 'Revenue logs', icon: ReceiptText },
    ],
  },
  {
    label: 'Players',
    items: [
      { to: '/players', label: 'Players', icon: Users },
      { to: '/kyc', label: 'KYC review', icon: BadgeCheck, badge: 'pendingKyc' },
      { to: '/withdrawals', label: 'Withdrawals', icon: Banknote, badge: 'pendingWithdrawals' },
    ],
  },
  {
    label: 'Play',
    items: [
      { to: '/tournaments', label: 'Tournaments', icon: Trophy, badge: 'activeTournaments' },
      { to: '/game-activity', label: 'Game activity', icon: Swords },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { to: '/coin-packages', label: 'Coin packages', icon: Coins },
      { to: '/payments', label: 'Payments', icon: CreditCard },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/audit-logs', label: 'Audit logs', icon: ScrollText },
      { to: '/settings', label: 'Settings', icon: Settings },
      { to: '/account', label: 'My account', icon: UserCog },
    ],
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { data: counters } = useApi<Counters>('/admin/dashboard');
  const initials = (user?.displayName ?? '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ♞
          </span>
          Chess Admin
        </div>
        <nav className="nav">
          {GROUPS.map((g) => (
            <div key={g.label} className="nav-group">
              <div className="nav-label">{g.label}</div>
              {g.items.map(({ to, label, icon: Icon, end, badge }) => {
                const count = badge && counters ? counters[badge] : 0;
                return (
                  <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                    <Icon size={17} />
                    {label}
                    {count ? <span className="nav-badge">{count}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="me">
          <span className="me-avatar">{initials}</span>
          <div className="me-info">
            <div className="me-name">{user?.displayName}</div>
            <div className="me-role">{user?.role.replace('_', ' ')}</div>
          </div>
          <button type="button" className="icon" onClick={logout} aria-label="Sign out" title="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
