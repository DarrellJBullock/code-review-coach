import type { ReviewFinding } from '@/lib/useReview';
import { RiskLevelBadge } from './RiskLevelBadge';

interface FindingCardProps {
  finding: ReviewFinding;
  saving: boolean;
  /**
   * Surfaces either an approve-toggle save error or a "couldn't post this
   * finding to GitHub" error — both are per-finding failures rendered in
   * the same spot near the checkbox, so the parent merges whichever is
   * currently relevant before passing it down.
   */
  saveError: string | null;
  onToggleApproved: (approved: boolean) => void;
  /**
   * True while a "post approved to GitHub" confirmation is open or in
   * flight. Approval checkboxes are disabled for every finding (not just
   * the ones being posted) during this window so the set of
   * approved-and-unposted findings can't drift between what the
   * confirmation panel showed the user and what the server actually posts.
   */
  approvalLocked?: boolean;
  /** `githubCommentUrl` from the post-approved response, if this finding was posted this session. */
  postedUrl?: string | null;
}

function locationLabel(finding: ReviewFinding): string | null {
  if (!finding.filePath) return null;
  if (finding.lineRangeStart === null) return finding.filePath;
  const end = finding.lineRangeEnd ?? finding.lineRangeStart;
  return `${finding.filePath}:${finding.lineRangeStart}-${end}`;
}

/**
 * Renders a single AI finding in the mandatory five-field "Senior Engineer
 * Mode" shape — risk level + justification, why it matters, what could
 * break, suggested test, suggested fix — plus the title, an optional
 * compact file:line location, and the per-finding approval checkbox. This
 * structure is the product's core differentiator, so fields are always
 * kept in clearly-labeled sections rather than collapsed into one
 * paragraph.
 *
 * Purely presentational — the parent (a Client Component) owns the
 * approval/saving/error state per finding and passes it in, same pattern
 * as DiffFileList/ReviewModeToggles, so no 'use client' directive is
 * needed here despite the checkbox's onChange.
 */
export function FindingCard({
  finding,
  saving,
  saveError,
  onToggleApproved,
  approvalLocked = false,
  postedUrl = null,
}: FindingCardProps) {
  const location = locationLabel(finding);
  const posted = finding.postedToGithub;

  return (
    <li className="flex flex-col gap-3 rounded-md border border-gray-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-semibold text-gray-900">{finding.title}</h4>
          {location ? <p className="font-mono text-xs text-gray-500">{location}</p> : null}
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={finding.approved}
                onChange={(e) => onToggleApproved(e.target.checked)}
                disabled={saving || posted || approvalLocked}
                title={posted ? 'Already posted to GitHub — cannot be un-approved.' : undefined}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              />
              Approved
            </label>
            {posted ? (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                Posted ✓
              </span>
            ) : null}
          </div>
          {posted && postedUrl ? (
            <a
              href={postedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-600 hover:underline"
            >
              View on GitHub ↗
            </a>
          ) : null}
          {saveError ? (
            <p className="text-xs text-red-600">{saveError}</p>
          ) : saving ? (
            <p className="text-xs text-gray-400">Saving…</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <RiskLevelBadge level={finding.riskLevel} />
        <p className="min-w-0 flex-1 text-sm text-gray-700">{finding.riskJustification}</p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Why it matters
          </dt>
          <dd className="mt-1 text-sm text-gray-700">{finding.whyItMatters}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            What could break
          </dt>
          <dd className="mt-1 text-sm text-gray-700">{finding.whatCouldBreak}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Suggested test
          </dt>
          <dd className="mt-1 text-sm text-gray-700">{finding.suggestedTest}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Suggested fix
          </dt>
          <dd className="mt-1 text-sm text-gray-700">{finding.suggestedFix}</dd>
        </div>
      </dl>
    </li>
  );
}
