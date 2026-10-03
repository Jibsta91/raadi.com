import {
  createListingsClient,
  createMessagingClient,
  createSearchClient,
  createTrustClient,
} from '@raadi/api-client';
import { useCallback, useEffect, useMemo, useRef, useState, type DependencyList } from 'react';
import { useAuth } from './auth/context';
import { config } from './config';

/** Typed clients for the services the app uses, authenticated by the platform's auth provider. */
export function useApi() {
  const auth = useAuth();
  return useMemo(() => {
    const options = { baseUrl: config.apiBaseUrl, fetch: auth.fetch };
    return {
      listings: createListingsClient(options),
      search: createSearchClient(options),
      messaging: createMessagingClient(options),
      trust: createTrustClient(options),
    };
  }, [auth.fetch]);
}

export interface Loaded<T> {
  data: T | undefined;
  error: boolean;
  loading: boolean;
  reload: () => void;
}

/**
 * Runs `load` when `deps` change and keeps the latest result. `undefined` from `load` means
 * "not found" (data stays undefined, no error); a thrown error or rejected promise sets `error`.
 */
export function useLoad<T>(load: () => Promise<T | undefined>, deps: DependencyList): Loaded<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const latest = useRef(load);
  latest.current = load;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    latest
      .current()
      .then((value) => !cancelled && setData(value))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // The dependency list is the caller's, like useEffect's own.
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

/** Throws for transport and server errors so `useLoad` reports them; 404 becomes undefined. */
export function unwrap<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): T | undefined {
  if (result.response.status === 404) return undefined;
  if (result.error !== undefined || result.data === undefined) {
    throw new Error(`HTTP ${result.response.status}`);
  }
  return result.data;
}
