import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { GithubClientFactory } from './github-client.factory';

// github.service.ts imports `RequestError` from `@octokit/request-error`,
// which ships ESM-only and Jest's default (non-Babel) ts-jest transform
// can't parse straight out of node_modules (confirmed: importing
// GithubService directly, unmocked, throws "Unexpected token 'export'" from
// @octokit/request-error/dist-src/index.js). Mirrors the approach already
// used in reviews.service.spec.ts for the same underlying problem, except
// here GithubService itself is the module under test, so instead of
// stubbing GithubService out entirely we provide a minimal fake RequestError
// class with just the shape (`status`, `response.headers`) that
// GithubService#handleError actually branches on. Both this spec and
// github.service.ts import the same mocked module, so `instanceof` checks
// inside handleError still work correctly against errors built with this
// fake class below.
class FakeRequestError extends Error {
  status: number;
  response?: { headers?: Record<string, string> };

  constructor(message: string, status: number, options?: { response?: { headers?: Record<string, string> } }) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.response = options?.response;
  }
}

jest.mock('@octokit/request-error', () => ({ RequestError: FakeRequestError }));

// GithubClientFactory transitively imports `@octokit/rest`, which is also
// ESM-only and hits the same "Unexpected token 'export'"/"Cannot use import
// statement outside a module" wall as `@octokit/request-error` above. Every
// test below only needs GithubClientFactory's *type* for the constructor
// param — a fake `{ getClientForUser }` is passed in per-test — so it's
// stubbed out here the same way reviews.service.spec.ts stubs out
// GithubService itself, rather than widening Jest's transformIgnorePatterns
// project-wide.
jest.mock('./github-client.factory', () => ({ GithubClientFactory: jest.fn() }));

import { GithubService } from './github.service';

function buildFakeOctokit() {
  const paginate = jest.fn();
  const reposGet = jest.fn();
  const pullsList = jest.fn();
  const pullsGet = jest.fn();
  const pullsListFiles = jest.fn();
  const pullsCreateReviewComment = jest.fn();
  const issuesCreateComment = jest.fn();

  const octokit = {
    paginate,
    rest: {
      repos: {
        listForAuthenticatedUser: jest.fn(),
        get: reposGet,
      },
      pulls: {
        list: pullsList,
        get: pullsGet,
        listFiles: pullsListFiles,
        createReviewComment: pullsCreateReviewComment,
      },
      issues: {
        createComment: issuesCreateComment,
      },
    },
  };

  return {
    octokit,
    paginate,
    reposGet,
    pullsList,
    pullsGet,
    pullsListFiles,
    pullsCreateReviewComment,
    issuesCreateComment,
  };
}

function buildService(octokit: unknown) {
  const getClientForUser = jest.fn().mockResolvedValue(octokit);
  const fakeClientFactory = { getClientForUser } as unknown as GithubClientFactory;
  const service = new GithubService(fakeClientFactory);
  return { service, getClientForUser };
}

const rawRepo = {
  id: 123,
  owner: { login: 'darrellbullock' },
  name: 'code-review-coach',
  full_name: 'darrellbullock/code-review-coach',
  private: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
};

const rawPr = {
  id: 999,
  number: 28,
  title: 'Add rate limiting',
  user: { login: 'darrellbullock' },
  head: { ref: 'feature-branch', sha: 'abc123headsha' },
  base: { ref: 'main', sha: 'def456basesha' },
  state: 'open',
  html_url: 'https://github.com/darrellbullock/code-review-coach/pull/28',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T01:00:00.000Z',
};

const finding = {
  category: 'SECURITY' as const,
  riskLevel: 'HIGH' as const,
  riskJustification: 'Token is logged in plaintext.',
  title: 'Token logged in plaintext',
  whyItMatters: 'Logs may be shipped to third parties.',
  whatCouldBreak: 'A leaked log could let an attacker impersonate a user.',
  suggestedFix: 'Redact the token before logging.',
  suggestedTest: 'Assert log output never contains the raw token.',
  filePath: 'src/auth/auth.service.ts',
  lineRangeEnd: 12,
};

