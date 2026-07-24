import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { FindingDto } from '@code-review-coach/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { FindingsService } from './findings.service';
import type { UpdateFindingRequestBody } from './findings.types';

/**
 * Real FindingsController (Phase 6). Only supports reading a single Finding
 * and toggling its `approved` flag — no bulk-approve, no "post to GitHub"
 * endpoint. Posting is Phase 7's responsibility and, per product's
 * non-negotiable safety rule, nothing here ever auto-posts.
 */
@Controller('findings')
@UseGuards(SessionAuthGuard)
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  /**
   * GET /findings/:id
   * Returns a single Finding. Only the user who requested the parent review
   * may fetch it.
   */
  @Get(':id')
  async getOne(@CurrentUser() user: User, @Param('id') id: string): Promise<FindingDto> {
    return this.findingsService.getFinding(user.id, id);
  }

  /**
   * PATCH /findings/:id
   * Body: { approved: boolean }
   * Toggles the reviewer's approval of a single finding. Does NOT accept or
   * change `postedToGithub` — that column is exclusively written by Phase
   * 7's posting flow.
   */
  @Patch(':id')
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateFindingRequestBody,
  ): Promise<FindingDto> {
    return this.findingsService.updateFinding(user.id, id, body);
  }
}
