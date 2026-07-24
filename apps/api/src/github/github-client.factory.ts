import { Injectable } from '@nestjs/common';
import { Octokit } from '@octokit/rest';
import { UsersService } from '../users/users.service';

/**
 * Builds a per-call Octokit instance authenticated as a given app user.
 *
 * Deliberately NOT cached/reused across requests: a user's stored GitHub
 * access token can change (re-auth, token revocation + re-link) between
 * calls, and constructing a plain Octokit instance is cheap. At this app's
 * scale, "one Octokit instance per call" is simpler and safer than managing
 * cache invalidation.
 */
@Injectable()
export class GithubClientFactory {
  constructor(private readonly usersService: UsersService) {}

  async getClientForUser(userId: string): Promise<Octokit> {
    const accessToken = await this.usersService.getDecryptedAccessToken(userId);
    return new Octokit({ auth: accessToken });
  }
}
