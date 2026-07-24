'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FINDING_CATEGORIES } from '@code-review-coach/shared';
import type { FindingCategory, PostApprovedFindingsResponse } from '@code-review-coach/shared';
import { api, ApiError } from '@/lib/api';
import { useReview, type ReviewFinding } from '@/lib/useReview';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { RiskScoreBadge } from '@/components/RiskScoreBadge';
import { FindingCard } from '@/components/FindingCard';
import { PostApprovedSection } from '@/components/PostApprovedSection';

const CATEGORY_LABELS: Record<FindingCategory, string> = {
  BUG_RISK: 'Bug Risk',
  TEST_COVERAGE: 'Test Coverage',
  TYPE_SAFETY: 'Type Safety',
  ERROR_HANDLING: 'Error Handling',
  SECURITY: 'Security',
  PERFORMANCE: 'Performance',
  ACCESSIBILITY: 'Accessibility',
  MAINTAINABILITY: 'Maintainability',
  API_CONTRACT_CHANGES: 'API Contract Changes',
  BREAKING_CHANGES: 'Breaking Changes',
};

/**
 * Client Component: this page polls `GET /reviews/:id` on an interval
 * while the review is still generating (needs `setInterval` + cleanup,
 * which only works client-side, delegated to the `useReview` hook) and
 * owns local optimistic state for each finding's approval checkbox — none
 * of which a Server Component can do.
 */
