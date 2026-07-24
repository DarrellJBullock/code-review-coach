import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GithubModule } from '../github/github.module';
import { UsersModule } from '../users/users.module';
import { RepositoriesController } from './repositories.controller';
import { RepositoriesService } from './repositories.service';

@Module({
  // UsersModule is imported explicitly (not just transitively via
  // AuthModule) because SessionAuthGuard's own constructor dependency
  // (UsersService) needs to resolve against a module visible to
  // RepositoriesModule's DI graph directly, not just AuthModule's.
  imports: [GithubModule, AuthModule, UsersModule],
  controllers: [RepositoriesController],
  providers: [RepositoriesService],
  exports: [RepositoriesService],
})
export class RepositoriesModule {}
