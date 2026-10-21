import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, onSessionExpired, refreshSession, SessionPayload, storeSession } from '../api/client';
import { clearTokens, loadRefreshToken } from '../api/tokenStore';
import { PlayerSettings, SessionUser } from '../api/types';

const DEFAULT_SETTINGS: PlayerSettings = {
  boardTheme: 'green',
  pieceSet: 'standard',
  soundEnabled: true,
  notificationsEnabled: true,
  autoQueen: false,
  showLegalMoves: true,
  language: 'en',
};

interface AuthState {
  user: SessionUser | null;
  settings: PlayerSettings;
  booting: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, displayName: string): Promise<void>;
  logout(): Promise<void>;
  refreshUser(): Promise<void>;
  updateSettings(patch: Partial<PlayerSettings>): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_SETTINGS);
  const [booting, setBooting] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      setSettings(await api<PlayerSettings>('/player/settings'));
    } catch {
      // keep defaults
    }
  }, []);

  const startSession = useCallback(
    async (session: SessionPayload) => {
      if (session.user.role !== 'PLAYER') {
        await clearTokens();
        throw new Error('This app is for players. Admins use the web portal.');
      }
      await storeSession(session);
      setUser(session.user);
      loadSettings();
    },
    [loadSettings],
  );

  // Restore the session from the Keychain on app start
  useEffect(() => {
    (async () => {
      try {
        if (await loadRefreshToken()) {
          const session = await refreshSession();
          if (session && session.user.role === 'PLAYER') {
            setUser(session.user);
            loadSettings();
          }
        }
      } finally {
        setBooting(false);
      }
    })();
  }, [loadSettings]);

  useEffect(() => {
    onSessionExpired(() => {
      clearTokens();
      setUser(null);
    });
  }, []);

  // Actions are stable (no state in their deps) so screens can safely use them in effects
  const actions = useMemo(
    () => ({
      async login(email: string, password: string) {
        const session = await api<SessionPayload>('/auth/login', {
          method: 'POST',
          auth: false,
          body: { email, password, portal: 'player' },
        });
        await startSession(session);
      },
      async register(email: string, password: string, displayName: string) {
        const session = await api<SessionPayload>('/auth/register', {
          method: 'POST',
          auth: false,
          body: { email, password, displayName },
        });
        await startSession(session);
      },
      async logout() {
        const refreshToken = await loadRefreshToken();
        api('/auth/logout', { method: 'POST', auth: false, body: { refreshToken } }).catch(() => {});
        await clearTokens();
        setUser(null);
        setSettings(DEFAULT_SETTINGS);
      },
      async refreshUser() {
        const { user: fresh } = await api<{ user: SessionUser }>('/auth/me');
        setUser(fresh);
      },
      async updateSettings(patch: Partial<PlayerSettings>) {
        setSettings((s) => ({ ...s, ...patch }));
        setSettings(await api<PlayerSettings>('/player/settings', { method: 'PATCH', body: patch }));
      },
    }),
    [startSession],
  );

  const value = useMemo<AuthState>(() => ({ user, settings, booting, ...actions }), [user, settings, booting, actions]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
