import { API_URL } from '../config';
import { SessionUser } from './types';
import { clearTokens, getAccessToken, loadRefreshToken, saveRefreshToken, setAccessToken } from './tokenStore';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export interface SessionPayload {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
}

let sessionExpiredHandler: () => void = () => {};
export function onSessionExpired(handler: () => void): void {
  sessionExpiredHandler = handler;
}

export async function storeSession(session: SessionPayload): Promise<void> {
  setAccessToken(session.accessToken);
  await saveRefreshToken(session.refreshToken);
}

let refreshing: Promise<SessionPayload | null> | null = null;

// Single-flight: parallel 401s share one refresh call (each refresh token works only once)
export function refreshSession(): Promise<SessionPayload | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = await loadRefreshToken();
      if (!refreshToken) return null;
      try {
        const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          if (res.status === 401) await clearTokens();
          return null;
        }
        await storeSession(json.data);
        return json.data as SessionPayload;
      } catch {
        return null;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: Method;
  body?: unknown;
  auth?: boolean;
}

async function send(path: string, { method = 'GET', body, auth = true }: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getAccessToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await send(path, options);
    if (res.status === 401 && options.auth !== false) {
      const session = await refreshSession();
      if (!session) {
        sessionExpiredHandler();
        throw new ApiError('SESSION_EXPIRED', 'Please sign in again', 401);
      }
      res = await send(path, options);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('NETWORK_ERROR', 'Cannot reach the server. Check your connection.', 0);
  }

  const json = await res.json().catch(() => null);
  if (!json || !json.success) {
    throw new ApiError(
      json?.code ?? 'UNKNOWN',
      json?.details?.[0]?.message ?? json?.message ?? 'Something went wrong',
      res.status,
      json?.details,
    );
  }
  return json.data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong';
}

export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: rupees % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
