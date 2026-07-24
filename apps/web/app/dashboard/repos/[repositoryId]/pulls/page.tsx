'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { PullRequestDto } from '@code-review-coach/shared';
import { api, ApiError } from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';

/**
 * Client Component: fetches from the API on mount and needs local
 * loading/error/data state plus a retry button — a Server Component fetch
 * can't react to the retry click or read the session cookie set on the
 * API's origin.
 */
export default function PullRequestListPage() {
  const params = useParams<{ repositoryId: string }>();
  const router = useRouter();
  const repositoryId = params.repositoryId;

  const [pulls, setPulls] = useState<PullRequestDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<PullRequestDto[]>(`/repositories/${repositoryId}/pull-requests`)
      .then((data) => {
        if (!cancelled) setPulls(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPulls(null);
        setError(
          err instanceof ApiError
            ? err.message
            : 'Something went wrong loading pull requests.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [repositoryId, version]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
        <Link href="/dashboard" className="text-lg font-semibold text-indigo-600">
          PR Review Coach
        </Link>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          Choose a different repository
        </button>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Open pull requests</h2>

        {loading ? (
          <LoadingSpinner label="Loading pull requests…" />
        ) : error ? (
          <ErrorState
            message="Couldn't load pull requests — try again."
            onRetry={() => setVersion((v) => v + 1)}
          />
        ) : !pulls || pulls.length === 0 ? (
          <EmptyState message="No open pull requests found for this repository." />
        ) : (
          <ul className="flex flex-col divide-y divide-gray-200 rounded-md border border-gray-200">
            {pulls.map((pr) => (
              <li key={pr.id}>
                <Link
                  href={`/dashboard/repos/${repositoryId}/pulls/${pr.id}`}
                  className="flex flex-col gap-1 px-4 py-3 hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">
                    #{pr.githubNumber} {pr.title}
                  </span>
                  <span className="text-xs text-gray-500">
                    {pr.authorLogin} · updated {new Date(pr.updatedAt).toLocaleString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
