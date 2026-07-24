import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { REVIEW_GENERATION_QUEUE } from './queue.constants';
import type { ReviewGenerationJobData } from './queue.constants';

/**
 * Thin wrapper around the `review-generation` BullMQ Queue (producer side).
 * Keeps `@InjectQueue` usage contained to one place so ReviewsService
 * doesn't need to know about BullMQ directly.
 */
@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(REVIEW_GENERATION_QUEUE)
    private readonly reviewGenerationQueue: Queue<ReviewGenerationJobData>,
  ) {}

  async enqueueReviewGeneration(data: ReviewGenerationJobData): Promise<void> {
    await this.reviewGenerationQueue.add('generate-review', data, {
      // No automatic BullMQ retries — AiReviewService already implements its
      // own single retry against the Anthropic API for schema-validation
      // failures, and always leaves the Review row in a terminal
      // COMPLETED/FAILED state. A second BullMQ-level retry on top of that
      // would silently re-run a job whose Review is already marked FAILED.
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
