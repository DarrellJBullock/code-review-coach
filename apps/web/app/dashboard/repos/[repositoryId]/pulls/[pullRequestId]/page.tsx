'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { PullRequestDiffDto, ReviewDto, ReviewMode } from '@code-review-coach/shared';
import { api, ApiError } from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { DiffFileList } from '@/components/DiffFileList';
import { DiffPatchViewer } from '@/components/DiffPatchViewer';
import { ReviewModeToggles } from '@/components/ReviewModeToggles';

const INITIAL_MODES: Record<ReviewMode, boolean> = {
  PERFORMANCE: false,
  SECURITY: false,
  ACCESSIBILITY: false,
};

/**
 * Client Component: fetches the diff from the API on mount (needs the
 * session cookie set on the API's own origin, so this can't be a Server
 * Component fetch — same reasoning as the pull request list page) and
 * needs local state for loading/error/retry, the selected file, the review
 * mode toggles, and the in-flight/error state of the "Run Review" POST.
 */
export default function PullRequestDetailPage() {
  const params = useParams<{ repositoryId: string; pullRequestId: string }>();
  const { repositoryId, pullRequestId } = params;
  const router = useRouter();

  const [diff, setDiff] = useState<PullRequestDiffDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [modes, setModes] = useState<Record<ReviewMode, boolean>>(INITIAL_MODES);
  const [runningReview, setRunningReview] = useState(false);
  const [runReviewError, setRunReviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<PullRequestDiffDto>(`/pull-requests/${pullRequestId}/diff`)
      .then((data) => {
        if (!cancelled) setDiff(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDiff(null);
        setError(err instanceof ApiError ? err.message : 'Something went wrong loading the diff.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pullRequestId, version]);

  function handleSelectFile(index: number) {
    setSelectedIndex(index);
    document.getElementById(`diff-file-${index}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  function handleModeChange(mode: ReviewMode, enabled: boolean) {
    setModes((prev) => ({ ...prev, [mode]: enabled }));
  }

  async function handleRunReview() {
    setRunReviewError(null);
    setRunningReview(true);
    try {
      // POST /reviews always takes a `modes` object of three booleans
      // (performance/security/accessibility) regardless of how the
      // response ReviewDto represents mode (`mode: ReviewMode | null` —
      // a single nullable value, not an array, per a known backend design
      // tradeoff). We map the toggle state into the request shape here;
      // the response's single `mode` field isn't used by this handler.
      const review = await api.post<ReviewDto>('/reviews', {
        pullRequestId,
        modes: {
          performance: modes.PERFORMANCE,
          security: modes.SECURITY,
          accessibility: modes.ACCESSIBILITY,
        },
      });
      router.push(
        `/dashboard/repos/${repositoryId}/pulls/${pullRequestId}/reviews/${review.id}`,
      );
    } catch (err) {
      setRunReviewError(
        err instanceof ApiError ? err.message : "Couldn't start the review — try again.",
      );
      setRunningReview(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-col gap-3 border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <Link
            href={`/dashboard/repos/${repositoryId}/pulls`}
            className="text-sm text-indigo-600 hover:underline"
          >
            ← Back to pull requests
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-gray-900">Pull request {pullRequestId}</h1>

          <div className="flex flex-wrap items-center gap-4">
            <ReviewModeToggles modes={modes} onChange={handleModeChange} />
            <button
              type="button"
              onClick={handleRunReview}
              disabled={runningReview}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runningReview ? 'Starting review…' : 'Run Review'}
            </button>
          </div>
        </div>
        {runReviewError ? <ErrorState message={runReviewError} onRetry={handleRunReview} /> : null}
      </header>

      <main className="w-full flex-1 p-6">
        {loading ? (
          <LoadingSpinner label="Loading diff…" />
        ) : error ? (
          <ErrorState
            message="Couldn't load the diff — try again."
            onRetry={() => setVersion((v) => v + 1)}
          />
        ) : !diff || diff.files.length === 0 ? (
          <EmptyState message="No changed files found for this pull request." />
        ) : (
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <aside className="w-full shrink-0 rounded-md border border-gray-200 md:sticky md:top-6 md:w-72">
              <DiffFileList
                files={diff.files}
                selectedIndex={selectedIndex}
                onSelect={handleSelectFile}
              />
            </aside>

            <div className="flex min-w-0 flex-1 flex-col gap-6">
              {diff.files.map((file, index) => (
                <section key={file.filename} id={`diff-file-${index}`} className="scroll-mt-6">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-mono text-sm font-medium text-gray-900">
                      {file.filename}
                    </h2>
                  </div>
                  <DiffPatchViewer patch={file.patch} />
                </section>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
