import type Anthropic from '@anthropic-ai/sdk';
import type { AiResponse } from '@code-review-coach/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { ReviewGenerationJobData } from '../queue/queue.constants';
import { AiReviewService } from './ai-review.service';
import { PromptBuilderService } from './prompt-builder.service';

function buildJobData(overrides: Partial<ReviewGenerationJobData> = {}): ReviewGenerationJobData {
  return {
    reviewId: 'review-1',
    prTitle: 'Add rate limiting',
    prDescription: null,
    diff: { files: [], rawDiff: 'diff --git a/x b/x' },
    modes: { performance: false, security: false, accessibility: false },
    ...overrides,
  };
}

const validAiResponse: AiResponse = {
  overallRiskScore: 55,
  summary: 'Looks mostly fine, one security concern.',
  findings: [
    {
      category: 'SECURITY',
      riskLevel: 'HIGH',
      riskJustification: 'Token is logged in plaintext.',
      title: 'Token logged in plaintext',
      whyItMatters: 'Logs may be shipped to third parties.',
      whatCouldBreak: 'A leaked log could let an attacker impersonate a user.',
      suggestedFix: 'Redact the token before logging.',
      suggestedTest: 'Assert log output never contains the raw token.',
      filePath: 'src/auth/auth.service.ts',
      lineRangeStart: 10,
      lineRangeEnd: 12,
    },
  ],
};

/**
 * Builds a fake PrismaService that only implements the handful of methods
 * AiReviewService touches. `$transaction` is faked as `Promise.all` over the
 * passed array, which is enough to exercise the "review update + finding
 * createMany happen together on success" behavior without needing a real
 * Prisma transaction/interactive client.
 */
function buildFakePrisma() {
  const reviewUpdate = jest.fn().mockResolvedValue({});
  const findingCreateMany = jest.fn().mockResolvedValue({ count: 1 });
  const transaction = jest.fn((ops: Promise<unknown>[]) => Promise.all(ops));

  const fakePrisma = {
    review: { update: reviewUpdate },
    finding: { createMany: findingCreateMany },
    $transaction: transaction,
  } as unknown as PrismaService;

  return { fakePrisma, reviewUpdate, findingCreateMany, transaction };
}

function buildFakeAnthropic(parseImpl: jest.Mock) {
  return { messages: { parse: parseImpl } } as unknown as Anthropic;
}

