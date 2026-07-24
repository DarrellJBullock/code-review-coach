import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Finding as PrismaFinding } from '@prisma/client';
import type { FindingDto } from '@code-review-coach/shared';
import { toFindingDto } from '../common/finding.mapper';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateFindingRequestBody } from './findings.types';

/**
 * Real FindingsService (Phase 6). Findings are never created directly via
 * this module — they're populated by the review-generation worker (Phase 5)
 * — so this service only supports reading a single Finding and toggling its
 * `approved` flag. `postedToGithub` is explicitly out of scope here (Phase
 * 7 owns posting to GitHub); nothing in this service ever writes that
 * column, by design — findings must never auto-post.
 */
@Injectable()
export class FindingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFinding(userId: string, findingId: string): Promise<FindingDto> {
    const finding = await this.findOwnedFindingOrThrow(userId, findingId);
    return toFindingDto(finding);
  }

  async updateFinding(
    userId: string,
    findingId: string,
    body: UpdateFindingRequestBody,
  ): Promise<FindingDto> {
    if (!body || typeof body.approved !== 'boolean') {
      throw new BadRequestException('approved (boolean) is required.');
    }

    // Ownership check first (throws 404/403 as appropriate) before any
    // write — same pattern as ReviewsService.getReviewWithFindings.
    await this.findOwnedFindingOrThrow(userId, findingId);

    const updated = await this.prisma.finding.update({
      where: { id: findingId },
      data: { approved: body.approved },
    });

    return toFindingDto(updated);
  }

  /**
   * Looks up a Finding and joins through to its Review to confirm the
   * current user is the one who requested that review — mirrors
   * ReviewsService.getReviewWithFindings's ownership check exactly. Findings
   * are private to whoever requested the parent review (same assumption
   * flagged in the Phase 5 report); 404 if the finding doesn't exist, 403 if
   * it exists but belongs to someone else's review.
   */
  private async findOwnedFindingOrThrow(
    userId: string,
    findingId: string,
  ): Promise<PrismaFinding> {
    const finding = await this.prisma.finding.findUnique({
      where: { id: findingId },
      include: { review: { select: { requestedByUserId: true } } },
    });
    if (!finding) {
      throw new NotFoundException(`Finding ${findingId} not found`);
    }
    if (finding.review.requestedByUserId !== userId) {
      throw new ForbiddenException('You do not have access to this finding.');
    }

    return finding;
  }
}
