import type { Job } from 'bullmq';
import type { PrismaService } from '../prisma/prisma.service';
import type { ReviewGenerationJobData } from '../queue/queue.constants';
import type { AiReviewService } from './ai-review.service';
import { ReviewGenerationProcessor } from './review-generation.processor';

function buildJob(reviewId = 'review-1'): Job<ReviewGenerationJobData> {
  return {
    data: {
      reviewId,
      prTitle: 'Some PR',
      prDescription: null,
      diff: { files: [], rawDiff: '' },
      modes: { performance: false, security: false, accessibility: false },
    },
  } as unknown as Job<ReviewGenerationJobData>;
}

describe('ReviewGenerationProcessor', () => {
  it('delegates to AiReviewService.generateReview and does not touch Prisma directly on success', async () => {
    const generateReview = jest.fn().mockResolvedValue(undefined);
    const fakeAiReviewService = { generateReview } as unknown as AiReviewService;
    const reviewUpdate = jest.fn();
    const fakePrisma = { review: { update: reviewUpdate } } as unknown as PrismaService;

    const processor = new ReviewGenerationProcessor(fakeAiReviewService, fakePrisma);
    await processor.process(buildJob());

    expect(generateReview).toHaveBeenCalledTimes(1);
    expect(reviewUpdate).not.toHaveBeenCalled();
  });

  it('never throws and marks the review FAILED when AiReviewService.generateReview throws unexpectedly', async () => {
    const generateReview = jest.fn().mockRejectedValue(new Error('unexpected DB outage'));
    const fakeAiReviewService = { generateReview } as unknown as AiReviewService;
    const reviewUpdate = jest.fn().mockResolvedValue({});
    const fakePrisma = { review: { update: reviewUpdate } } as unknown as PrismaService;

    const processor = new ReviewGenerationProcessor(fakeAiReviewService, fakePrisma);

    await expect(processor.process(buildJob('review-42'))).resolves.toBeUndefined();

    expect(reviewUpdate).toHaveBeenCalledWith({
      where: { id: 'review-42' },
      data: { status: 'FAILED' },
    });
  });

  it('still resolves (never throws) even if the best-effort FAILED update itself fails', async () => {
    const generateReview = jest.fn().mockRejectedValue(new Error('unexpected error'));
    const fakeAiReviewService = { generateReview } as unknown as AiReviewService;
    const reviewUpdate = jest.fn().mockRejectedValue(new Error('DB also down'));
    const fakePrisma = { review: { update: reviewUpdate } } as unknown as PrismaService;

    const processor = new ReviewGenerationProcessor(fakeAiReviewService, fakePrisma);

    await expect(processor.process(buildJob())).resolves.toBeUndefined();
  });
});
