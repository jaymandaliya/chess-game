import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Layout from './Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Players from './pages/Players';
import PlayerDetail from './pages/PlayerDetail';
import CoinPackages from './pages/CoinPackages';
import Payments from './pages/Payments';
import GameActivity from './pages/GameActivity';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import Account from './pages/Account';
import Tournaments from './pages/Tournaments';
import Kyc from './pages/Kyc';
import Withdrawals from './pages/Withdrawals';
import RevenueLogs from './pages/RevenueLogs';
import './styles.css';

function App() {
  const { user, booting } = useAuth();
  if (booting) return <div className="boot">Loading…</div>;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="players" element={<Players />} />
        <Route path="players/:id" element={<PlayerDetail />} />
        <Route path="coin-packages" element={<CoinPackages />} />
        <Route path="payments" element={<Payments />} />
        <Route path="game-activity" element={<GameActivity />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="settings" element={<Settings />} />
        <Route path="reports" element={<Reports />} />
        <Route path="account" element={<Account />} />
        <Route path="tournaments" element={<Tournaments />} />
        <Route path="kyc" element={<Kyc />} />
        <Route path="withdrawals" element={<Withdrawals />} />
        <Route path="revenue-logs" element={<RevenueLogs />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
