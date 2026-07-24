import { Inject, Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AiResponseSchema, type AiResponse } from '@code-review-coach/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { ReviewGenerationJobData } from '../queue/queue.constants';
import { ANTHROPIC_CLIENT } from './anthropic-client.provider';
import { PromptBuilderService } from './prompt-builder.service';

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 8192;

const RETRY_SYSTEM_SUFFIX = `

IMPORTANT: Your previous response did not match the required schema. You MUST
return every field for every finding — do not omit or merge any of the five
fields (whyItMatters, whatCouldBreak, riskLevel, riskJustification,
suggestedTest, suggestedFix). Every finding needs category, riskLevel,
riskJustification, title, whyItMatters, whatCouldBreak, suggestedFix,
suggestedTest, filePath, lineRangeStart, and lineRangeEnd — filePath/
lineRangeStart/lineRangeEnd may be null, but every other field is a required,
non-empty string. Return output that matches the schema exactly.`;

/**
 * Worker-side AI review generation logic (Phase 5). Builds the prompt, calls
 * Claude via `client.messages.parse()` with a Zod output format (the
 * enforcement mechanism for the five-field finding shape), retries once on
 * schema-validation failure with a stricter system prompt, and persists the
 * result — always leaving the `Review` row in a terminal state
 * (COMPLETED/FAILED).
 *
 * Deliberately has no GithubModule/PullRequestsModule dependency — all
 * PR/diff context arrives via the job payload (see
 * ReviewGenerationJobData).
 */
@Injectable()
export class AiReviewService {
  private readonly logger = new Logger(AiReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly promptBuilder: PromptBuilderService,
    @Inject(ANTHROPIC_CLIENT) private readonly anthropic: Anthropic,
  ) {}

  async generateReview(jobData: ReviewGenerationJobData): Promise<void> {
    const { reviewId } = jobData;

    await this.prisma.review.update({
      where: { id: reviewId },
      data: { status: 'RUNNING' },
    });

    const prompt = this.promptBuilder.build({
      prTitle: jobData.prTitle,
      prDescription: jobData.prDescription,
      files: jobData.diff.files,
      rawDiff: jobData.diff.rawDiff,
      modes: jobData.modes,
    });

    const outputFormat = zodOutputFormat(AiResponseSchema);

    let parsedOutput = await this.callAnthropic(prompt.system, prompt.user, outputFormat, reviewId, 1);
    if (!parsedOutput) {
      const stricterSystem = prompt.system + RETRY_SYSTEM_SUFFIX;
      parsedOutput = await this.callAnthropic(stricterSystem, prompt.user, outputFormat, reviewId, 2);
    }

    if (!parsedOutput) {
      this.logger.error(
        JSON.stringify({
          event: 'ai_schema_validation_failed',
          reviewId,
          message: 'AI response failed schema validation on both the initial call and the retry.',
        }),
      );
      await this.markFailed(reviewId);
      return;
    }

    await this.persistSuccess(reviewId, parsedOutput);
  }

  /**
   * Calls Claude and returns the schema-validated `parsed_output`, or
   * `null` if the call threw OR `parsed_output` came back null (schema
   * validation failed). Never throws — callers rely on this to implement
   * the retry-once policy uniformly for both failure modes.
   */
  private async callAnthropic(
    system: string,
    user: string,
    outputFormat: ReturnType<typeof zodOutputFormat<typeof AiResponseSchema>>,
    reviewId: string,
    attempt: number,
  ): Promise<AiResponse | null> {
    try {
      const response = await this.anthropic.messages.parse({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: {
          effort: 'high',
          format: outputFormat,
        },
      });
      return response.parsed_output ?? null;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'ai_call_failed',
          reviewId,
          attempt,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  private async markFailed(reviewId: string): Promise<void> {
    try {
      await this.prisma.review.update({
        where: { id: reviewId },
        data: { status: 'FAILED' },
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'review_mark_failed_error',
          reviewId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private async persistSuccess(reviewId: string, output: AiResponse): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.review.update({
        where: { id: reviewId },
        data: {
          status: 'COMPLETED',
          overallRiskScore: Math.round(output.overallRiskScore),
          summary: output.summary,
          completedAt: new Date(),
        },
      }),
      this.prisma.finding.createMany({
        data: output.findings.map((finding) => ({
          reviewId,
          category: finding.category,
          riskLevel: finding.riskLevel,
          riskJustification: finding.riskJustification,
          title: finding.title,
          whyItMatters: finding.whyItMatters,
          whatCouldBreak: finding.whatCouldBreak,
          suggestedFix: finding.suggestedFix,
          suggestedTest: finding.suggestedTest,
          filePath: finding.filePath,
          lineRangeStart: finding.lineRangeStart,
          lineRangeEnd: finding.lineRangeEnd,
        })),
      }),
    ]);
  }
}
