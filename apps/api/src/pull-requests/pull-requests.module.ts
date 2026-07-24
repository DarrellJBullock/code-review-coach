import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GithubModule } from '../github/github.module';
import { UsersModule } from '../users/users.module';
import { PullRequestsController } from './pull-requests.controller';
import { PullRequestsService } from './pull-requests.service';

@Module({
  // UsersModule is imported explicitly (not just transitively via
  // AuthModule) because SessionAuthGuard's own constructor dependency
  // (UsersService) needs to resolve against a module visible to
  // PullRequestsModule's DI graph directly, not just AuthModule's.
  imports: [GithubModule, AuthModule, UsersModule],
  controllers: [PullRequestsController],
  providers: [PullRequestsService],
  exports: [PullRequestsService],
})
export class PullRequestsModule {}
