'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UserDto } from '@code-review-coach/shared';
import { api, ApiError } from './api';

export interface UseCurrentUserResult {
  user: UserDto | null;
  loading: boolean;
  error: string | null;
  /** Re-run the GET /auth/me check (e.g. after login/logout). */
  refetch: () => void;
}

/**
 * Client-side hook for the current authenticated user.
 *
 * This must run client-side (not as a Server Component fetch): the session
 * cookie is set by the API on its own origin (localhost:4000), and a
 * cross-origin Server Component fetch from the Next.js server has no
 * access to the browser's cookie jar for that origin. The browser itself
 * does, so we call GET /auth/me from the client with credentials: 'include'.
 *
 * A 401 here is a normal "not logged in" outcome, not a fetch error — it
 * resolves to `user: null` rather than populating `error`.
 */
export function useCurrentUser(): UseCurrentUserResult {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<UserDto>('/auth/me', { skipAuthRedirect: true })
      .then((data) => {
        if (!cancelled) setUser(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
        } else {
          setUser(null);
          setError(err instanceof Error ? err.message : 'Failed to load current user.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [version]);

  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  return { user, loading, error, refetch };
}

/** POST /auth/logout — clears the session cookie server-side. */
export async function logout(): Promise<void> {
  await api.post<void>('/auth/logout', undefined, { skipAuthRedirect: true });
}
