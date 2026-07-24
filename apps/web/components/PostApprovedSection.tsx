import type { ReviewFinding } from '@/lib/useReview';

interface PostApprovedSectionProps {
  /** Findings that are `approved && !postedToGithub` right now — exactly what a confirmed post would submit. */
  readyToPost: ReviewFinding[];
  alreadyPostedCount: number;
  confirmOpen: boolean;
  posting: boolean;
  /** Top-level (network/500) failure for the whole request — distinct from per-finding `failed[]` entries, which are shown on each `FindingCard` instead. */
  postError: string | null;
  onOpenConfirm: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * "Post approved to GitHub" panel: a count summary, a button that opens an
 * inline confirmation listing exactly which findings are about to be
 * posted, and Confirm/Cancel actions. Nothing is sent to GitHub until the
 * confirm button is clicked — this is a deliberate, non-negotiable product
 * requirement, not a UX nicety.
 *
 * Implemented as an inline expanding panel rather than a modal dialog: the
 * codebase has no existing modal/dialog primitive or headless-UI-style
 * dependency, and an inline panel gets the same "distinct confirmation
 * step, nothing auto-posts" guarantee without adding portal/focus-trap
 * infrastructure for a single confirmation.
 *
 * Purely presentational — the parent Client Component owns all state
 * (which findings are ready, in-flight status, errors), same pattern as
 * FindingCard/ReviewModeToggles, so no 'use client' directive is needed
 * here.
 */
export function PostApprovedSection({
  readyToPost,
  alreadyPostedCount,
  confirmOpen,
  posting,
  postError,
  onOpenConfirm,
  onCancel,
  onConfirm,
}: PostApprovedSectionProps) {
  const readyCount = readyToPost.length;

  return (
    <section className="mt-8 flex flex-col gap-3 rounded-md border border-gray-200 p-4">
      <h2 className="text-base font-semibold text-gray-900">Post approved to GitHub</h2>

      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
        <span>Ready to post: {readyCount}</span>
        {alreadyPostedCount > 0 ? <span>Already posted: {alreadyPostedCount}</span> : null}
      </div>

      {!confirmOpen ? (
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={onOpenConfirm}
            disabled={readyCount === 0}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
          >
            Post approved findings to GitHub
          </button>
          {readyCount === 0 ? (
            <p className="text-xs text-gray-500">Approve at least one finding first.</p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-sm font-medium text-gray-800">
            {readyCount === 1
              ? 'The following comment will be posted to GitHub:'
              : `The following ${readyCount} comments will be posted to GitHub:`}
          </p>
          <ul className="list-inside list-disc text-sm text-gray-700">
            {readyToPost.map((finding) => (
              <li key={finding.id}>{finding.title}</li>
            ))}
          </ul>

          {postError ? (
            <p className="text-sm text-red-600" role="alert">
              {postError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onConfirm}
              disabled={posting || readyCount === 0}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              {posting
                ? 'Posting…'
                : `Confirm & post ${readyCount} comment${readyCount === 1 ? '' : 's'} to GitHub`}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={posting}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