export default function ReviewResultsPage() {
  const params = useParams<{
    repositoryId: string;
    pullRequestId: string;
    reviewId: string;
  }>();
  const { repositoryId, pullRequestId, reviewId } = params;

  const { review, findings, loading, error, timedOut, retry, setFindings } = useReview(reviewId);

  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  // "Post approved to GitHub" flow state.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postedUrls, setPostedUrls] = useState<Record<string, string>>({});
  const [postFailures, setPostFailures] = useState<Record<string, string>>({});

  const backHref = `/dashboard/repos/${repositoryId}/pulls/${pullRequestId}`;

  async function handleToggleApproved(finding: ReviewFinding, approved: boolean) {
    // Optimistic update.
    setFindings((prev) => prev.map((f) => (f.id === finding.id ? { ...f, approved } : f)));
    setSavingIds((prev) => new Set(prev).add(finding.id));
    setSaveErrors((prev) => {
      if (!(finding.id in prev)) return prev;
      const next = { ...prev };
      delete next[finding.id];
      return next;
    });

    try {
      // Documented contract: PATCH /findings/:id { approved } -> 200 FindingDto.
      // That endpoint is being built concurrently by Backend and may not be
      // live yet — this call is written against the documented contract.
      const updated = await api.patch<ReviewFinding>(`/findings/${finding.id}`, { approved });
      setFindings((prev) => prev.map((f) => (f.id === finding.id ? { ...f, ...updated } : f)));
    } catch (err) {
      // Revert the optimistic update and surface a per-row error rather
      // than silently dropping the failed toggle.
      setFindings((prev) =>
        prev.map((f) => (f.id === finding.id ? { ...f, approved: !approved } : f)),
      );
      setSaveErrors((prev) => ({
        ...prev,
        [finding.id]:
          err instanceof ApiError ? err.message : "Couldn't save approval — try again.",
      }));
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(finding.id);
        return next;
      });
    }
  }

  async function handleConfirmPost() {
    setPosting(true);
    setPostError(null);

    try {
      // Documented contract: POST /reviews/:reviewId/post-approved, no
      // request body. Built concurrently by Backend and may not be live
      // yet — this call is written against the documented contract.
      const result = await api.post<PostApprovedFindingsResponse>(`/reviews/${reviewId}/post-approved`);

      setFindings((prev) =>
        prev.map((f) => {
          const posted = result.posted.find((p) => p.id === f.id);
          return posted ? { ...f, ...posted, approved: true, postedToGithub: true } : f;
        }),
      );

      if (result.posted.length > 0) {
        setPostedUrls((prev) => {
          const next = { ...prev };
          for (const posted of result.posted) {
            next[posted.id] = posted.githubCommentUrl;
          }
          return next;
        });
      }

      // Clear any stale failure for findings that succeeded this time, and
      // record fresh failures for anything the server rejected — leaving
      // those findings' approve checkboxes interactive so the user can
      // retry later.
      setPostFailures((prev) => {
        const next = { ...prev };
        for (const posted of result.posted) delete next[posted.id];
        for (const failure of result.failed) next[failure.findingId] = failure.error;
        return next;
      });

      setConfirmOpen(false);
    } catch (err) {
      // Total request failure (network/500) — distinct from per-finding
      // entries in `failed[]`. Keep the confirmation panel open so the
      // user can see what was about to be posted and retry.
      setPostError(
        err instanceof ApiError ? err.message : "Couldn't post to GitHub — try again.",
      );
    } finally {
      setPosting(false);
    }
  }

  if (loading) {
    return (
      <PageShell backHref={backHref}>
        <LoadingSpinner label="Loading review…" />
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell backHref={backHref}>
        <ErrorState message={error} onRetry={retry} />
      </PageShell>
    );
  }

  if (!review) {
    return null;
  }

  if (timedOut) {
    return (
      <PageShell backHref={backHref}>
        <ErrorState
          message="This review is taking longer than expected (over 5 minutes). It may still finish in the background — check back later, or try running it again."
          onRetry={retry}
        />
      </PageShell>
    );
  }

  if (review.status === 'QUEUED' || review.status === 'RUNNING') {
    return (
      <PageShell backHref={backHref}>
        <div className="rounded-md border border-gray-200 bg-gray-50">
          <LoadingSpinner label="Generating review…" />
          <p className="pb-6 text-center text-xs text-gray-500">
            Status: {review.status === 'QUEUED' ? 'Queued' : 'Running'}
          </p>
        </div>
      </PageShell>
    );
  }

  if (review.status === 'FAILED') {
    return (
      <PageShell backHref={backHref}>
        <ErrorState message="Review generation failed — try running it again." />
        <div className="mt-4 text-center">
          <Link href={backHref} className="text-sm text-indigo-600 hover:underline">
            ← Back to pull request
          </Link>
        </div>
      </PageShell>
    );
  }

  // COMPLETED
  const findingsByCategory = FINDING_CATEGORIES.map((category) => ({
    category,
    items: findings.filter((f) => f.category === category),
  })).filter((group) => group.items.length > 0);

  const readyToPost = findings.filter((f) => f.approved && !f.postedToGithub);
  const alreadyPostedCount = findings.filter((f) => f.postedToGithub).length;
  // Approval checkboxes are frozen for every finding while a confirmation
  // is open or a post is in flight, so the set of approved-and-unposted
  // findings can't drift between what the confirmation panel showed and
  // what the server actually posts (the server derives its own posting set
  // from DB state at request time, not from a client-supplied id list).
  const approvalLocked = confirmOpen || posting;

  return (
    <PageShell backHref={backHref}>
      <div className="mb-6 flex flex-col gap-3 rounded-md border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <RiskScoreBadge score={review.overallRiskScore} />
          <h1 className="text-lg font-semibold text-gray-900">Review summary</h1>
        </div>
        {review.summary ? <p className="text-sm text-gray-700">{review.summary}</p> : null}
      </div>

      {findingsByCategory.length === 0 ? (
        <EmptyState message="No findings were reported for this review." />
      ) : (
        <div className="flex flex-col gap-8">
          {findingsByCategory.map(({ category, items }) => (
            <section key={category}>
              <h2 className="mb-3 text-base font-semibold text-gray-900">
                {CATEGORY_LABELS[category]}{' '}
                <span className="text-sm font-normal text-gray-400">({items.length})</span>
              </h2>
              <ul className="flex flex-col gap-4">
                {items.map((finding) => (
                  <FindingCard
                    key={finding.id}
                    finding={finding}
                    saving={savingIds.has(finding.id)}
                    saveError={saveErrors[finding.id] ?? postFailures[finding.id] ?? null}
                    onToggleApproved={(approved) => handleToggleApproved(finding, approved)}
                    approvalLocked={approvalLocked}
                    postedUrl={postedUrls[finding.id] ?? null}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <PostApprovedSection
        readyToPost={readyToPost}
        alreadyPostedCount={alreadyPostedCount}
        confirmOpen={confirmOpen}
        posting={posting}
        postError={postError}
        onOpenConfirm={() => setConfirmOpen(true)}
        onCancel={() => {
          setConfirmOpen(false);
          setPostError(null);
        }}
        onConfirm={handleConfirmPost}
      />
    </PageShell>
  );
}

function PageShell({ backHref, children }: { backHref: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
        <Link href={backHref} className="text-sm text-indigo-600 hover:underline">
          ← Back to pull request
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">{children}</main>
    </div>
  );
}
