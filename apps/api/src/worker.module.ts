import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AiReviewModule } from './ai-review/ai-review.module';

/**
 * Worker application context module (booted by worker.main.ts via
 * NestFactory.createApplicationContext — no HTTP listener).
 *
 * Imports: ConfigModule (loads apps/api/.env into `process.env` — this
 * process is a separate `node` process from the HTTP api, so it does not
 * inherit AppModule's `ConfigModule.forRoot()` env loading and needs its
 * own), PrismaModule, and AiReviewModule (the BullMQ consumer, Phase 5).
 *
 * Deliberate structural guarantee, unchanged from Phase 1: this module does
 * NOT import GithubModule (directly or transitively — AiReviewModule has no
 * such dependency either), so the worker process can never call GitHub
 * directly. Any GitHub data the worker needs (PR title/diff) arrives via the
 * BullMQ job payload, already fetched by the API process before the job was
 * queued — see ReviewGenerationJobData/ReviewsService.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AiReviewModule],
})
export class WorkerModule {}
