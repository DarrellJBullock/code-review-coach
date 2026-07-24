import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma, Finding as PrismaFinding, Review as PrismaReview } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { PullRequestsService } from '../pull-requests/pull-requests.service';
import type { QueueService } from '../queue/queue.service';

// GithubService's module transitively imports `@octokit/request-error`,
// which ships ESM-only and Jest's default (non-Babel) ts-jest transform
// can't parse straight out of node_modules. reviews.service.ts under test
// only needs GithubService's *type* for its constructor param + a fake
// instance is passed in at each test — so it's stubbed out here with a
// factory that never loads the real module, rather than widening Jest's
// transformIgnorePatterns project-wide for one spec file's sake.
jest.mock('../github/github.service', () => ({
  GithubService: jest.fn(),
}));

import type { GithubService } from '../github/github.service';
import { ReviewsService } from './reviews.service';

/**
 * Focused coverage for `postApprovedFindings` (Phase 7) — the
 * safety-critical bit: the endpoint's *entire* authorization surface is the
 * `approved: true, postedToGithub: false` Prisma query, never a
 * client-supplied finding-id list, and one finding's GitHub failure must
 * never abort the others. Mirrors the fake-Prisma pattern used in
 * findings.service.spec.ts / ai-review.service.spec.ts — only the handful
 * of methods ReviewsService actually touches are stubbed.
 */

function buildReview(overrides: Partial<PrismaReview> = {}): PrismaReview {
  return {
    id: 'review-1',
    pullRequestId: 'pr-1',
    requestedByUserId: 'owner-user',
    status: 'COMPLETED',
    overallRiskScore: 55,
    summary: 'Looks mostly fine.',
    modePerformance: false,
    modeSecurity: true,
    modeAccessibility: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: new Date('2026-01-01T00:05:00.000Z'),
    ...overrides,
  } as PrismaReview;
}

function buildFinding(overrides: Partial<PrismaFinding> = {}): PrismaFinding {
  return {
    id: 'finding-1',
    reviewId: 'review-1',
    category: 'SECURITY',
    riskLevel: 'HIGH',
    riskJustification: 'Token is logged in plaintext.',
    title: 'Token logged in plaintext',
    whyItMatters: 'Logs may be shipped to third parties.',
    whatCouldBreak: 'A leaked log could let an attacker impersonate a user.',
    suggestedFix: 'Redact the token before logging.',
    suggestedTest: 'Assert log output never contains the raw token.',
    filePath: 'src/auth/auth.service.ts',
    lineRangeStart: 10,
    lineRangeEnd: 12,
    approved: true,
    postedToGithub: false,
    githubCommentId: null,
    ...overrides,
  } as PrismaFinding;
}

function buildPullRequestWithRepository() {
  return {
    id: 'pr-1',
    repositoryId: 'repo-1',
    number: 28,
    repository: {
      id: 'repo-1',
      fullName: 'darrellbullock/heritage-saturday',
      ownerLogin: 'darrellbullock',
    },
  };
}

function buildFakePrisma(options: {
  review?: PrismaReview | null;
  eligibleFindings?: PrismaFinding[];
  pullRequest?: ReturnType<typeof buildPullRequestWithRepository> | null;
}) {
  const reviewFindUnique = jest.fn().mockResolvedValue(options.review ?? null);
  const findingFindMany = jest.fn().mockResolvedValue(options.eligibleFindings ?? []);
  const findingUpdate = jest.fn().mockImplementation(({ where, data }) =>
    Promise.resolve({
      ...(options.eligibleFindings ?? []).find((f) => f.id === where.id),
      ...data,
    }),
  );
  const pullRequestFindUnique = jest
    .fn()
    .mockResolvedValue(options.pullRequest === undefined ? buildPullRequestWithRepository() : options.pullRequest);

  const fakePrisma = {
    review: { findUnique: reviewFindUnique },
    finding: { findMany: findingFindMany, update: findingUpdate },
    pullRequest: { findUnique: pullRequestFindUnique },
  } as unknown as PrismaService;

  return { fakePrisma, reviewFindUnique, findingFindMany, findingUpdate, pullRequestFindUnique };
}

