import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { FindingDto, ReviewDto, ReviewListItemDto } from '@code-review-coach/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { ReviewsService } from './reviews.service';
import type {
  CreateReviewRequestBody,
  ListReviewsQueryParams,
  PostApprovedFindingsResponse,
} from './reviews.types';

/**
 * Real ReviewsController (Phase 5) — the BullMQ producer's HTTP surface.
 */
@Controller('reviews')
@UseGuards(SessionAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * POST /reviews
   * Body: { pullRequestId: string, modes?: { performance?: boolean, security?: boolean, accessibility?: boolean } }
   * Creates a `Review` row (status QUEUED) and enqueues a
   * `review-generation` BullMQ job. Returns immediately — the frontend is
   * expected to poll GET /reviews/:id for completion.
   */
  @Post()
  async create(
    @CurrentUser() user: User,
    @Body() body: CreateReviewRequestBody,
  ): Promise<ReviewDto> {
    return this.reviewsService.createReview(user.id, body);
  }

  /**
   * GET /reviews?repositoryId=&riskLevel=&from=&to=
   * Lists the current user's own past reviews (review history dashboard,
   * Phase 8), newest first. All query params are optional and combine as an
   * AND filter:
   *  - repositoryId: only reviews whose PullRequest belongs to this Repository.
   *  - riskLevel: LOW/MEDIUM/HIGH, bucketed from the raw overallRiskScore
   *    using the SAME thresholds as apps/web/components/RiskScoreBadge.tsx
   *    (>=70 high, >=40 medium, else low). Reviews with a null
   *    overallRiskScore (not yet completed) are excluded whenever this
   *    filter is supplied.
   *  - from/to: ISO date strings, inclusive range on Review.createdAt.
   * Does not include Findings (see GET /reviews/:id for that) — this is a
   * denormalized list shape (ReviewListItemDto) built via a single Prisma
   * query with `include`, not N+1 per-row lookups.
   */
  @Get()
  async list(
    @CurrentUser() user: User,
    @Query() query: ListReviewsQueryParams,
  ): Promise<ReviewListItemDto[]> {
    return this.reviewsService.listReviews(user.id, query);
  }

  /**
   * GET /reviews/:id
   * Returns the Review joined with its Findings. Only the user who
   * requested the review may fetch it.
   */
  @Get(':id')
  async getOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<{ review: ReviewDto; findings: FindingDto[] }> {
    return this.reviewsService.getReviewWithFindings(user.id, id);
  }

  /**
   * POST /reviews/:id/post-approved
   * Body: none. Posts every currently-approved-but-not-yet-posted Finding
   * on this review as a real GitHub PR comment.
   *
   * Deliberately accepts no request body — per the product's non-negotiable
   * safety rule, the set of findings to post is derived entirely from
   * server-side DB state (`Finding.approved && !Finding.postedToGithub`),
   * never from a client-supplied list of finding ids. Only the user who
   * requested the parent review may trigger this (403/404 follow the same
   * ownership pattern as GET /reviews/:id).
   *
   * Idempotent: calling this twice in a row is a no-op the second time for
   * any finding that already posted successfully (see
   * ReviewsService.postApprovedFindings's doc comment). Zero eligible
   * findings is a normal 200 with empty arrays, not an error. One finding's
   * GitHub failure never prevents the others from posting.
   */
  @Post(':id/post-approved')
  @HttpCode(HttpStatus.OK)
  async postApproved(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<PostApprovedFindingsResponse> {
    return this.reviewsService.postApprovedFindings(user.id, id);
  }
}
