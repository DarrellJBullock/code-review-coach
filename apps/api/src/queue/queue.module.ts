import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { buildBullMqConnection } from './bullmq-connection';
import { REVIEW_GENERATION_QUEUE } from './queue.constants';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';

/**
 * HTTP-app-side BullMQ producer registration. Registers the shared Redis
 * connection + the `review-generation` queue so ReviewsModule (via
 * QueueService) can enqueue jobs. The worker-side consumer registration
 * lives independently in AiReviewModule (separate Nest application context
 * — see worker.module.ts) using the same queue name + connection helper.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({ connection: buildBullMqConnection() }),
    }),
    BullModule.registerQueue({ name: REVIEW_GENERATION_QUEUE }),
  ],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