describe('AiReviewService', () => {
  const promptBuilder = new PromptBuilderService();

  it('sets the review to RUNNING before calling Anthropic', async () => {
    const { fakePrisma, reviewUpdate } = buildFakePrisma();
    const parse = jest.fn().mockResolvedValue({ parsed_output: validAiResponse });
    const service = new AiReviewService(fakePrisma, promptBuilder, buildFakeAnthropic(parse));

    await service.generateReview(buildJobData());

    expect(reviewUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: 'review-1' },
      data: { status: 'RUNNING' },
    });
  });

  it('succeeds on the first call: persists COMPLETED review + findings, calls Anthropic exactly once', async () => {
    const { fakePrisma, reviewUpdate, findingCreateMany, transaction } = buildFakePrisma();
    const parse = jest.fn().mockResolvedValue({ parsed_output: validAiResponse });
    const service = new AiReviewService(fakePrisma, promptBuilder, buildFakeAnthropic(parse));

    await service.generateReview(buildJobData());

    expect(parse).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);

    const completedCall = reviewUpdate.mock.calls.find((call) => call[0]?.data?.status === 'COMPLETED');
    expect(completedCall).toBeDefined();
    expect(completedCall![0].data).toMatchObject({
      status: 'COMPLETED',
      overallRiskScore: 55,
      summary: validAiResponse.summary,
    });
    expect(completedCall![0].data.completedAt).toBeInstanceOf(Date);

    expect(findingCreateMany).toHaveBeenCalledTimes(1);
    expect(findingCreateMany.mock.calls[0][0].data).toHaveLength(1);
    expect(findingCreateMany.mock.calls[0][0].data[0]).toMatchObject({
      reviewId: 'review-1',
      category: 'SECURITY',
      riskLevel: 'HIGH',
    });
  });

  it('retries once on schema validation failure (parsed_output null), then succeeds: exactly 2 calls, review COMPLETED, findings persisted', async () => {
    const { fakePrisma, reviewUpdate, findingCreateMany } = buildFakePrisma();
    const parse = jest
      .fn()
      .mockResolvedValueOnce({ parsed_output: null })
      .mockResolvedValueOnce({ parsed_output: validAiResponse });
    const service = new AiReviewService(fakePrisma, promptBuilder, buildFakeAnthropic(parse));

    await service.generateReview(buildJobData());

    expect(parse).toHaveBeenCalledTimes(2);

    // The retry call's system prompt must be stricter than the first.
    const firstSystem = parse.mock.calls[0][0].system as string;
    const secondSystem = parse.mock.calls[1][0].system as string;
    expect(secondSystem.length).toBeGreaterThan(firstSystem.length);
    expect(secondSystem).toContain('did not match the required schema');

    const completedCall = reviewUpdate.mock.calls.find((call) => call[0]?.data?.status === 'COMPLETED');
    expect(completedCall).toBeDefined();
    expect(findingCreateMany).toHaveBeenCalledTimes(1);
  });

  it('retries once when the first call throws, then succeeds', async () => {
    const { fakePrisma, reviewUpdate } = buildFakePrisma();
    const parse = jest
      .fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({ parsed_output: validAiResponse });
    const service = new AiReviewService(fakePrisma, promptBuilder, buildFakeAnthropic(parse));

    await service.generateReview(buildJobData());

    expect(parse).toHaveBeenCalledTimes(2);
    const completedCall = reviewUpdate.mock.calls.find((call) => call[0]?.data?.status === 'COMPLETED');
    expect(completedCall).toBeDefined();
  });

  it('marks the review FAILED and persists no findings when both calls fail schema validation', async () => {
    const { fakePrisma, reviewUpdate, findingCreateMany, transaction } = buildFakePrisma();
    const parse = jest
      .fn()
      .mockResolvedValueOnce({ parsed_output: null })
      .mockResolvedValueOnce({ parsed_output: null });
    const service = new AiReviewService(fakePrisma, promptBuilder, buildFakeAnthropic(parse));

    await service.generateReview(buildJobData());

    expect(parse).toHaveBeenCalledTimes(2);
    const failedCall = reviewUpdate.mock.calls.find((call) => call[0]?.data?.status === 'FAILED');
    expect(failedCall).toBeDefined();
    expect(transaction).not.toHaveBeenCalled();
    expect(findingCreateMany).not.toHaveBeenCalled();
  });

  it('marks the review FAILED and persists no findings when both calls throw', async () => {
    const { fakePrisma, reviewUpdate, findingCreateMany } = buildFakePrisma();
    const parse = jest.fn().mockRejectedValue(new Error('anthropic is down'));
    const service = new AiReviewService(fakePrisma, promptBuilder, buildFakeAnthropic(parse));

    await service.generateReview(buildJobData());

    expect(parse).toHaveBeenCalledTimes(2);
    const failedCall = reviewUpdate.mock.calls.find((call) => call[0]?.data?.status === 'FAILED');
    expect(failedCall).toBeDefined();
    expect(findingCreateMany).not.toHaveBeenCalled();
  });

  it('propagates unexpected errors when setting the review to RUNNING (this layer only guarantees a terminal state for known AI-call/validation failures — genuinely unexpected errors, e.g. a DB outage, are the BullMQ processor\'s responsibility to catch, per review-generation.processor.spec.ts)', async () => {
    const { fakePrisma } = buildFakePrisma();
    (fakePrisma.review.update as jest.Mock).mockRejectedValueOnce(new Error('DB down'));
    const parse = jest.fn().mockResolvedValue({ parsed_output: validAiResponse });
    const service = new AiReviewService(fakePrisma, promptBuilder, buildFakeAnthropic(parse));

    await expect(service.generateReview(buildJobData())).rejects.toThrow('DB down');
  });
});
