import { Injectable, NotFoundException } from '@nestjs/common';
import type { PullRequestDiffDto, PullRequestDto } from '@code-review-coach/shared';
import type { GithubPullRequestSummary } from '../github/github.service';
import { GithubService } from '../github/github.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Real PullRequestsService (Phase 3).
 *
 * `listForRepository` always reads open PRs live from GitHub, and
 * upserts each one into the `PullRequest` table on every call (simple
 * upsert-on-read, no separate sync job at this scale) so `Review`/`Finding`
 * rows in later phases have a stable FK to point at.
 */
@Injectable()
export class PullRequestsService {
  constructor(
    private readonly githubService: GithubService,
    private readonly prisma: PrismaService,
  ) {}

  async listForRepository(userId: string, repositoryId: string): Promise<PullRequestDto[]> {
    const repository = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
    });
    if (!repository) {
      throw new NotFoundException(`Repository ${repositoryId} not found`);
    }

    const repoName = repository.fullName.split('/')[1] ?? repository.fullName;
    const pulls = await this.githubService.listOpenPullRequests(
      userId,
      repository.ownerLogin,
      repoName,
    );

    const dtos: PullRequestDto[] = [];
    for (const pr of pulls) {
      const row = await this.upsertPullRequest(repository.id, pr);
      dtos.push(this.toDto(row.id, repository.id, pr));
    }
    return dtos;
  }

  async getDiff(userId: string, pullRequestId: string): Promise<PullRequestDiffDto> {
    const pullRequest = await this.prisma.pullRequest.findUnique({
      where: { id: pullRequestId },
      include: { repository: true },
    });
    if (!pullRequest) {
      throw new NotFoundException(`Pull request ${pullRequestId} not found`);
    }

    const { repository } = pullRequest;
    const repoName = repository.fullName.split('/')[1] ?? repository.fullName;

    const [files, rawDiff] = await Promise.all([
      this.githubService.getPullRequestChangedFiles(
        userId,
        repository.ownerLogin,
        repoName,
        pullRequest.number,
      ),
      this.githubService.getPullRequestRawDiff(
        userId,
        repository.ownerLogin,
        repoName,
        pullRequest.number,
      ),
    ]);

    return { files, rawDiff };
  }

  private async upsertPullRequest(repositoryId: string, pr: GithubPullRequestSummary) {
    return this.prisma.pullRequest.upsert({
      where: { githubPrId: String(pr.githubPrId) },
      create: {
        githubPrId: String(pr.githubPrId),
        repositoryId,
        number: pr.number,
        title: pr.title,
        author: pr.authorLogin,
        headBranch: pr.headBranch,
        baseBranch: pr.baseBranch,
        state: pr.state,
        lastSyncedAt: new Date(),
      },
      update: {
        title: pr.title,
        author: pr.authorLogin,
        headBranch: pr.headBranch,
        baseBranch: pr.baseBranch,
        state: pr.state,
        lastSyncedAt: new Date(),
      },
    });
  }

  private toDto(
    id: string,
    repositoryId: string,
    pr: GithubPullRequestSummary,
  ): PullRequestDto {
    return {
      id,
      repositoryId,
      githubNumber: pr.number,
      title: pr.title,
      authorLogin: pr.authorLogin,
      headSha: pr.headSha,
      baseSha: pr.baseSha,
      state: pr.state,
      url: pr.url,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
    };
  }
}
