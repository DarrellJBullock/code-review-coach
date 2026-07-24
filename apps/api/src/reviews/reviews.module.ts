import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GithubModule } from '../github/github.module';
import { UsersModule } from '../users/users.module';
import { PullRequestsModule } from '../pull-requests/pull-requests.module';
import { QueueModule } from '../queue/queue.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/**
 * HTTP-facing BullMQ *producer* module (Phase 5), extended in Phase 7 with
 * the GitHub-posting flow. Imports PullRequestsModule (to fetch a PR's diff
 * live via GitHub before enqueueing) and QueueModule (to enqueue onto the
 * `review-generation` queue). Imports GithubModule directly (same pattern
 * PullRequestsModule already uses) so ReviewsService can call
 * GithubService.getPullRequest/postFindingComment for the Phase 7 posting
 * endpoint. Never imported by WorkerModule — see worker.module.ts.
 */
@Module({
  // UsersModule/AuthModule imported explicitly for the same reason
  // PullRequestsModule/RepositoriesModule do — SessionAuthGuard's
  // constructor dependency (UsersService) needs to resolve directly against
  // this module's DI graph.
  imports: [AuthModule, UsersModule, GithubModule, PullRequestsModule, QueueModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
