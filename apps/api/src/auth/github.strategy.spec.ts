import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Profile } from 'passport-github2';
import type { User } from '@prisma/client';
import type { UsersService } from '../users/users.service';
import { GithubStrategy } from './github.strategy';

/**
 * Coverage for the OAuth profile -> UsersService.upsertFromGithubProfile
 * mapping in `validate()` — in particular the username/avatar fallback
 * chain and that both the success and failure paths correctly drive
 * Passport's `done` callback (a swallowed/misrouted error here would show up
 * as a silent login failure, not an exception).
 */

function buildConfigService(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    GITHUB_CLIENT_ID: 'client-id',
    GITHUB_CLIENT_SECRET: 'client-secret',
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    githubId: '12345',
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

function buildProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: '12345',
    username: 'darrellbullock',
    displayName: 'Darrell Bullock',
    photos: [{ value: 'https://avatars.example/darrellbullock.png' }],
    ...overrides,
  } as Profile;
}

describe('GithubStrategy', () => {
  it('boots without throwing (and logs a warning) when GITHUB_CLIENT_ID/SECRET are unset', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const configService = buildConfigService({ GITHUB_CLIENT_ID: undefined, GITHUB_CLIENT_SECRET: undefined });
    const fakeUsersService = {} as unknown as UsersService;

    expect(() => new GithubStrategy(configService, fakeUsersService)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET'));

    warnSpy.mockRestore();
  });

  it('does not warn when both credentials are set', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const configService = buildConfigService();
    const fakeUsersService = {} as unknown as UsersService;

    new GithubStrategy(configService, fakeUsersService);

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  describe('validate', () => {
    it('maps profile fields and calls done(null, user) on a successful upsert', async () => {
      const user = buildUser();
      const upsertFromGithubProfile = jest.fn().mockResolvedValue(user);
      const fakeUsersService = { upsertFromGithubProfile } as unknown as UsersService;
      const strategy = new GithubStrategy(buildConfigService(), fakeUsersService);
      const done = jest.fn();

      await strategy.validate('access-token-123', 'refresh-token', buildProfile(), done);

      expect(upsertFromGithubProfile).toHaveBeenCalledWith({
        githubId: '12345',
        username: 'darrellbullock',
        avatarUrl: 'https://avatars.example/darrellbullock.png',
        accessToken: 'access-token-123',
      });
      expect(done).toHaveBeenCalledWith(null, user);
    });

    it('falls back to displayName when username is missing', async () => {
      const upsertFromGithubProfile = jest.fn().mockResolvedValue(buildUser());
      const fakeUsersService = { upsertFromGithubProfile } as unknown as UsersService;
      const strategy = new GithubStrategy(buildConfigService(), fakeUsersService);
      const done = jest.fn();

      await strategy.validate(
        'access-token-123',
        'refresh-token',
        buildProfile({ username: undefined, displayName: 'Darrell Bullock' }),
        done,
      );

      expect(upsertFromGithubProfile).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'Darrell Bullock' }),
      );
    });

    it('falls back to githubId when both username and displayName are missing', async () => {
      const upsertFromGithubProfile = jest.fn().mockResolvedValue(buildUser());
      const fakeUsersService = { upsertFromGithubProfile } as unknown as UsersService;
      const strategy = new GithubStrategy(buildConfigService(), fakeUsersService);
      const done = jest.fn();

      await strategy.validate(
        'access-token-123',
        'refresh-token',
        buildProfile({ username: undefined, displayName: undefined }),
        done,
      );

      expect(upsertFromGithubProfile).toHaveBeenCalledWith(
        expect.objectContaining({ username: '12345' }),
      );
    });

    it('passes avatarUrl as null when the profile has no photos', async () => {
      const upsertFromGithubProfile = jest.fn().mockResolvedValue(buildUser());
      const fakeUsersService = { upsertFromGithubProfile } as unknown as UsersService;
      const strategy = new GithubStrategy(buildConfigService(), fakeUsersService);
      const done = jest.fn();

      await strategy.validate(
        'access-token-123',
        'refresh-token',
        buildProfile({ photos: undefined }),
        done,
      );

      expect(upsertFromGithubProfile).toHaveBeenCalledWith(
        expect.objectContaining({ avatarUrl: null }),
      );
    });

    it('calls done(err, false) instead of throwing when upsertFromGithubProfile rejects', async () => {
      const dbError = new Error('DB connection lost');
      const upsertFromGithubProfile = jest.fn().mockRejectedValue(dbError);
      const fakeUsersService = { upsertFromGithubProfile } as unknown as UsersService;
      const strategy = new GithubStrategy(buildConfigService(), fakeUsersService);
      const done = jest.fn();

      await expect(
        strategy.validate('access-token-123', 'refresh-token', buildProfile(), done),
      ).resolves.toBeUndefined();

      expect(done).toHaveBeenCalledWith(dbError, false);
    });
  });
});
