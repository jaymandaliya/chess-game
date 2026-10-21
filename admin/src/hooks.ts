import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, qs, type Page } from './api';
import { dayEndIso, dayStartIso } from './format';

/*
 * List page state kept in the URL (?page=2&status=PAID...), so filters survive reloads and links can be shared.
 * Date filters are stored as yyyy-mm-dd and sent as IST day bounds.
 */
export function useList<T>(endpoint: string, defaults: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Page<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const get = useCallback((key: string) => params.get(key) ?? defaults[key] ?? '', [params, defaults]);

  // `open` only selects a detail modal, so it must not refetch the list
  const fetchParams = new URLSearchParams(params);
  fetchParams.delete('open');
  const queryString = fetchParams.toString();
  useEffect(() => {
    const query: Record<string, string | undefined> = { ...defaults };
    new URLSearchParams(queryString).forEach((v, k) => {
      query[k] = v;
    });
    if (query.from) query.from = dayStartIso(query.from);
    if (query.to) query.to = dayEndIso(query.to);
    let cancelled = false;
    setLoading(true);
    api<Page<T>>(`${endpoint}${qs(query)}`)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // defaults is a constant per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, queryString, version]);

  const set = useCallback(
    (updates: Record<string, string | number | undefined>, resetPage = true) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(updates)) {
          if (v === undefined || v === '') next.delete(k);
          else next.set(k, String(v));
        }
        if (resetPage && !('page' in updates)) next.delete('page');
        return next;
      });
    },
    [setParams],
  );

  const sort = useCallback(
    (field: string) => {
      const current = get('sortBy');
      const order = current === field && get('sortOrder') === 'desc' ? 'asc' : 'desc';
      set({ sortBy: field, sortOrder: order });
    },
    [get, set],
  );

  return { data, loading, error, get, set, sort, reload: () => setVersion((v) => v + 1), params };
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;
    setLoading(true);
    api<T>(path)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  return { data, error, loading, reload: () => setVersion((v) => v + 1), setData };
}
