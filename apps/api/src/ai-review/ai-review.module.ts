import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { buildBullMqConnection } from '../queue/bullmq-connection';
import { REVIEW_GENERATION_QUEUE } from '../queue/queue.constants';
import { AiReviewController } from './ai-review.controller';
import { AiReviewService } from './ai-review.service';
import { AnthropicClientProvider } from './anthropic-client.provider';
import { PromptBuilderService } from './prompt-builder.service';
import { ReviewGenerationProcessor } from './review-generation.processor';

/**
 * Worker-side BullMQ *consumer* module (Phase 5). Only ever wired into
 * WorkerModule (the separate worker process — see worker.module.ts), never
 * into AppModule (the HTTP app).
 *
 * Registers its own BullMQ connection + queue (separate Nest application
 * context from the HTTP api's QueueModule, so nothing is shared between them
 * except the queue name constant and the Redis instance both connect to —
 * see queue.constants.ts/bullmq-connection.ts).
 *
 * Deliberately imports NO GithubModule/PullRequestsModule — all PR/diff
 * context arrives through the BullMQ job payload
 * (`ReviewGenerationJobData`), never via a live GitHub call from this
 * process. This is what makes the producer/consumer process boundary a real
 * security guarantee (the worker that calls Claude and writes Findings can
 * never call GitHub/post comments) rather than just a convention.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({ connection: buildBullMqConnection() }),
    }),
    BullModule.registerQueue({ name: REVIEW_GENERATION_QUEUE }),
  ],
  controllers: [AiReviewController],
  providers: [AiReviewService, PromptBuilderService, AnthropicClientProvider, ReviewGenerationProcessor],
  exports: [AiReviewService],
})
export class AiReviewModule {}
