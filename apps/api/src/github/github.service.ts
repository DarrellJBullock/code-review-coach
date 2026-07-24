import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestError } from '@octokit/request-error';
import type { FindingDto, PullRequestChangedFileDto, RepositoryDto } from '@code-review-coach/shared';
import { GithubClientFactory } from './github-client.factory';

/**
 * Live GitHub-sourced repo summary, shaped like `RepositoryDto` minus the
 * internal DB `id` — GithubService never touches Postgres, so it cannot
 * know a repo's internal id (RepositoriesService is responsible for
 * attaching that once a repo has been "selected"/persisted).
 */
export type GithubRepoSummary = Omit<RepositoryDto, 'id'>;

/**
 * Live GitHub-sourced PR summary. Includes both GitHub's global PR id
 * (`githubPrId`, stable across force-pushes/renames — mirrors
 * `PullRequest.githubPrId` in the Prisma schema) and branch names
 * (`headBranch`/`baseBranch`, mirrors `PullRequest.headBranch`/`baseBranch`
 * in the schema) in addition to the SHAs that `PullRequestDto` exposes to
 * the frontend, since PullRequestsService needs the branch names to persist
 * a `PullRequest` row.
 */
export interface GithubPullRequestSummary {
  githubPrId: number;
  number: number;
  title: string;
  authorLogin: string;
  headBranch: string;
  headSha: string;
  baseBranch: string;
  baseSha: string;
  state: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Everything `postFindingComment` needs from a Finding to build a comment
 * body and (optionally) anchor it to a line. Deliberately a `Pick` of
 * `FindingDto` rather than a Prisma type — GithubService never touches
 * Postgres (see `GithubRepoSummary`'s doc comment above) and callers already
 * hold a Prisma `Finding` row whose field names line up with `FindingDto`'s,
 * so no explicit mapping is required at the call site.
 */
export type FindingCommentInput = Pick<
  FindingDto,
  | 'category'
  | 'riskLevel'
  | 'riskJustification'
  | 'title'
  | 'whyItMatters'
  | 'whatCouldBreak'
  | 'suggestedFix'
  | 'suggestedTest'
  | 'filePath'
  | 'lineRangeEnd'
>;

export interface PostFindingCommentParams {
  owner: string;
  repo: string;
  pullNumber: number;
  /** SHA of the PR's current head commit — required by `commit_id` for line-anchored review comments. */
  headSha: string;
  finding: FindingCommentInput;
}

export interface PostFindingCommentResult {
  /** Stringified GitHub comment id (review-comment id or issue-comment id, depending on `anchored`). */
  githubCommentId: string;
  /** `html_url` of the created comment, for linking back to it. */
  htmlUrl: string;
  /** True if this landed as a line-anchored review comment; false if it fell back to a general PR comment. */
  anchored: boolean;
}

/**
 * Thin wrapper around Octokit for everything this app needs from GitHub's
 * REST API. Every method builds its own short-lived Octokit client (see
 * GithubClientFactory) rather than caching one per user.
 */
@Injectable()
export class GithubService {
  constructor(private readonly clientFactory: GithubClientFactory) {}

  /**
   * Lists every repo the authenticated user has access to (own + org +
   * collaborator repos — matches GitHub's own "your repositories" list),
   * paginated at 100/page, sorted by most-recently-updated first.
   */
  async listUserRepos(userId: string): Promise<GithubRepoSummary[]> {
    const octokit = await this.clientFactory.getClientForUser(userId);
    try {
      const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
        per_page: 100,
        sort: 'updated',
      });
      return repos.map((repo) => this.mapRepo(repo));
    } catch (error) {
      this.handleError(error, 'listing repositories');
    }
  }

  /** Fetches a single repo's details directly (used by the "select repository" flow). */
  async getRepository(userId: string, owner: string, repo: string): Promise<GithubRepoSummary> {
    const octokit = await this.clientFactory.getClientForUser(userId);
    try {
      const { data } = await octokit.rest.repos.get({ owner, repo });
      return this.mapRepo(data);
    } catch (error) {
      this.handleError(error, `fetching repository ${owner}/${repo}`);
    }
  }

