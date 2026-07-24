import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { REVIEW_GENERATION_QUEUE } from '../queue/queue.constants';
import type { ReviewGenerationJobData } from '../queue/queue.constants';
import { AiReviewService } from './ai-review.service';

/**
 * BullMQ consumer for the `review-generation` queue (worker process only —
 * see worker.module.ts/ai-review.module.ts).
 *
 * `AiReviewService.generateReview()` already handles the expected AI-failure
 * path internally (marks the Review FAILED, logs
 * `ai_schema_validation_failed`, and returns normally without throwing).
 * The try/catch here is a safety net for genuinely unexpected errors (e.g. a
 * DB outage mid-job): it guarantees `process()` itself never throws (so the
 * worker process never crashes) and that the Review row still ends up in a
 * terminal state.
 */
@Processor(REVIEW_GENERATION_QUEUE)
export class ReviewGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReviewGenerationProcessor.name);

  constructor(
    private readonly aiReviewService: AiReviewService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<ReviewGenerationJobData>): Promise<void> {
    try {
      await this.aiReviewService.generateReview(job.data);
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'review_generation_job_failed',
          reviewId: job.data?.reviewId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );

      try {
        await this.prisma.review.update({
          where: { id: job.data.reviewId },
          data: { status: 'FAILED' },
        });
      } catch (updateError) {
        this.logger.error(
          JSON.stringify({
            event: 'review_mark_failed_error',
            reviewId: job.data?.reviewId,
            message: updateError instanceof Error ? updateError.message : String(updateError),
          }),
        );
      }
    }
  }
}
