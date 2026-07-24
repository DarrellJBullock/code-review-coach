import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { RepositoryDto } from '@code-review-coach/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RepositoriesService } from './repositories.service';

@Controller('repositories')
@UseGuards(SessionAuthGuard)
export class RepositoriesController {
  constructor(private readonly repositoriesService: RepositoriesService) {}

  /**
   * GET /repositories?search=foo
   * Lists the authenticated user's real GitHub repos live (no local "add
   * repository" step required). `search` is an optional case-insensitive
   * substring filter on `fullName`, applied server-side.
   */
  @Get()
  async list(
    @CurrentUser() user: User,
    @Query('search') search?: string,
  ): Promise<RepositoryDto[]> {
    return this.repositoriesService.listForUser(user.id, search);
  }

  /**
   * POST /repositories/:owner/:repo/select
   * Persists (upserts) a `Repository` row the first time a user picks a
   * repo to work with, giving later `PullRequest`/`Review` rows a stable FK
   * to point at. Returns the persisted `RepositoryDto` (including the
   * internal db `id`).
   */
  @Post(':owner/:repo/select')
  async select(
    @CurrentUser() user: User,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
  ): Promise<RepositoryDto> {
    return this.repositoriesService.selectRepository(user.id, owner, repo);
  }
}
