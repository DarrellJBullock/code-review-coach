import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Review as PrismaReview } from '@prisma/client';
import {
  RISK_LEVELS,
  type FindingDto,
  type ReviewDto,
  type ReviewListItemDto,
  type ReviewMode,
  type RiskLevel,
} from '@code-review-coach/shared';
import { toFindingDto } from '../common/finding.mapper';
import { GithubService } from '../github/github.service';
import { PrismaService } from '../prisma/prisma.service';
import { PullRequestsService } from '../pull-requests/pull-requests.service';
import { QueueService } from '../queue/queue.service';
import type {
  CreateReviewRequestBody,
  ListReviewsQueryParams,
  PostApprovedFindingsResponse,
} from './reviews.types';

/** Prisma return shape for `listReviews`'s query — Review joined through to
 * its PullRequest and that PullRequest's Repository, all in one query (no
 * N+1 per-row lookups). */
type ReviewWithPullRequestAndRepository = Prisma.ReviewGetPayload<{
  include: { pullRequest: { include: { repository: true } } };
}>;

/**
 * Real ReviewsService (Phase 5) — the BullMQ *producer* side. Looks up the
 * PullRequest, fetches its diff live via PullRequestsService (still
 * HTTP-side, since the worker process must never call GitHub itself — see
 * worker.module.ts), persists a `Review` row, and enqueues a
 * `review-generation` job carrying the diff so the worker never has to
 * re-fetch it.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pullRequestsService: PullRequestsService,
    private readonly queueService: QueueService,
    private readonly githubService: GithubService,
  ) {}

  async createReview(userId: string, body: CreateReviewRequestBody): Promise<ReviewDto> {
    if (!body || typeof body.pullRequestId !== 'string' || body.pullRequestId.length === 0) {
      throw new BadRequestException('pullRequestId is required.');
    }

    const pullRequest = await this.prisma.pullRequest.findUnique({
      where: { id: body.pullRequestId },
    });
    if (!pullRequest) {
      throw new NotFoundException(`Pull request ${body.pullRequestId} not found`);
    }

    // Fetched synchronously here (HTTP side) so the worker never needs
    // GithubModule — see ReviewGenerationJobData's doc comment.
    const diff = await this.pullRequestsService.getDiff(userId, body.pullRequestId);

    const modes = {
      performance: body.modes?.performance ?? false,
      security: body.modes?.security ?? false,
      accessibility: body.modes?.accessibility ?? false,
    };

    const review = await this.prisma.review.create({
      data: {
        pullRequestId: pullRequest.id,
        requestedByUserId: userId,
        status: 'QUEUED',
        modePerformance: modes.performance,
        modeSecurity: modes.security,
        modeAccessibility: modes.accessibility,
      },
    });

    await this.queueService.enqueueReviewGeneration({
      reviewId: review.id,
      prTitle: pullRequest.title,
      // PullRequest does not currently persist the PR body/description (no
      // column for it in schema.prisma) — flagged to DBAdmin in the Phase 5
      // report as a schema gap. Passing null until that column exists.
      prDescription: null,
      diff,
      modes,
    });

    return this.toReviewDto(review);
  }

  /**
   * `GET /reviews` — Phase 8's review history dashboard.
   *
   * Scoped to `requestedByUserId === userId` exactly like every other
   * ownership check in this service — never returns another user's reviews,
   * regardless of query params.
   *
   * `riskLevel` is not a stored column — `Review` only persists a raw
   * `overallRiskScore` (0-100, nullable). It's bucketed here into
   * LOW/MEDIUM/HIGH range filters on that column using the SAME thresholds
   * as apps/web/components/RiskScoreBadge.tsx's `bandFor()` (>=70 high,
   * >=40 medium, else low) so this filter means the same thing the badge
   * already shows the user. Postgres treats `NULL < 40` / `NULL >= 40` etc.
   * as false, so every one of these range filters naturally excludes
   * not-yet-completed reviews (`overallRiskScore: null`) without an extra
   * `not: null` clause.
   */
  async listReviews(
    userId: string,
    query: ListReviewsQueryParams,
  ): Promise<ReviewListItemDto[]> {
    const where: Prisma.ReviewWhereInput = { requestedByUserId: userId };

    if (query.repositoryId) {
      where.pullRequest = { repositoryId: query.repositoryId };
    }

    if (query.riskLevel !== undefined) {
      where.overallRiskScore = this.riskScoreRangeFor(this.parseRiskLevel(query.riskLevel));
    }

    const createdAtFilter = this.parseCreatedAtRange(query.from, query.to);
    if (createdAtFilter) {
      where.createdAt = createdAtFilter;
    }

    const reviews = await this.prisma.review.findMany({
      where,
      include: { pullRequest: { include: { repository: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return reviews.map((review) => this.toReviewListItemDto(review));
  }

  private parseRiskLevel(raw: string): RiskLevel {
    if (!(RISK_LEVELS as readonly string[]).includes(raw)) {
      throw new BadRequestException(`riskLevel must be one of ${RISK_LEVELS.join(', ')}`);
    }
    return raw as RiskLevel;
  }

  /**
   * Mirrors apps/web/components/RiskScoreBadge.tsx's `bandFor()` thresholds
   * EXACTLY — keep these two in sync by hand (no shared codegen between the
   * frontend component and this service, same tradeoff as the Prisma
   * enum/shared-enum sync note in schema.prisma).
   */
  private riskScoreRangeFor(riskLevel: RiskLevel): Prisma.IntFilter {
    switch (riskLevel) {
      case 'HIGH':
        return { gte: 70 };
      case 'MEDIUM':
        return { gte: 40, lt: 70 };
      case 'LOW':
        return { lt: 40 };
    }
  }

  /**
   * `from`/`to` are parsed with `new Date(...)`, i.e. whatever the ISO
   * string resolves to verbatim — a date-only string like "2026-07-24"
   * resolves to that day's midnight UTC. For `to` specifically that means a
   * date-only value excludes the rest of that calendar day rather than
   * including it through end-of-day; flagged as an ambiguity in the Phase 8
   * report since the spec only said "ISO date strings" without pinning down
   * date-only vs. full-timestamp granularity. Callers wanting a full day
   * included should pass a full timestamp (e.g. "2026-07-24T23:59:59.999Z").
   */
  private parseCreatedAtRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (from === undefined && to === undefined) {
      return undefined;
    }

    const filter: Prisma.DateTimeFilter = {};

    if (from !== undefined) {
      const fromDate = new Date(from);
      if (Number.isNaN(fromDate.getTime())) {
        throw new BadRequestException(`Invalid "from" date: ${from}`);
      }
      filter.gte = fromDate;
    }

    if (to !== undefined) {
      const toDate = new Date(to);
      if (Number.isNaN(toDate.getTime())) {
        throw new BadRequestException(`Invalid "to" date: ${to}`);
      }
      filter.lte = toDate;
    }

    return filter;
  }

  private toReviewListItemDto(review: ReviewWithPullRequestAndRepository): ReviewListItemDto {
    return {
      id: review.id,
      status: review.status,
      overallRiskScore: review.overallRiskScore,
      summary: review.summary,
      createdAt: review.createdAt.toISOString(),
      completedAt: review.completedAt ? review.completedAt.toISOString() : null,
      pullRequestId: review.pullRequest.id,
      pullRequestNumber: review.pullRequest.number,
      pullRequestTitle: review.pullRequest.title,
      repositoryId: review.pullRequest.repository.id,
      repositoryFullName: review.pullRequest.repository.fullName,
    };
  }

  async getReviewWithFindings(
    userId: string,
    reviewId: string,
  ): Promise<{ review: ReviewDto; findings: FindingDto[] }> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: { findings: true },
    });
    if (!review) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }
    if (review.requestedByUserId !== userId) {
      // Reviews are private to whoever requested them — flagged as an
      // assumption in the Phase 5 report (Product/Frontend may want
      // repo-collaborator sharing later instead of strict per-requester
      // ownership).
      throw new ForbiddenException('You do not have access to this review.');
    }

    return {
      review: this.toReviewDto(review),
      findings: review.findings.map((finding) => toFindingDto(finding)),
    };
  }

  /**
   * `POST /reviews/:id/post-approved` — Phase 7's posting flow.
   *
   * Non-negotiable safety rule: the set of findings to post is derived
   * ENTIRELY from server-side DB state (`approved: true, postedToGithub:
   * false`) scoped to findings on this review. There is no request body
   * carrying finding ids — a client passing ids would not be sufficient
   * authorization to post, since the client's view could be stale or
   * tampered with. This Prisma query is the entire authorization surface
   * for what gets posted.
   *
   * Ownership check mirrors `getReviewWithFindings` exactly (404 if the
   * review doesn't exist, 403 if it belongs to someone else).
   *
   * Idempotent by construction: once a Finding's `postedToGithub` flips to
   * `true`, the `postedToGithub: false` filter excludes it from every
   * subsequent call, so calling this endpoint twice in a row cannot
   * double-post — no special-case dedupe code needed.
   *
   * One finding's GitHub call failing must never abort the others — each
   * post attempt is individually try/caught, successes and failures are
   * collected separately, and only successful posts get their Finding
   * updated (`postedToGithub: true`, `githubCommentId`). Failed findings are
   * left untouched so a later retry of this same endpoint will pick them up
   * again.
   */
  async postApprovedFindings(
    userId: string,
    reviewId: string,
  ): Promise<PostApprovedFindingsResponse> {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }
    if (review.requestedByUserId !== userId) {
      throw new ForbiddenException('You do not have access to this review.');
    }

    // This query IS the authorization surface — see doc comment above. No
    // finding-id list is ever accepted from the request.
    const eligibleFindings = await this.prisma.finding.findMany({
      where: { reviewId, approved: true, postedToGithub: false },
    });

    if (eligibleFindings.length === 0) {
      return { posted: [], failed: [] };
    }

    const pullRequest = await this.prisma.pullRequest.findUnique({
      where: { id: review.pullRequestId },
      include: { repository: true },
    });
    if (!pullRequest) {
      // Should be unreachable — Review.pullRequestId is a required FK — but
      // guarded defensively rather than letting a null-deref bubble up.
      throw new NotFoundException(`Pull request ${review.pullRequestId} not found`);
    }

    const owner = pullRequest.repository.ownerLogin;
    const repoName =
      pullRequest.repository.fullName.split('/')[1] ?? pullRequest.repository.fullName;

    // headSha is NOT persisted on the PullRequest row (see
    // GithubService.getPullRequest's doc comment) — fetched live so
    // line-anchored comments are always anchored against the PR's actual
    // current head commit, even if new commits landed since the last sync.
    const livePullRequest = await this.githubService.getPullRequest(
      userId,
      owner,
      repoName,
      pullRequest.number,
    );

    const posted: (FindingDto & { githubCommentUrl: string })[] = [];
    const failed: { findingId: string; error: string }[] = [];

    for (const finding of eligibleFindings) {
      try {
        const result = await this.githubService.postFindingComment(userId, {
          owner,
          repo: repoName,
          pullNumber: pullRequest.number,
          headSha: livePullRequest.headSha,
          finding,
        });

        const updated = await this.prisma.finding.update({
          where: { id: finding.id },
          data: { postedToGithub: true, githubCommentId: result.githubCommentId },
        });

        posted.push({ ...toFindingDto(updated), githubCommentUrl: result.htmlUrl });
      } catch (error) {
        failed.push({
          findingId: finding.id,
          error: error instanceof Error ? error.message : 'Unknown error while posting to GitHub.',
        });
      }
    }

    return { posted, failed };
  }

  private toReviewDto(review: PrismaReview): ReviewDto {
    return {
      id: review.id,
      pullRequestId: review.pullRequestId,
      status: review.status,
      mode: this.resolveMode(review),
      overallRiskScore: review.overallRiskScore,
      summary: review.summary,
      createdAt: review.createdAt.toISOString(),
      completedAt: review.completedAt ? review.completedAt.toISOString() : null,
    };
  }

  /**
   * `Review` stores three independent mode booleans — a review can run
   * multiple modes at once (see schema.prisma's note to Backend) — but
   * `ReviewDto.mode` is a single nullable `ReviewMode`. This is a
   * deliberately lossy mapping, flagged in the Phase 5 report: if more than
   * one mode boolean is true, only the highest-priority one is surfaced
   * here (arbitrary priority order below). Needs a product decision if
   * displaying multiple active modes matters to Frontend/Product later.
   */
  private resolveMode(review: {
    modePerformance: boolean;
    modeSecurity: boolean;
    modeAccessibility: boolean;
  }): ReviewMode | null {
    if (review.modePerformance) return 'PERFORMANCE';
    if (review.modeSecurity) return 'SECURITY';
    if (review.modeAccessibility) return 'ACCESSIBILITY';
    return null;
  }

}
