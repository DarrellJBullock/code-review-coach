import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Finding as PrismaFinding } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { FindingsService } from './findings.service';

/**
 * Lightweight ownership-check coverage — this is the security-sensitive
 * bit of Phase 6 (a user must never be able to view or approve a finding
 * belonging to someone else's review). Mirrors the fake-Prisma pattern used
 * in ai-review.service.spec.ts: only the handful of methods FindingsService
 * actually touches are stubbed.
 */
function buildFinding(overrides: Partial<PrismaFinding> = {}): PrismaFinding & {
  review: { requestedByUserId: string };
} {
  return {
    id: 'finding-1',
    reviewId: 'review-1',
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
    approved: false,
    postedToGithub: false,
    githubCommentId: null,
    ...overrides,
    review: { requestedByUserId: 'owner-user' },
  } as PrismaFinding & { review: { requestedByUserId: string } };
}

function buildFakePrisma(findResult: unknown, updateResult?: unknown) {
  const findUnique = jest.fn().mockResolvedValue(findResult);
  const update = jest.fn().mockResolvedValue(updateResult);

  const fakePrisma = {
    finding: { findUnique, update },
  } as unknown as PrismaService;

  return { fakePrisma, findUnique, update };
}

describe('FindingsService ownership checks', () => {
  describe('getFinding', () => {
    it('returns the finding when the current user owns the parent review', async () => {
      const finding = buildFinding();
      const { fakePrisma } = buildFakePrisma(finding);
      const service = new FindingsService(fakePrisma);

      const result = await service.getFinding('owner-user', 'finding-1');

      expect(result.id).toBe('finding-1');
      expect(result).not.toHaveProperty('review');
    });

    it('throws 404 when the finding does not exist', async () => {
      const { fakePrisma } = buildFakePrisma(null);
      const service = new FindingsService(fakePrisma);

      await expect(service.getFinding('owner-user', 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 403 when the finding belongs to another user\'s review', async () => {
      const finding = buildFinding();
      const { fakePrisma } = buildFakePrisma(finding);
      const service = new FindingsService(fakePrisma);

      await expect(service.getFinding('someone-else', 'finding-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('updateFinding', () => {
    it('updates approved for the owning user and never touches postedToGithub', async () => {
      const finding = buildFinding();
      const updated = buildFinding({ approved: true });
      const { fakePrisma, update } = buildFakePrisma(finding, updated);
      const service = new FindingsService(fakePrisma);

      const result = await service.updateFinding('owner-user', 'finding-1', { approved: true });

      expect(result.id).toBe('finding-1');
      expect(update).toHaveBeenCalledWith({
        where: { id: 'finding-1' },
        data: { approved: true },
      });
    });

    it('throws 404 when the finding does not exist and never calls update', async () => {
      const { fakePrisma, update } = buildFakePrisma(null);
      const service = new FindingsService(fakePrisma);

      await expect(
        service.updateFinding('owner-user', 'missing', { approved: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });

    it("throws 403 when the finding belongs to another user's review and never calls update", async () => {
      const finding = buildFinding();
      const { fakePrisma, update } = buildFakePrisma(finding);
      const service = new FindingsService(fakePrisma);

      await expect(
        service.updateFinding('someone-else', 'finding-1', { approved: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(update).not.toHaveBeenCalled();
    });

    it('throws 400 when approved is missing or not a boolean', async () => {
      const finding = buildFinding();
      const { fakePrisma, update } = buildFakePrisma(finding);
      const service = new FindingsService(fakePrisma);

      await expect(
        service.updateFinding('owner-user', 'finding-1', {} as { approved: boolean }),
      ).rejects.toThrow();
      expect(update).not.toHaveBeenCalled();
    });
  });
});
