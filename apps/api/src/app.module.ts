import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './crypto/crypto.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { GithubModule } from './github/github.module';
import { QueueModule } from './queue/queue.module';
import { ReviewsModule } from './reviews/reviews.module';
import { PullRequestsModule } from './pull-requests/pull-requests.module';
import { RepositoriesModule } from './repositories/repositories.module';
import { FindingsModule } from './findings/findings.module';

/**
 * HTTP-facing application module (booted by main.ts).
 *
 * Deliberately does NOT import AiReviewModule — AI review execution only
 * happens in the worker process (see worker.module.ts). Keeping it out of
 * AppModule here means the HTTP API surface can never accidentally trigger
 * an AI review call path directly.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CryptoModule,
    UsersModule,
    AuthModule,
    GithubModule,
    QueueModule,
    ReviewsModule,
    PullRequestsModule,
    RepositoriesModule,
    FindingsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
