import type { ReviewStatus } from '@code-review-coach/shared';

const STATUS_STYLES: Record<Exclude<ReviewStatus, 'COMPLETED'>, string> = {
  QUEUED: 'bg-gray-100 text-gray-600',
  RUNNING: 'bg-indigo-100 text-indigo-700',
  FAILED: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<Exclude<ReviewStatus, 'COMPLETED'>, string> = {
  QUEUED: 'Queued',
  RUNNING: 'Running',
  FAILED: 'Failed',
};

interface ReviewStatusBadgeProps {
  status: Exclude<ReviewStatus, 'COMPLETED'>;
}

/**
 * Small pill for a review's non-terminal/failed status (QUEUED/RUNNING/
 * FAILED). COMPLETED reviews show `RiskScoreBadge` instead — this badge is
 * only for the states where there's no score to show yet (or ever, for
 * FAILED). Pure presentational, no hooks — no 'use client' needed.
 */
export function ReviewStatusBadge({ status }: ReviewStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
