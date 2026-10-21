import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/players', label: 'Players' },
  { to: '/coin-packages', label: 'Coin packages' },
  { to: '/payments', label: 'Payments' },
  { to: '/game-activity', label: 'Game activity' },
  { to: '/reports', label: 'Reports' },
  { to: '/audit-logs', label: 'Audit logs' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span aria-hidden>♞</span> Chess Admin
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="me">
          <div className="me-name">{user?.displayName}</div>
          <div className="me-role">{user?.role.replace('_', ' ')}</div>
          <button type="button" className="link" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
