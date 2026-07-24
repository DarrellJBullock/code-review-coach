import { Injectable } from '@nestjs/common';
import type { RepositoryDto } from '@code-review-coach/shared';
import { GithubService } from '../github/github.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Real RepositoriesService (Phase 3).
 *
 * `listForUser` always reads live from GitHub (per product spec, users
 * browse their real GitHub repos directly — no "add repository" step is
 * required before browsing). It is only backed by a persisted `Repository`
 * row once a user has explicitly "selected" that repo via `selectRepository`
 * — for repos not yet selected, `RepositoryDto.id` is returned as `''` (a
 * deliberate sentinel meaning "not yet selected in our DB"; there is no
 * internal id to hand back yet). Frontend must call the select endpoint
 * before it can use a repo's `id` to look up its pull requests.
 */
@Injectable()
export class RepositoriesService {
  constructor(
    private readonly githubService: GithubService,
    private readonly prisma: PrismaService,
  ) {}

  async listForUser(userId: string, search?: string): Promise<RepositoryDto[]> {
    const repos = await this.githubService.listUserRepos(userId);

    const filtered = search
      ? repos.filter((repo) => repo.fullName.toLowerCase().includes(search.toLowerCase()))
      : repos;

    if (filtered.length === 0) {
      return [];
    }

    const githubIds = filtered.map((repo) => String(repo.githubId));
    const persisted = await this.prisma.repository.findMany({
      where: { githubRepoId: { in: githubIds } },
    });
    const persistedByGithubId = new Map(persisted.map((row) => [row.githubRepoId, row]));

    return filtered.map((repo) => ({
      id: persistedByGithubId.get(String(repo.githubId))?.id ?? '',
      githubId: repo.githubId,
      owner: repo.owner,
      name: repo.name,
      fullName: repo.fullName,
      isPrivate: repo.isPrivate,
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt,
    }));
  }

  /**
   * Upserts a `Repository` row keyed on GitHub's stable `githubRepoId`, the
   * first time a user picks a repo to work with. Always re-fetches live
   * details from GitHub first (rather than trusting stale list data) so the
   * persisted `fullName`/`ownerLogin` reflect any recent rename/transfer.
   */
  async selectRepository(userId: string, owner: string, repo: string): Promise<RepositoryDto> {
    const details = await this.githubService.getRepository(userId, owner, repo);

    const row = await this.prisma.repository.upsert({
      where: { githubRepoId: String(details.githubId) },
      create: {
        githubRepoId: String(details.githubId),
        fullName: details.fullName,
        ownerLogin: details.owner,
      },
      update: {
        fullName: details.fullName,
        ownerLogin: details.owner,
      },
    });

    return {
      id: row.id,
      githubId: details.githubId,
      owner: details.owner,
      name: details.name,
      fullName: details.fullName,
      isPrivate: details.isPrivate,
      createdAt: details.createdAt,
      updatedAt: details.updatedAt,
    };
  }
}
