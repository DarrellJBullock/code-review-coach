'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FindingDto, ReviewDto } from '@code-review-coach/shared';
import { api, ApiError } from './api';

/**
 * Backend has since landed `approved` / `postedToGithub` / `githubCommentId`
 * directly on the shared `FindingDto` (packages/shared/src/types/dto.ts), so
 * the local extension this type used to carry is no longer needed. Kept as
 * an alias (rather than importing `FindingDto` everywhere) so call sites
 * across the app don't need to change if the frontend ever needs to layer
 * more client-only fields onto findings again.
 */
export type ReviewFinding = FindingDto;

interface ReviewDetailResponse {
  review: ReviewDto;
  findings: ReviewFinding[];
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 5 * 60 * 1000; // 5 minute safety cap

export interface UseReviewResult {
  review: ReviewDto | null;
  findings: ReviewFinding[];
  /** True only for the initial GET — not re-set true on each poll tick. */
  loading: boolean;
  /** Set when the *initial* fetch fails (network error, 404, etc). */
  error: string | null;
  /** Set once polling has run past the 5-minute safety cap without a terminal status. */
  timedOut: boolean;
  /** Re-run the initial fetch (and restart polling) from scratch. */
  retry: () => void;
  setFindings: React.Dispatch<React.SetStateAction<ReviewFinding[]>>;
}

/**
 * Client-side hook for a single review: fetches `GET /reviews/:id` on
 * mount, then polls the same endpoint every ~2s while `status` is
 * `QUEUED`/`RUNNING` (Phase 5's worker transitions status asynchronously).
 * Polling stops as soon as status becomes terminal (`COMPLETED`/`FAILED`),
 * or after a 5-minute safety cap (`timedOut`), and always stops on
 * unmount/reviewId change to avoid leaking intervals.
 *
 * A poll-tick failure *after* a successful initial load is treated as
 * transient (logged nowhere, just retried on the next tick) rather than
 * replacing a working in-progress view with an error — only the initial
 * fetch failing surfaces `error`.
 */
export function useReview(reviewId: string): UseReviewResult {
  const [review, setReview] = useState<ReviewDto | null>(null);
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const startedAt = Date.now();

    setLoading(true);
    setError(null);
    setTimedOut(false);

    function stopPolling() {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    }

    async function tick(isInitial: boolean) {
      try {
        const data = await api.get<ReviewDetailResponse>(`/reviews/${reviewId}`);
        if (cancelled) return;

        setReview(data.review);
        setFindings(data.findings);
        if (isInitial) {
          setError(null);
          setLoading(false);
        }

        if (data.review.status === 'COMPLETED' || data.review.status === 'FAILED') {
          stopPolling();
        } else if (Date.now() - startedAt >= MAX_POLL_MS) {
          stopPolling();
          setTimedOut(true);
        }
      } catch (err) {
        if (cancelled) return;
        if (isInitial) {
          setLoading(false);
          setError(
            err instanceof ApiError ? err.message : "Couldn't load this review — try again.",
          );
          stopPolling();
        }
      }
    }

    tick(true);
    intervalId = setInterval(() => {
      tick(false);
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [reviewId, version]);

  const retry = useCallback(() => setVersion((v) => v + 1), []);

  return { review, findings, loading, error, timedOut, retry, setFindings };
}
