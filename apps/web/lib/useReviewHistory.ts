'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReviewListItemDto, RiskLevel } from '@code-review-coach/shared';
import { api, ApiError } from './api';

export type { ReviewListItemDto };

export interface ReviewHistoryFilters {
  repositoryId?: string;
  riskLevel?: RiskLevel;
  from?: string;
  to?: string;
}

export interface RepoOption {
  id: string;
  fullName: string;
}

export interface UseReviewHistoryResult {
  reviews: ReviewListItemDto[] | null;
  /** True only while the very first fetch (before any results have ever loaded) is in flight. */
  loading: boolean;
  /** True while a subsequent, filter-driven re-fetch is in flight — the previous list stays on screen. */
  filtering: boolean;
  error: string | null;
  /** Re-run the current (filtered) fetch, and the unfiltered baseline used for repo options. */
  retry: () => void;
  /**
   * Distinct repos seen in the *unfiltered* baseline fetch, for populating
   * the repo filter dropdown. Deliberately not derived from the currently
   * filtered `reviews` list — otherwise narrowing by risk level/date would
   * also shrink the repo dropdown's own options out from under the user.
   */
  repoOptions: RepoOption[];
}

function buildQuery(filters: ReviewHistoryFilters): string {
  const params = new URLSearchParams();
  if (filters.repositoryId) params.set('repositoryId', filters.repositoryId);
  if (filters.riskLevel) params.set('riskLevel', filters.riskLevel);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Client-side hook for the review history dashboard: fetches
 * `GET /reviews` (optionally filtered by repo/risk level/date range) and
 * separately maintains an unfiltered baseline fetch used only to derive the
 * repo dropdown's options — see `repoOptions` above.
 */
export function useReviewHistory(filters: ReviewHistoryFilters): UseReviewHistoryResult {
  const { repositoryId, riskLevel, from, to } = filters;

  const [reviews, setReviews] = useState<ReviewListItemDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtering, setFiltering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repoOptions, setRepoOptions] = useState<RepoOption[]>([]);
  const [version, setVersion] = useState(0);
  const hasLoadedOnceRef = useRef(false);

  // Baseline fetch: unfiltered `GET /reviews`, used only to derive the full
  // set of distinct repos for the filter dropdown. Runs on mount and again
  // on retry, but not on filter changes.
  useEffect(() => {
    let cancelled = false;

    api
      .get<ReviewListItemDto[]>('/reviews')
      .then((data) => {
        if (cancelled) return;
        const seen = new Map<string, RepoOption>();
        for (const r of data) {
          if (!seen.has(r.repositoryId)) {
            seen.set(r.repositoryId, { id: r.repositoryId, fullName: r.repositoryFullName });
          }
        }
        setRepoOptions(
          Array.from(seen.values()).sort((a, b) => a.fullName.localeCompare(b.fullName)),
        );
      })
      .catch(() => {
        // Non-fatal: the main (filtered) fetch below is the source of truth
        // for the page's error state. Losing repo-dropdown options here
        // just means an empty dropdown, not a broken page.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  useEffect(() => {
    let cancelled = false;

    if (hasLoadedOnceRef.current) {
      setFiltering(true);
    } else {
      setLoading(true);
    }
    setError(null);

    api
      .get<ReviewListItemDto[]>(`/reviews${buildQuery({ repositoryId, riskLevel, from, to })}`)
      .then((data) => {
        if (cancelled) return;
        setReviews(data);
        hasLoadedOnceRef.current = true;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setReviews(null);
        setError(
          err instanceof ApiError ? err.message : "Couldn't load review history — try again.",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setFiltering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [repositoryId, riskLevel, from, to, version]);

  const retry = useCallback(() => setVersion((v) => v + 1), []);

  return { reviews, loading, filtering, error, retry, repoOptions };
}
