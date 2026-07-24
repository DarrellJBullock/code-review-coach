import type { Finding as PrismaFinding } from '@prisma/client';
import type { FindingDto } from '@code-review-coach/shared';

/**
 * Single source of truth for mapping a Prisma `Finding` row to the shared
 * `FindingDto` wire shape. Previously duplicated identically in
 * ReviewsService and FindingsService — kept here so the two can't silently
 * drift if a field is added to either the Prisma model or the DTO.
 */
export function toFindingDto(finding: PrismaFinding): FindingDto {
  return {
    id: finding.id,
    reviewId: finding.reviewId,
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
    approved: finding.approved,
    postedToGithub: finding.postedToGithub,
    githubCommentId: finding.githubCommentId,
  };
}