  /** Lists currently-open PRs for a repo, paginated at 100/page. */
  async listOpenPullRequests(
    userId: string,
    owner: string,
    repo: string,
  ): Promise<GithubPullRequestSummary[]> {
    const octokit = await this.clientFactory.getClientForUser(userId);
    try {
      const pulls = await octokit.paginate(octokit.rest.pulls.list, {
        owner,
        repo,
        state: 'open',
        per_page: 100,
      });
      return pulls.map((pr) => this.mapPullRequest(pr));
    } catch (error) {
      this.handleError(error, `listing pull requests for ${owner}/${repo}`);
    }
  }

  /**
   * Fetches a single PR's live details directly — in particular its current
   * `headSha`, which is NOT persisted on the `PullRequest` DB row (that
   * model only stores branch names, not SHAs; see schema.prisma). Used by
   * the Phase 7 posting flow so line-anchored review comments are always
   * anchored against the PR's actual current head commit, even if new
   * commits landed since the last `PullRequestsService.listForRepository`
   * sync.
   */
  async getPullRequest(
    userId: string,
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<GithubPullRequestSummary> {
    const octokit = await this.clientFactory.getClientForUser(userId);
    try {
      const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
      return this.mapPullRequest(data);
    } catch (error) {
      this.handleError(error, `fetching pull request #${pullNumber} in ${owner}/${repo}`);
    }
  }

  /**
   * Posts a single Finding as a comment on a real GitHub PR. Tries a
   * line-anchored review comment first (requires `finding.filePath` +
   * `finding.lineRangeEnd`, and requires that line to be part of the PR's
   * diff — GitHub returns 422 otherwise, which is an expected, not
   * exceptional, outcome here); falls back to a general (issue-style) PR
   * comment on ANY failure of that first attempt, or immediately if the
   * finding has no file/line to anchor to at all.
   *
   * Deliberately does NOT decide *which* findings to post — that
   * authorization decision (approved && !postedToGithub, scoped to the
   * requesting user's own review) is entirely the caller's (ReviewsService)
   * responsibility, per the product's non-negotiable "never auto-post"
   * safety rule. This method only knows how to post one already-authorized
   * finding.
   */
  async postFindingComment(
    userId: string,
    params: PostFindingCommentParams,
  ): Promise<PostFindingCommentResult> {
    const octokit = await this.clientFactory.getClientForUser(userId);
    const { owner, repo, pullNumber, headSha, finding } = params;
    const body = this.buildFindingCommentBody(finding);
    const canAttemptAnchor = Boolean(finding.filePath && finding.lineRangeEnd != null);

    if (canAttemptAnchor) {
      try {
        const { data } = await octokit.rest.pulls.createReviewComment({
          owner,
          repo,
          pull_number: pullNumber,
          commit_id: headSha,
          path: finding.filePath as string,
          line: finding.lineRangeEnd as number,
          body,
        });
        return { githubCommentId: String(data.id), htmlUrl: data.html_url, anchored: true };
      } catch {
        // Expected for lines outside the diff hunk (422) as well as any
        // other transient failure of the anchored attempt — fall through to
        // the general-comment fallback below rather than propagating.
      }
    }

    const fallbackBody = canAttemptAnchor
      ? `> _Couldn't anchor this comment to ${finding.filePath}:${finding.lineRangeEnd} — posting as a general PR comment instead._\n\n${body}`
      : body;

    try {
      const { data } = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body: fallbackBody,
      });
      return { githubCommentId: String(data.id), htmlUrl: data.html_url, anchored: false };
    } catch (error) {
      this.handleError(
        error,
        `posting a comment for finding "${finding.title}" on PR #${pullNumber} in ${owner}/${repo}`,
      );
    }
  }

  private buildFindingCommentBody(finding: FindingCommentInput): string {
    return [
      `**${finding.category} · ${finding.riskLevel} risk** — ${finding.riskJustification}`,
      '',
      `### ${finding.title}`,
      '',
      `**Why it matters:** ${finding.whyItMatters}`,
      '',
      `**What could break:** ${finding.whatCouldBreak}`,
      '',
      `**Suggested test:** ${finding.suggestedTest}`,
      '',
      `**Suggested fix:**`,
      finding.suggestedFix,
      '',
      '---',
      '*Posted by PR Review Coach*',
    ].join('\n');
  }

  private mapPullRequest(pr: {
    id: number;
    number: number;
    title: string;
    user?: { login: string } | null;
    head: { ref: string; sha: string };
    base: { ref: string; sha: string };
    state: string;
    html_url: string;
    created_at: string;
    updated_at: string;
  }): GithubPullRequestSummary {
    return {
      githubPrId: pr.id,
      number: pr.number,
      title: pr.title,
      authorLogin: pr.user?.login ?? 'unknown',
      headBranch: pr.head.ref,
      headSha: pr.head.sha,
      baseBranch: pr.base.ref,
      baseSha: pr.base.sha,
      state: pr.state,
      url: pr.html_url,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    };
  }

  /**
   * Structured per-file diff (filename/status/additions/deletions/patch) —
   * feeds the Phase 4 diff-viewer UI.
   */
  async getPullRequestChangedFiles(
    userId: string,
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<PullRequestChangedFileDto[]> {
    const octokit = await this.clientFactory.getClientForUser(userId);
    try {
      const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });
      return files.map((file) => ({
        filename: file.filename,
        status: file.status as PullRequestChangedFileDto['status'],
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch,
      }));
    } catch (error) {
      this.handleError(
        error,
        `listing changed files for PR #${pullNumber} in ${owner}/${repo}`,
      );
    }
  }

  /**
   * Raw unified diff text for the whole PR — feeds the Phase 5 AI review
   * prompt. Octokit's TS types don't model the `mediaType: { format: 'diff' }`
   * response override (they still type `data` as the PR object), but at
   * runtime GitHub really does return diff text as the body in that mode,
   * hence the explicit cast below.
   */
  async getPullRequestRawDiff(
    userId: string,
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<string> {
    const octokit = await this.clientFactory.getClientForUser(userId);
    try {
      const response = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
        mediaType: { format: 'diff' },
      });
      return response.data as unknown as string;
    } catch (error) {
      this.handleError(error, `fetching raw diff for PR #${pullNumber} in ${owner}/${repo}`);
    }
  }

  private mapRepo(repo: {
    id: number;
    owner: { login: string };
    name: string;
    full_name: string;
    private: boolean;
    created_at?: string | null;
    updated_at?: string | null;
  }): GithubRepoSummary {
    return {
      githubId: repo.id,
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      isPrivate: repo.private,
      createdAt: repo.created_at ?? new Date(0).toISOString(),
      updatedAt: repo.updated_at ?? new Date(0).toISOString(),
    };
  }

  /**
   * Translates Octokit's raw `RequestError`s into typed Nest HTTP
   * exceptions so controllers never leak raw GitHub error payloads (or
   * GitHub's own error message wording) straight to the frontend.
   */
  private handleError(error: unknown, context: string): never {
    if (error instanceof RequestError) {
      const rateRemaining = error.response?.headers?.['x-ratelimit-remaining'];
      if (error.status === 403 && rateRemaining === '0') {
        throw new HttpException(
          `GitHub API rate limit exceeded while ${context}. Please try again later.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error.status === 401) {
        throw new UnauthorizedException(
          `GitHub access token is invalid or has been revoked (while ${context}).`,
        );
      }
      if (error.status === 403) {
        throw new ForbiddenException(`GitHub denied access while ${context}.`);
      }
      if (error.status === 404) {
        throw new NotFoundException(`GitHub resource not found while ${context}.`);
      }
      throw new BadGatewayException(
        `Unexpected error from GitHub while ${context} (status ${error.status}).`,
      );
    }
    throw new BadGatewayException(`Unexpected error while ${context}.`);
  }
}
