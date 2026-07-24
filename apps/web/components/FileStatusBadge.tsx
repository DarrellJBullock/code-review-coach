import type { PullRequestChangedFileDto } from '@code-review-coach/shared';

type FileStatus = PullRequestChangedFileDto['status'];

const STATUS_STYLES: Record<FileStatus, string> = {
  added: 'bg-green-100 text-green-800',
  modified: 'bg-amber-100 text-amber-800',
  removed: 'bg-red-100 text-red-800',
  renamed: 'bg-blue-100 text-blue-800',
  copied: 'bg-purple-100 text-purple-800',
  changed: 'bg-amber-100 text-amber-800',
  unchanged: 'bg-gray-100 text-gray-600',
};

interface FileStatusBadgeProps {
  status: FileStatus;
}

/**
 * Small color-coded pill for a changed file's status. Pure presentational —
 * no hooks or browser APIs, so no 'use client' directive is needed even
 * though it's only ever rendered inside client trees.
 */
export function FileStatusBadge({ status }: FileStatusBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
