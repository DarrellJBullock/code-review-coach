export type { PostApprovedFindingsResponse } from '@code-review-coach/shared';

/**
 * Raw `GET /reviews` query params as Express/Nest hands them to the
 * controller — every value arrives as a string (or is absent), including
 * `riskLevel`, which is validated/narrowed to `RiskLevel` in the service
 * layer rather than here, matching this codebase's convention of manual
 * service-layer validation over class-validator DTOs.
 */
export interface ListReviewsQueryParams {
  repositoryId?: string;
  riskLevel?: string;
  from?: string;
  to?: string;
}

/**
 * Plain request-body interfaces for ReviewsController. This codebase does
 * not use class-validator/class-transformer DTO classes anywhere (see
 * RepositoriesController/PullRequestsController) — request shapes are typed
 * interfaces and validated manually in the service layer, so this follows
 * the same convention rather than introducing a new one.
 */
export interface CreateReviewModesInput {
  performance?: boolean;
  security?: boolean;
  accessibility?: boolean;
}

export interface CreateReviewRequestBody {
  pullRequestId: string;
  modes?: CreateReviewModesInput;
}
