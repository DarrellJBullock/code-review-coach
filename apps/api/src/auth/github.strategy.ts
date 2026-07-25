import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-github2';
import type { User } from '@prisma/client';
import { UsersService } from '../users/users.service';

type GithubDoneCallback = (err: unknown, user?: User | false) => void;

const DEFAULT_API_PUBLIC_URL = 'http://localhost:4000';
const MISSING_CREDENTIAL_PLACEHOLDER = 'not-configured';

/**
 * Passport strategy for "Sign in with GitHub". Registered under the name
 * 'github' (matches `AuthGuard('github')` usage in AuthController).
 *
 * Credentials come from GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET (.env). If
 * they are unset (expected until a human creates a real GitHub OAuth App —
 * see README/report), we fall back to a placeholder string rather than
 * throwing in the constructor, so the whole API can still boot. Any actual
 * `/auth/github` attempt will fail at GitHub's side with those placeholder
 * credentials, which is the correct, non-crashing failure mode.
 */
@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  private static readonly logger = new Logger(GithubStrategy.name);

  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const clientID = configService.get<string>('GITHUB_CLIENT_ID');
    const clientSecret = configService.get<string>('GITHUB_CLIENT_SECRET');
    // The API's own public base URL — e.g. https://api.example.com in
    // production. Was previously hardcoded to localhost, which meant every
    // real (non-local) login attempt got a callback URL GitHub never had
    // registered ("redirect_uri is not associated with this application").
    const apiPublicUrl = configService.get<string>('API_PUBLIC_URL') || DEFAULT_API_PUBLIC_URL;
    const callbackUrl = `${apiPublicUrl.replace(/\/+$/, '')}/auth/github/callback`;

    super({
      clientID: clientID || MISSING_CREDENTIAL_PLACEHOLDER,
      clientSecret: clientSecret || MISSING_CREDENTIAL_PLACEHOLDER,
      callbackURL: callbackUrl,
      scope: ['repo', 'read:user'],
    });

    if (!clientID || !clientSecret) {
      GithubStrategy.logger.warn(
        'GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are not set in .env. The API ' +
          'will still boot, but any real /auth/github login attempt will fail ' +
          'until a GitHub OAuth App is created and its credentials are set ' +
          '(see .env.example; callback URL to register: ' +
          `${callbackUrl}).`,
      );
    }
  }

  async validate(
    accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: GithubDoneCallback,
  ): Promise<void> {
    try {
      const githubId = profile.id;
      const username = profile.username ?? profile.displayName ?? githubId;
      const avatarUrl = profile.photos?.[0]?.value ?? null;

      const user = await this.usersService.upsertFromGithubProfile({
        githubId,
        username,
        avatarUrl,
        accessToken,
      });

      done(null, user);
    } catch (err) {
      done(err, false);
    }
  }
}
