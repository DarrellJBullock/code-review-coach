import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { PullRequestDiffDto, PullRequestDto } from '@code-review-coach/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { PullRequestsService } from './pull-requests.service';

/**
 * No single `@Controller('pull-requests')` prefix here — routes span both
 * `/repositories/:repositoryId/pull-requests` and
 * `/pull-requests/:pullRequestId/diff`, so each method declares its full
 * path (same pattern AppController uses for `/health`).
 */
@Controller()
@UseGuards(SessionAuthGuard)
export class PullRequestsController {
  constructor(private readonly pullRequestsService: PullRequestsService) {}

  /**
   * GET /repositories/:repositoryId/pull-requests
   * Looks up the `Repository` row by internal id, lists open PRs live from
   * GitHub, and upserts each into the `PullRequest` table to keep local FKs
   * in sync with GitHub's live state.
   */
  @Get('repositories/:repositoryId/pull-requests')
  async listForRepository(
    @CurrentUser() user: User,
    @Param('repositoryId') repositoryId: string,
  ): Promise<PullRequestDto[]> {
    return this.pullRequestsService.listForRepository(user.id, repositoryId);
  }

  /**
   * GET /pull-requests/:pullRequestId/diff
   * Returns both the structured per-file changes (for the Phase 4 diff
   * viewer UI) and the raw unified diff text (for the Phase 5 AI prompt) in
   * one response.
   */
  @Get('pull-requests/:pullRequestId/diff')
  async getDiff(
    @CurrentUser() user: User,
    @Param('pullRequestId') pullRequestId: string,
  ): Promise<PullRequestDiffDto> {
    return this.pullRequestsService.getDiff(user.id, pullRequestId);
  }
}
