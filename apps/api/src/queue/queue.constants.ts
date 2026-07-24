import type { PullRequestDiffDto } from '@code-review-coach/shared';

/** BullMQ queue name shared by the HTTP producer (ReviewsModule) and the
 * worker consumer (AiReviewModule). Both processes register their own
 * `BullModule.registerQueue({ name: REVIEW_GENERATION_QUEUE })` against this
 * same constant — they are two separate Nest application contexts (separate
 * `node` processes), so nothing else is shared between them except this name
 * and the Redis instance both connect to.
 */
export const REVIEW_GENERATION_QUEUE = 'review-generation';

export interface ReviewGenerationModes {
  performance: boolean;
  security: boolean;
  accessibility: boolean;
}

/**
 * Job payload enqueued onto `REVIEW_GENERATION_QUEUE`.
 *
 * Deliberately carries the full diff (files + rawDiff) and PR title/
 * description, not just `reviewId`. `Review` does not persist the diff text
 * anywhere (see schema.prisma), and AiReviewModule/WorkerModule must never
 * import GithubModule (structural guarantee — see worker.module.ts), so the
 * worker has no way to re-fetch the diff itself. ReviewsService fetches the
 * diff synchronously (via PullRequestsService, HTTP-side) at
 * `POST /reviews` time and hands it to the worker through this payload
 * instead.
 */
export interface ReviewGenerationJobData {
  reviewId: string;
  prTitle: string;
  /** PullRequest does not currently persist the PR body — see Phase 5 report (schema gap flagged to DBAdmin). Null until that column exists. */
  prDescription: string | null;
  diff: PullRequestDiffDto;
  modes: ReviewGenerationModes;
}