describe('GithubService', () => {
  describe('listUserRepos', () => {
    it('paginates repos.listForAuthenticatedUser and maps each repo', async () => {
      const { octokit, paginate } = buildFakeOctokit();
      paginate.mockResolvedValue([rawRepo]);
      const { service } = buildService(octokit);

      const result = await service.listUserRepos('user-1');

      expect(paginate).toHaveBeenCalledWith(octokit.rest.repos.listForAuthenticatedUser, {
        per_page: 100,
        sort: 'updated',
      });
      expect(result).toEqual([
        {
          githubId: 123,
          owner: 'darrellbullock',
          name: 'code-review-coach',
          fullName: 'darrellbullock/code-review-coach',
          isPrivate: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('getRepository', () => {
    it('maps a single repo from repos.get', async () => {
      const { octokit, reposGet } = buildFakeOctokit();
      reposGet.mockResolvedValue({ data: rawRepo });
      const { service } = buildService(octokit);

      const result = await service.getRepository('user-1', 'darrellbullock', 'code-review-coach');

      expect(reposGet).toHaveBeenCalledWith({ owner: 'darrellbullock', repo: 'code-review-coach' });
      expect(result.fullName).toBe('darrellbullock/code-review-coach');
    });
  });

  describe('listOpenPullRequests / getPullRequest', () => {
    it('maps PR fields, including SHAs and branch names', async () => {
      const { octokit, paginate } = buildFakeOctokit();
      paginate.mockResolvedValue([rawPr]);
      const { service } = buildService(octokit);

      const result = await service.listOpenPullRequests('user-1', 'darrellbullock', 'code-review-coach');

      expect(result).toEqual([
        {
          githubPrId: 999,
          number: 28,
          title: 'Add rate limiting',
          authorLogin: 'darrellbullock',
          headBranch: 'feature-branch',
          headSha: 'abc123headsha',
          baseBranch: 'main',
          baseSha: 'def456basesha',
          state: 'open',
          url: 'https://github.com/darrellbullock/code-review-coach/pull/28',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T01:00:00.000Z',
        },
      ]);
    });

    it('falls back to "unknown" authorLogin when the PR has no user', async () => {
      const { octokit, pullsGet } = buildFakeOctokit();
      pullsGet.mockResolvedValue({ data: { ...rawPr, user: null } });
      const { service } = buildService(octokit);

      const result = await service.getPullRequest('user-1', 'darrellbullock', 'code-review-coach', 28);

      expect(result.authorLogin).toBe('unknown');
    });
  });

  describe('getPullRequestChangedFiles', () => {
    it('maps file entries from pulls.listFiles', async () => {
      const { octokit, paginate } = buildFakeOctokit();
      paginate.mockResolvedValue([
        { filename: 'src/x.ts', status: 'modified', additions: 3, deletions: 1, patch: '@@ -1 +1 @@' },
      ]);
      const { service } = buildService(octokit);

      const result = await service.getPullRequestChangedFiles(
        'user-1',
        'darrellbullock',
        'code-review-coach',
        28,
      );

      expect(result).toEqual([
        { filename: 'src/x.ts', status: 'modified', additions: 3, deletions: 1, patch: '@@ -1 +1 @@' },
      ]);
    });
  });

  describe('getPullRequestRawDiff', () => {
    it('returns the raw diff text response body as-is', async () => {
      const { octokit, pullsGet } = buildFakeOctokit();
      pullsGet.mockResolvedValue({ data: 'diff --git a/x b/x\n+added line\n' });
      const { service } = buildService(octokit);

      const result = await service.getPullRequestRawDiff('user-1', 'darrellbullock', 'code-review-coach', 28);

      expect(pullsGet).toHaveBeenCalledWith({
        owner: 'darrellbullock',
        repo: 'code-review-coach',
        pull_number: 28,
        mediaType: { format: 'diff' },
      });
      expect(result).toBe('diff --git a/x b/x\n+added line\n');
    });
  });

  describe('postFindingComment', () => {
    it('posts a line-anchored review comment when filePath + lineRangeEnd are present, and never falls back', async () => {
      const { octokit, pullsCreateReviewComment, issuesCreateComment } = buildFakeOctokit();
      pullsCreateReviewComment.mockResolvedValue({
        data: { id: 111, html_url: 'https://github.com/x/y/pull/28#discussion_r111' },
      });
      const { service } = buildService(octokit);

      const result = await service.postFindingComment('user-1', {
        owner: 'darrellbullock',
        repo: 'code-review-coach',
        pullNumber: 28,
        headSha: 'abc123headsha',
        finding,
      });

      expect(pullsCreateReviewComment).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'darrellbullock',
          repo: 'code-review-coach',
          pull_number: 28,
          commit_id: 'abc123headsha',
          path: 'src/auth/auth.service.ts',
          line: 12,
        }),
      );
      expect(issuesCreateComment).not.toHaveBeenCalled();
      expect(result).toEqual({
        githubCommentId: '111',
        htmlUrl: 'https://github.com/x/y/pull/28#discussion_r111',
        anchored: true,
      });
    });

    it('falls back to a general PR comment (with a "could not anchor" prefix) when the anchored attempt throws', async () => {
      const { octokit, pullsCreateReviewComment, issuesCreateComment } = buildFakeOctokit();
      pullsCreateReviewComment.mockRejectedValue(new FakeRequestError('Unprocessable', 422));
      issuesCreateComment.mockResolvedValue({
        data: { id: 222, html_url: 'https://github.com/x/y/pull/28#issuecomment-222' },
      });
      const { service } = buildService(octokit);

      const result = await service.postFindingComment('user-1', {
        owner: 'darrellbullock',
        repo: 'code-review-coach',
        pullNumber: 28,
        headSha: 'abc123headsha',
        finding,
      });

      expect(issuesCreateComment).toHaveBeenCalledTimes(1);
      const [callArgs] = issuesCreateComment.mock.calls[0];
      expect(callArgs.body).toContain("Couldn't anchor this comment");
      expect(callArgs.body).toContain('src/auth/auth.service.ts:12');
      expect(result).toEqual({
        githubCommentId: '222',
        htmlUrl: 'https://github.com/x/y/pull/28#issuecomment-222',
        anchored: false,
      });
    });

    it('skips the anchored attempt entirely (no "could not anchor" prefix) when the finding has no filePath/lineRangeEnd', async () => {
      const { octokit, pullsCreateReviewComment, issuesCreateComment } = buildFakeOctokit();
      issuesCreateComment.mockResolvedValue({
        data: { id: 333, html_url: 'https://github.com/x/y/pull/28#issuecomment-333' },
      });
      const { service } = buildService(octokit);

      const { filePath, lineRangeEnd, ...findingWithoutLocation } = finding;
      void filePath;
      void lineRangeEnd;

      const result = await service.postFindingComment('user-1', {
        owner: 'darrellbullock',
        repo: 'code-review-coach',
        pullNumber: 28,
        headSha: 'abc123headsha',
        finding: findingWithoutLocation as typeof finding,
      });

      expect(pullsCreateReviewComment).not.toHaveBeenCalled();
      const [callArgs] = issuesCreateComment.mock.calls[0];
      expect(callArgs.body).not.toContain("Couldn't anchor");
      expect(result.anchored).toBe(false);
      expect(result.githubCommentId).toBe('333');
    });

    it('maps a failure of the fallback general-comment call through handleError (e.g. 404 -> NotFoundException)', async () => {
      const { octokit, pullsCreateReviewComment, issuesCreateComment } = buildFakeOctokit();
      pullsCreateReviewComment.mockRejectedValue(new FakeRequestError('Unprocessable', 422));
      issuesCreateComment.mockRejectedValue(new FakeRequestError('Not Found', 404));
      const { service } = buildService(octokit);

      await expect(
        service.postFindingComment('user-1', {
          owner: 'darrellbullock',
          repo: 'code-review-coach',
          pullNumber: 28,
          headSha: 'abc123headsha',
          finding,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('handleError status-code mapping (via listUserRepos)', () => {
    it('maps a rate-limited 403 (x-ratelimit-remaining: 0) to a 429 HttpException', async () => {
      const { octokit, paginate } = buildFakeOctokit();
      paginate.mockRejectedValue(
        new FakeRequestError('Forbidden', 403, { response: { headers: { 'x-ratelimit-remaining': '0' } } }),
      );
      const { service } = buildService(octokit);

      await expect(service.listUserRepos('user-1')).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
      await expect(service.listUserRepos('user-1')).rejects.toBeInstanceOf(HttpException);
    });

    it('maps a 401 to UnauthorizedException', async () => {
      const { octokit, paginate } = buildFakeOctokit();
      paginate.mockRejectedValue(new FakeRequestError('Bad credentials', 401));
      const { service } = buildService(octokit);

      await expect(service.listUserRepos('user-1')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('maps a non-rate-limited 403 to ForbiddenException', async () => {
      const { octokit, paginate } = buildFakeOctokit();
      paginate.mockRejectedValue(new FakeRequestError('Forbidden', 403));
      const { service } = buildService(octokit);

      await expect(service.listUserRepos('user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('maps a 404 to NotFoundException', async () => {
      const { octokit, paginate } = buildFakeOctokit();
      paginate.mockRejectedValue(new FakeRequestError('Not Found', 404));
      const { service } = buildService(octokit);

      await expect(service.listUserRepos('user-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps any other RequestError status to BadGatewayException', async () => {
      const { octokit, paginate } = buildFakeOctokit();
      paginate.mockRejectedValue(new FakeRequestError('Server Error', 500));
      const { service } = buildService(octokit);

      await expect(service.listUserRepos('user-1')).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('maps a non-RequestError thrown value to a generic BadGatewayException', async () => {
      const { octokit, paginate } = buildFakeOctokit();
      paginate.mockRejectedValue(new Error('totally unexpected'));
      const { service } = buildService(octokit);

      await expect(service.listUserRepos('user-1')).rejects.toBeInstanceOf(BadGatewayException);
    });
  });
});
