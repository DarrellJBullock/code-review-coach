import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { GithubClientFactory } from './github-client.factory';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';

@Module({
  imports: [UsersModule],
  controllers: [GithubController],
  providers: [GithubClientFactory, GithubService],
  exports: [GithubService],
})
export class GithubModule {}
