'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RISK_LEVELS } from '@code-review-coach/shared';
import type { RiskLevel } from '@code-review-coach/shared';
import { useCurrentUser } from '@/lib/auth';
import { useReviewHistory, type ReviewListItemDto } from '@/lib/useReviewHistory';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { AppHeader } from '@/components/AppHeader';
import { RiskScoreBadge } from '@/components/RiskScoreBadge';
import { ReviewStatusBadge } from '@/components/ReviewStatusBadge';

const RISK_LEVEL_OPTIONS: { value: '' | RiskLevel; label: string }[] = [
  { value: '', label: 'All risk levels' },
  ...RISK_LEVELS.map((level) => ({ value: level, label: `${level[0]}${level.slice(1).toLowerCase()}` })),
];

const SUMMARY_PREVIEW_CHARS = 160;

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function truncateSummary(summary: string): string {
  if (summary.length <= SUMMARY_PREVIEW_CHARS) return summary;
  return `${summary.slice(0, SUMMARY_PREVIEW_CHARS).trimEnd()}…`;
}

/**
 * Client Component: owns filter state (repo/risk/date range) that drives
 * re-fetches of `GET /reviews`, and needs `useCurrentUser` (client-side
 * cookie read) to gate the page plus `useRouter` for the unauthenticated
 * redirect — none of which work in a Server Component. Matches the
 * dashboard page's auth-gate shell exactly.
 */
export default function ReviewHistoryPage() {
  const { user, loading: userLoading, error: userError } = useCurrentUser();
  const router = useRouter();

  const [repositoryId, setRepositoryId] = useState('');
  const [riskLevel, setRiskLevel] = useState<'' | RiskLevel>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const filters = useMemo(
    () => ({
      repositoryId: repositoryId || undefined,
      riskLevel: riskLevel || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [repositoryId, riskLevel, from, to],
  );

  const { reviews, loading, filtering, error, retry, repoOptions } = useReviewHistory(filters);

  useEffect(() => {
    if (!userLoading && !user && !userError) {
      router.replace('/login');
    }
  }, [userLoading, user, userError, router]);

  if (userLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <LoadingSpinner label="Loading your account…" />
      </main>
    );
  }

  if (userError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <ErrorState
          message="Couldn't reach the API to check your session — try again."
          onRetry={() => window.location.reload()}
        />
      </main>
    );
  }

  if (!user) {
    // Redirect effect above is in flight.
    return null;
  }

  const hasActiveFilters = Boolean(repositoryId || riskLevel || from || to);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Review history</h1>
          {filtering ? (
            <span className="flex items-center gap-2 text-xs text-gray-500">
              <span
                className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"
                role="status"
                aria-label="Updating results"
              />
              Updating…
            </span>
          ) : null}
        </div>

        <div className="mb-6 flex flex-wrap items-end gap-4 rounded-md border border-gray-200 bg-gray-50 p-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Repository
            <select
              value={repositoryId}
              onChange={(e) => setRepositoryId(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All repositories</option>
              {repoOptions.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Risk level
            <select
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value as '' | RiskLevel)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {RISK_LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                setRepositoryId('');
                setRiskLevel('');
                setFrom('');
                setTo('');
              }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {loading ? (
          <LoadingSpinner label="Loading review history…" />
        ) : error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : !reviews || reviews.length === 0 ? (
          hasActiveFilters ? (
            <EmptyState message="No reviews match these filters." />
          ) : (
            <EmptyState message="No reviews yet — run your first review from a pull request." />
          )
        ) : (
          <ul className="flex flex-col divide-y divide-gray-200 rounded-md border border-gray-200">
            {reviews.map((review) => (
              <ReviewHistoryRow key={review.id} review={review} />
            ))}
          </ul>
        )}

        {!hasActiveFilters && (!reviews || reviews.length === 0) && !loading && !error ? (
          <div className="mt-4 text-center">
            <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline">
              ← Back to dashboard
            </Link>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function ReviewHistoryRow({ review }: { review: ReviewListItemDto }) {
  const href = `/dashboard/repos/${review.repositoryId}/pulls/${review.pullRequestId}/reviews/${review.id}`;

  return (
    <li>
      <Link href={href} className="flex flex-col gap-2 px-4 py-4 text-left hover:bg-gray-50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">
              {review.pullRequestTitle}
              <span className="ml-1 font-normal text-gray-400">#{review.pullRequestNumber}</span>
            </p>
            <p className="text-xs text-gray-500">{review.repositoryFullName}</p>
          </div>
          {review.status === 'COMPLETED' ? (
            <RiskScoreBadge score={review.overallRiskScore} />
          ) : (
            <ReviewStatusBadge status={review.status} />
          )}
        </div>

        {review.summary ? (
          <p className="line-clamp-2 text-sm text-gray-600">{truncateSummary(review.summary)}</p>
        ) : null}

        <p className="text-xs text-gray-400">{formatDate(review.createdAt)}</p>
      </Link>
    </li>
  );
}
