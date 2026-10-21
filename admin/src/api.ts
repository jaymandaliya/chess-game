// Admin API client. Access token in memory only; refresh token is an httpOnly cookie set by the server
// (X-Client-Type: web), so nothing sensitive is kept in localStorage.

export type Role = 'PLAYER' | 'ADMIN' | 'SUPER_ADMIN';

export interface SessionUser {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  status: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Page<T> {
  items: T[];
  pagination: Pagination;
}

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

const BASE = '/api/v1';
let accessToken: string | null = null;
let refreshing: Promise<SessionUser | null> | null = null;
let expiredHandler: () => void = () => {};

export function onSessionExpired(fn: () => void) {
  expiredHandler = fn;
}

export function refreshSession(): Promise<SessionUser | null> {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Client-Type': 'web' },
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) return null;
        accessToken = json.data.accessToken;
        return json.data.user as SessionUser;
      })
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const data = await api<{ user: SessionUser; accessToken: string }>('/auth/login', {
    method: 'POST',
    body: { email, password, portal: 'admin' },
    auth: false,
  });
  accessToken = data.accessToken;
  return data.user;
}

// Server signs out other sessions and returns a fresh one (new cookie + access token)
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const data = await api<{ accessToken: string }>('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
  accessToken = data.accessToken;
}

export async function logout(): Promise<void> {
  await api('/auth/logout', { method: 'POST', auth: false }).catch(() => {});
  accessToken = null;
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  auth?: boolean;
}

function request(path: string, { method = 'GET', body, auth = true }: Options): Promise<Response> {
  const headers: Record<string, string> = { 'X-Client-Type': 'web', Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function withRefresh(path: string, options: Options): Promise<Response> {
  let res: Response;
  try {
    res = await request(path, options);
    if (res.status === 401 && options.auth !== false) {
      if (!(await refreshSession())) {
        expiredHandler();
        throw new ApiError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.', 401);
      }
      res = await request(path, options);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('NETWORK_ERROR', 'Cannot reach the server', 0);
  }
  return res;
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const res = await withRefresh(path, options);
  const json = await res.json().catch(() => null);
  if (!json?.success) {
    throw new ApiError(
      json?.code ?? 'UNKNOWN',
      json?.details?.[0] ? `${json.details[0].path}: ${json.details[0].message}` : json?.message ?? 'Request failed',
      res.status,
      json?.details,
    );
  }
  return json.data as T;
}

// Downloads a CSV export through the authenticated client
export async function download(path: string): Promise<void> {
  const res = await withRefresh(path, {});
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new ApiError(json?.code ?? 'EXPORT_FAILED', json?.message ?? 'Export failed', res.status);
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'export.csv';
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  const s = search.toString();
  return s ? `?${s}` : '';
}