function buildFakeGithub(overrides: Partial<GithubService> = {}) {
  const getPullRequest = jest.fn().mockResolvedValue({
    githubPrId: 999,
    number: 28,
    title: 'Add rate limiting',
    authorLogin: 'darrellbullock',
    headBranch: 'feature-branch',
    headSha: 'abc123headsha',
    baseBranch: 'main',
    baseSha: 'def456basesha',
    state: 'open',
    url: 'https://github.com/darrellbullock/heritage-saturday/pull/28',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  const postFindingComment = jest.fn().mockResolvedValue({
    githubCommentId: '111',
    htmlUrl: 'https://github.com/darrellbullock/heritage-saturday/pull/28#discussion_r111',
    anchored: true,
  });

  const fakeGithub = {
    getPullRequest,
    postFindingComment,
    ...overrides,
  } as unknown as GithubService;

  return { fakeGithub, getPullRequest, postFindingComment };
}

function buildService(
  fakePrisma: PrismaService,
  fakeGithub: GithubService,
): ReviewsService {
  const fakePullRequestsService = {} as unknown as PullRequestsService;
  const fakeQueueService = {} as unknown as QueueService;
  return new ReviewsService(fakePrisma, fakePullRequestsService, fakeQueueService, fakeGithub);
}

describe('ReviewsService.postApprovedFindings', () => {
  it('only posts findings that are approved && !postedToGithub — the query is the entire authorization surface', async () => {
    const eligible = buildFinding({ id: 'finding-eligible' });
    const { fakePrisma, findingFindMany, findingUpdate } = buildFakePrisma({
      review: buildReview(),
      eligibleFindings: [eligible],
    });
    const { fakeGithub, postFindingComment } = buildFakeGithub();
    const service = buildService(fakePrisma, fakeGithub);

    const result = await service.postApprovedFindings('owner-user', 'review-1');

    expect(findingFindMany).toHaveBeenCalledWith({
      where: { reviewId: 'review-1', approved: true, postedToGithub: false },
    });
    expect(postFindingComment).toHaveBeenCalledTimes(1);
    expect(findingUpdate).toHaveBeenCalledWith({
      where: { id: 'finding-eligible' },
      data: { postedToGithub: true, githubCommentId: '111' },
    });
    expect(result.posted).toHaveLength(1);
    expect(result.posted[0].githubCommentUrl).toContain('github.com');
    expect(result.failed).toHaveLength(0);
  });

  it('a partial failure (one finding throws) does not prevent the others from posting, and is reported in failed', async () => {
    const good = buildFinding({ id: 'finding-good' });
    const bad = buildFinding({ id: 'finding-bad' });
    const { fakePrisma, findingUpdate } = buildFakePrisma({
      review: buildReview(),
      eligibleFindings: [good, bad],
    });
    const { fakeGithub, postFindingComment } = buildFakeGithub();
    // Findings are processed in `eligibleFindings` order (see the fake
    // Prisma's `findMany` stub above): the first call (for "finding-good")
    // succeeds, the second (for "finding-bad") rejects.
    postFindingComment
      .mockResolvedValueOnce({
        githubCommentId: '111',
        htmlUrl: 'https://github.com/x/y/pull/1#discussion_r111',
        anchored: true,
      })
      .mockRejectedValueOnce(new Error('GitHub denied access while posting.'));

    const service = buildService(fakePrisma, fakeGithub);

    const result = await service.postApprovedFindings('owner-user', 'review-1');

    expect(postFindingComment).toHaveBeenCalledTimes(2);
    expect(result.posted).toHaveLength(1);
    expect(result.posted[0].id).toBe('finding-good');
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toEqual({
      findingId: 'finding-bad',
      error: 'GitHub denied access while posting.',
    });
    // The failed finding must never be marked posted.
    expect(findingUpdate).toHaveBeenCalledTimes(1);
    expect(findingUpdate).toHaveBeenCalledWith({
      where: { id: 'finding-good' },
      data: { postedToGithub: true, githubCommentId: '111' },
    });
  });

  it('returns 200 with empty arrays when there are zero eligible findings, without calling GitHub', async () => {
    const { fakePrisma, pullRequestFindUnique } = buildFakePrisma({
      review: buildReview(),
      eligibleFindings: [],
    });
    const { fakeGithub, getPullRequest, postFindingComment } = buildFakeGithub();
    const service = buildService(fakePrisma, fakeGithub);

    const result = await service.postApprovedFindings('owner-user', 'review-1');

    expect(result).toEqual({ posted: [], failed: [] });
    expect(getPullRequest).not.toHaveBeenCalled();
    expect(postFindingComment).not.toHaveBeenCalled();
    expect(pullRequestFindUnique).not.toHaveBeenCalled();
  });

  it('throws 404 when the review does not exist', async () => {
    const { fakePrisma } = buildFakePrisma({ review: null });
    const { fakeGithub } = buildFakeGithub();
    const service = buildService(fakePrisma, fakeGithub);

    await expect(service.postApprovedFindings('owner-user', 'missing-review')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("throws 403 when the review belongs to another user", async () => {
    const { fakePrisma } = buildFakePrisma({ review: buildReview({ requestedByUserId: 'owner-user' }) });
    const { fakeGithub } = buildFakeGithub();
    const service = buildService(fakePrisma, fakeGithub);

    await expect(service.postApprovedFindings('someone-else', 'review-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

/**
 * Focused coverage for `listReviews` (Phase 8, review history dashboard).
 *
 * `findMany`'s where-clause matching is emulated in-memory rather than just
 * asserting on the raw `where` object handed to a jest.fn() — this lets the
 * tests below verify the ACTUAL narrowing behavior (ownership scoping,
 * repositoryId filter, riskLevel bucketing incl. null exclusion, date
 * range, sort order) the way Postgres would apply it, including that
 * numeric/date range comparisons against `null` are false (matching SQL's
 * NULL-comparison semantics), not just that some where object was passed.
 */

type FakeReviewRow = PrismaReview & {
  pullRequest: {
    id: string;
    repositoryId: string;
    number: number;
    title: string;
    repository: { id: string; fullName: string };
  };
};

function buildReviewRow(overrides: Partial<FakeReviewRow> = {}): FakeReviewRow {
  return {
    id: 'review-x',
    pullRequestId: 'pr-x',
    requestedByUserId: 'user-1',
    status: 'COMPLETED',
    overallRiskScore: 50,
    summary: 'Summary.',
    modePerformance: false,
    modeSecurity: false,
    modeAccessibility: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: new Date('2026-01-01T00:05:00.000Z'),
    pullRequest: {
      id: 'pr-x',
      repositoryId: 'repo-x',
      number: 1,
      title: 'A pull request',
      repository: { id: 'repo-x', fullName: 'acme/webapp' },
    },
    ...overrides,
  } as FakeReviewRow;
}

function matchesNumberRange(
  value: number | null,
  filter?: { gte?: number; gt?: number; lte?: number; lt?: number },
): boolean {
  if (!filter) return true;
  // Mirrors Postgres: any comparison against NULL is false.
  if (value === null || value === undefined) return false;
  if (filter.gte !== undefined && !(value >= filter.gte)) return false;
  if (filter.gt !== undefined && !(value > filter.gt)) return false;
  if (filter.lte !== undefined && !(value <= filter.lte)) return false;
  if (filter.lt !== undefined && !(value < filter.lt)) return false;
  return true;
}

function matchesDateRange(value: Date, filter?: { gte?: Date; lte?: Date }): boolean {
  if (!filter) return true;
  if (filter.gte !== undefined && !(value.getTime() >= filter.gte.getTime())) return false;
  if (filter.lte !== undefined && !(value.getTime() <= filter.lte.getTime())) return false;
  return true;
}

function buildFakePrismaForList(allReviews: FakeReviewRow[]) {
  const findMany = jest
    .fn()
    .mockImplementation(({ where }: { where: Prisma.ReviewWhereInput }) => {
      const pullRequestFilter = where.pullRequest as { repositoryId?: string } | undefined;

      const matched = allReviews.filter((review) => {
        if (
          where.requestedByUserId !== undefined &&
          review.requestedByUserId !== where.requestedByUserId
        ) {
          return false;
        }
        if (pullRequestFilter?.repositoryId !== undefined) {
          if (review.pullRequest.repositoryId !== pullRequestFilter.repositoryId) return false;
        }
        if (
          !matchesNumberRange(
            review.overallRiskScore,
            where.overallRiskScore as { gte?: number; lt?: number } | undefined,
          )
        ) {
          return false;
        }
        if (
          !matchesDateRange(
            review.createdAt,
            where.createdAt as { gte?: Date; lte?: Date } | undefined,
          )
        ) {
          return false;
        }
        return true;
      });

      matched.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return Promise.resolve(matched);
    });

  const fakePrisma = { review: { findMany } } as unknown as PrismaService;
  return { fakePrisma, findMany };
}

function buildServiceForList(fakePrisma: PrismaService): ReviewsService {
  const fakePullRequestsService = {} as unknown as PullRequestsService;
  const fakeQueueService = {} as unknown as QueueService;
  const fakeGithub = {} as unknown as import('../github/github.service').GithubService;
  return new ReviewsService(fakePrisma, fakePullRequestsService, fakeQueueService, fakeGithub);
}

describe('ReviewsService.listReviews', () => {
  // Owned by user-1, spread across two repos, one review still QUEUED
  // (null overallRiskScore).
  const reviewHighRepo1 = buildReviewRow({
    id: 'review-high-repo1',
    requestedByUserId: 'user-1',
    overallRiskScore: 85, // >= 70 -> HIGH
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    pullRequest: {
      id: 'pr-high',
      repositoryId: 'repo-1',
      number: 10,
      title: 'Fix auth bypass',
      repository: { id: 'repo-1', fullName: 'acme/webapp' },
    },
  });
  const reviewMediumRepo2 = buildReviewRow({
    id: 'review-medium-repo2',
    requestedByUserId: 'user-1',
    overallRiskScore: 50, // >= 40 and < 70 -> MEDIUM
    createdAt: new Date('2026-02-15T00:00:00.000Z'),
    pullRequest: {
      id: 'pr-medium',
      repositoryId: 'repo-2',
      number: 20,
      title: 'Add response caching',
      repository: { id: 'repo-2', fullName: 'acme/api' },
    },
  });
  const reviewLowRepo1 = buildReviewRow({
    id: 'review-low-repo1',
    requestedByUserId: 'user-1',
    overallRiskScore: 10, // < 40 -> LOW
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    pullRequest: {
      id: 'pr-low',
      repositoryId: 'repo-1',
      number: 30,
      title: 'Update README',
      repository: { id: 'repo-1', fullName: 'acme/webapp' },
    },
  });
  const reviewQueuedRepo1 = buildReviewRow({
    id: 'review-queued-repo1',
    requestedByUserId: 'user-1',
    status: 'QUEUED',
    overallRiskScore: null, // not yet completed
    completedAt: null,
    createdAt: new Date('2026-03-05T00:00:00.000Z'),
    pullRequest: {
      id: 'pr-queued',
      repositoryId: 'repo-1',
      number: 40,
      title: 'WIP: rate limiter',
      repository: { id: 'repo-1', fullName: 'acme/webapp' },
    },
  });
  const otherUsersReview = buildReviewRow({
    id: 'review-other-user',
    requestedByUserId: 'user-2',
    overallRiskScore: 90,
    createdAt: new Date('2026-01-20T00:00:00.000Z'),
    pullRequest: {
      id: 'pr-other',
      repositoryId: 'repo-3',
      number: 1,
      title: "Someone else's PR",
      repository: { id: 'repo-3', fullName: 'acme/other' },
    },
  });

  const allReviews = [
    reviewHighRepo1,
    reviewMediumRepo2,
    reviewLowRepo1,
    reviewQueuedRepo1,
    otherUsersReview,
  ];

  it("(a) only returns the current user's reviews, sorted newest-first, and never another user's", async () => {
    const { fakePrisma } = buildFakePrismaForList(allReviews);
    const service = buildServiceForList(fakePrisma);

    const result = await service.listReviews('user-1', {});

    expect(result.map((r) => r.id)).toEqual([
      'review-queued-repo1', // 2026-03-05
      'review-low-repo1', // 2026-03-01
      'review-medium-repo2', // 2026-02-15
      'review-high-repo1', // 2026-01-10
    ]);
    expect(result.some((r) => r.id === 'review-other-user')).toBe(false);
  });

  it('(b) repositoryId filters to reviews whose PullRequest belongs to that Repository', async () => {
    const { fakePrisma } = buildFakePrismaForList(allReviews);
    const service = buildServiceForList(fakePrisma);

    const result = await service.listReviews('user-1', { repositoryId: 'repo-1' });

    expect(result.map((r) => r.id)).toEqual([
      'review-queued-repo1',
      'review-low-repo1',
      'review-high-repo1',
    ]);
    expect(result.every((r) => r.repositoryId === 'repo-1')).toBe(true);
  });

  it('(c) riskLevel buckets using RiskScoreBadge thresholds (>=70 high, >=40 medium, else low) and excludes null scores', async () => {
    const { fakePrisma } = buildFakePrismaForList(allReviews);
    const service = buildServiceForList(fakePrisma);

    const high = await service.listReviews('user-1', { riskLevel: 'HIGH' });
    expect(high.map((r) => r.id)).toEqual(['review-high-repo1']);

    const medium = await service.listReviews('user-1', { riskLevel: 'MEDIUM' });
    expect(medium.map((r) => r.id)).toEqual(['review-medium-repo2']);

    const low = await service.listReviews('user-1', { riskLevel: 'LOW' });
    expect(low.map((r) => r.id)).toEqual(['review-low-repo1']);

    // The QUEUED review (null overallRiskScore) must never appear under any
    // riskLevel filter.
    expect([...high, ...medium, ...low].some((r) => r.id === 'review-queued-repo1')).toBe(false);
  });

  it('(c.1) rejects an invalid riskLevel with a 400', async () => {
    const { fakePrisma } = buildFakePrismaForList(allReviews);
    const service = buildServiceForList(fakePrisma);

    await expect(
      service.listReviews('user-1', { riskLevel: 'EXTREME' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('(d) from/to filters createdAt as an inclusive range', async () => {
    const { fakePrisma } = buildFakePrismaForList(allReviews);
    const service = buildServiceForList(fakePrisma);

    const result = await service.listReviews('user-1', {
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-03-02T00:00:00.000Z',
    });

    expect(result.map((r) => r.id)).toEqual(['review-low-repo1', 'review-medium-repo2']);
  });

  it('(d.1) rejects an invalid "from"/"to" date with a 400', async () => {
    const { fakePrisma } = buildFakePrismaForList(allReviews);
    const service = buildServiceForList(fakePrisma);

    await expect(
      service.listReviews('user-1', { from: 'not-a-date' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('(e) results are sorted createdAt desc (newest first) regardless of fixture insertion order', async () => {
    const { fakePrisma } = buildFakePrismaForList([...allReviews].reverse());
    const service = buildServiceForList(fakePrisma);

    const result = await service.listReviews('user-1', {});
    const createdAts = result.map((r) => new Date(r.createdAt).getTime());
    const sortedDesc = [...createdAts].sort((a, b) => b - a);
    expect(createdAts).toEqual(sortedDesc);
  });

  it('maps the denormalized ReviewListItemDto shape correctly (no N+1: pullRequest + repository come from the same row)', async () => {
    const { fakePrisma } = buildFakePrismaForList([reviewHighRepo1]);
    const service = buildServiceForList(fakePrisma);

    const [item] = await service.listReviews('user-1', {});

    expect(item).toEqual({
      id: 'review-high-repo1',
      status: 'COMPLETED',
      overallRiskScore: 85,
      summary: 'Summary.',
      createdAt: '2026-01-10T00:00:00.000Z',
      completedAt: '2026-01-01T00:05:00.000Z',
      pullRequestId: 'pr-high',
      pullRequestNumber: 10,
      pullRequestTitle: 'Fix auth bypass',
      repositoryId: 'repo-1',
      repositoryFullName: 'acme/webapp',
    });
  });
});
