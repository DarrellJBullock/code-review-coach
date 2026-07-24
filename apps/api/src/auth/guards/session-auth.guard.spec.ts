import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { UsersService } from '../../users/users.service';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import { SessionAuthGuard } from './session-auth.guard';

/**
 * Authorization-sensitive coverage: this guard is the single gate deciding
 * whether a request is treated as authenticated at all, and it deliberately
 * re-reads the user from the DB on every request rather than trusting the
 * session payload alone (see the class doc comment) — both branches of that
 * "trust but verify" behavior need to be locked in.
 */

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    githubId: 'gh-1',
    username: 'darrellbullock',
    avatarUrl: null,
    accessTokenIv: 'iv',
    accessTokenCiphertext: 'ct',
    accessTokenAuthTag: 'tag',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as User;
}

function buildContext(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as AuthenticatedRequest,
    }),
  } as unknown as ExecutionContext;
}

function buildGuard(findByIdResult: User | null) {
  const findById = jest.fn().mockResolvedValue(findByIdResult);
  const fakeUsersService = { findById } as unknown as UsersService;
  const guard = new SessionAuthGuard(fakeUsersService);
  return { guard, findById };
}

describe('SessionAuthGuard', () => {
  it('throws UnauthorizedException when there is no session at all', async () => {
    const { guard, findById } = buildGuard(null);
    const context = buildContext({ session: undefined });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findById).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when the session has no userId', async () => {
    const { guard, findById } = buildGuard(null);
    const context = buildContext({ session: {} as AuthenticatedRequest['session'] });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findById).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when the session has a userId but the user no longer exists in the DB', async () => {
    const { guard, findById } = buildGuard(null);
    const context = buildContext({
      session: { userId: 'deleted-user' } as AuthenticatedRequest['session'],
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findById).toHaveBeenCalledWith('deleted-user');
  });

  it('re-reads the user from the DB rather than trusting the session payload, and attaches it to the request', async () => {
    const user = buildUser({ id: 'user-1', username: 'freshUsername' });
    const { guard, findById } = buildGuard(user);
    const request = {
      session: { userId: 'user-1' } as AuthenticatedRequest['session'],
    } as AuthenticatedRequest;
    const context = buildContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(findById).toHaveBeenCalledWith('user-1');
    expect(request.currentUser).toEqual(user);
  });
});
