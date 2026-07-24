import type { FindingCategory, ReviewMode, ReviewStatus, RiskLevel } from '../enums';

/**
 * Hand-shaped API response contracts. These are NOT raw Prisma models —
 * they are the stable shapes the frontend consumes over HTTP. DB schema
 * details (ids, internal FKs, timestamp types, etc.) may diverge from
 * these; controllers/services are responsible for mapping into these DTOs.
 */

export interface UserDto {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface RepositoryDto {
  id: string;
  githubId: number;
  owner: string;
  name: string;
  fullName: string;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PullRequestDto {
  id: string;
  repositoryId: string;
  githubNumber: number;
  title: string;
  authorLogin: string;
  headSha: string;
  baseSha: string;
  state: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface PullRequestChangedFileDto {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  /** Unified diff patch for this file. May be undefined for binary files (GitHub omits `patch` for those). */
  patch?: string;
}

export interface PullRequestDiffDto {
  files: PullRequestChangedFileDto[];
  /** Raw unified diff for the whole PR (all files), used as-is in AI prompts. */
  rawDiff: string;
}

export interface ReviewDto {
  id: string;
  pullRequestId: string;
  status: ReviewStatus;
  mode: ReviewMode | null;
  overallRiskScore: number | null;
  summary: string | null;
  createdAt: string;
  completedAt: string | null;
}

/**
 * Denormalized row shape for `GET /reviews` (the review history dashboard,
 * Phase 8). Deliberately flat/denormalized — it inlines the parent
 * PullRequest and Repository fields a history list UI needs (number, title,
 * fullName) so the frontend never has to issue follow-up per-row fetches.
 * Not a replacement for `ReviewDto` (which stays the single-review shape for
 * `POST /reviews` and `GET /reviews/:id`).
 */
export interface ReviewListItemDto {
  id: string;
  status: ReviewStatus;
  overallRiskScore: number | null;
  summary: string | null;
  createdAt: string;
  completedAt: string | null;
  pullRequestId: string;
  pullRequestNumber: number;
  pullRequestTitle: string;
  repositoryId: string;
  repositoryFullName: string;
}

/**
 * Response shape for `POST /reviews/:id/post-approved` (Phase 7 posting
 * flow). Shared so the frontend doesn't hand-duplicate this contract — it
 * previously did, which is exactly the kind of drift this file exists to
 * prevent. Carries no request-body counterpart on purpose: per the
 * product's non-negotiable safety rule, the set of findings to post is
 * derived entirely from server-side DB state, never from a client-supplied
 * list of finding ids.
 */
export interface PostApprovedFindingsResponse {
  posted: (FindingDto & { githubCommentUrl: string })[];
  failed: { findingId: string; error: string }[];
}

export interface FindingDto {
  id: string;
  reviewId: string;
  category: FindingCategory;
  riskLevel: RiskLevel;
  riskJustification: string;
  title: string;
  whyItMatters: string;
  whatCouldBreak: string;
  suggestedFix: string;
  suggestedTest: string;
  filePath: string | null;
  lineRangeStart: number | null;
  lineRangeEnd: number | null;
  approved: boolean;
  postedToGithub: boolean;
  githubCommentId: string | null;
}
