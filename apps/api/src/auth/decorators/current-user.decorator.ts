import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Param decorator exposing the User attached by SessionAuthGuard
 * (`request.currentUser`). Must be used alongside `@UseGuards(SessionAuthGuard)`
 * — without that guard running first, `request.currentUser` will be
 * undefined.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.currentUser;
  },
);
