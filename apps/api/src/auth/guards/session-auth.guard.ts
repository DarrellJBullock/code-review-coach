import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Guards routes behind a cookie-backed session (see main.ts for the
 * express-session setup). Expects `req.session.userId` to have been set by
 * AuthController's GitHub OAuth callback.
 *
 * Deliberately re-reads the user from the DB on every request (via
 * UsersService.findById) rather than trusting a cached session payload, so a
 * deleted/changed user is reflected immediately instead of after session
 * expiry.
 *
 * Applied to every real controller (Repositories/PullRequests/Reviews/
 * Findings, plus this module's own routes) via `@UseGuards(SessionAuthGuard)`.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.session?.userId;

    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }

    request.currentUser = user;
    return true;
  }
}
