import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as client from './api';
import type { SessionUser } from './api';

interface AuthState {
  user: SessionUser | null;
  booting: boolean;
  isSuperAdmin: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    client.onSessionExpired(() => setUser(null));
    // A valid refresh cookie restores the session after a page reload
    client.refreshSession().then((u) => {
      if (u && (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN')) setUser(u);
      setBooting(false);
    });
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      booting,
      isSuperAdmin: user?.role === 'SUPER_ADMIN',
      async login(email, password) {
        setUser(await client.login(email, password));
      },
      async logout() {
        await client.logout();
        setUser(null);
      },
    }),
    [user, booting],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
