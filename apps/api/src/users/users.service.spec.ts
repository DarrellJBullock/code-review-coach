import { NotFoundException } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { CryptoService } from '../crypto/crypto.service';
import type { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

/**
 * Security-sensitive coverage: UsersService is the only thing standing
 * between a plaintext GitHub access token and the DB (see
 * upsertFromGithubProfile/getDecryptedAccessToken). Verifies it always
 * encrypts before persisting and always decrypts via CryptoService rather
 * than ever storing/returning a raw token itself. Mirrors the fake-Prisma
 * pattern used elsewhere in this suite.
 */

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    githubId: 'gh-1',
    username: 'darrellbullock',
    avatarUrl: null,
    accessTokenIv: 'stored-iv',
    accessTokenCiphertext: 'stored-ciphertext',
    accessTokenAuthTag: 'stored-authtag',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as User;
}

function buildFakePrisma(options: { findUniqueResult?: unknown; upsertResult?: unknown } = {}) {
  const findUnique = jest.fn().mockResolvedValue(options.findUniqueResult ?? null);
  const upsert = jest.fn().mockResolvedValue(options.upsertResult ?? buildUser());
  const fakePrisma = { user: { findUnique, upsert } } as unknown as PrismaService;
  return { fakePrisma, findUnique, upsert };
}

function buildFakeCrypto() {
  const encrypt = jest.fn().mockReturnValue({
    iv: 'new-iv',
    ciphertext: 'new-ciphertext',
    authTag: 'new-authtag',
  });
  const decrypt = jest.fn().mockReturnValue('gho_decryptedRealToken');
  const fakeCrypto = { encrypt, decrypt } as unknown as CryptoService;
  return { fakeCrypto, encrypt, decrypt };
}

describe('UsersService', () => {
  describe('upsertFromGithubProfile', () => {
    it('encrypts the access token before persisting, and never writes the plaintext token to Prisma', async () => {
      const { fakePrisma, upsert } = buildFakePrisma();
      const { fakeCrypto, encrypt } = buildFakeCrypto();
      const service = new UsersService(fakePrisma, fakeCrypto);

      await service.upsertFromGithubProfile({
        githubId: 'gh-1',
        username: 'darrellbullock',
        avatarUrl: 'https://avatars.example/darrellbullock.png',
        accessToken: 'gho_plaintextRealToken',
      });

      expect(encrypt).toHaveBeenCalledWith('gho_plaintextRealToken');

      const [callArgs] = upsert.mock.calls[0];
      expect(callArgs).toEqual({
        where: { githubId: 'gh-1' },
        create: {
          githubId: 'gh-1',
          username: 'darrellbullock',
          avatarUrl: 'https://avatars.example/darrellbullock.png',
          accessTokenIv: 'new-iv',
          accessTokenCiphertext: 'new-ciphertext',
          accessTokenAuthTag: 'new-authtag',
        },
        update: {
          username: 'darrellbullock',
          avatarUrl: 'https://avatars.example/darrellbullock.png',
          accessTokenIv: 'new-iv',
          accessTokenCiphertext: 'new-ciphertext',
          accessTokenAuthTag: 'new-authtag',
        },
      });
      // The plaintext token must never appear anywhere in the Prisma call.
      expect(JSON.stringify(callArgs)).not.toContain('gho_plaintextRealToken');
    });

    it('always re-encrypts and overwrites the stored token on update (a fresh OAuth callback = a fresh token)', async () => {
      const { fakePrisma, upsert } = buildFakePrisma();
      const { fakeCrypto, encrypt } = buildFakeCrypto();
      const service = new UsersService(fakePrisma, fakeCrypto);

      await service.upsertFromGithubProfile({
        githubId: 'gh-1',
        username: 'darrellbullock',
        avatarUrl: null,
        accessToken: 'gho_rotatedToken',
      });

      expect(encrypt).toHaveBeenCalledTimes(1);
      expect(upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDecryptedAccessToken', () => {
    it('decrypts using the stored iv/ciphertext/authTag for the given user', async () => {
      const user = buildUser();
      const { fakePrisma, findUnique } = buildFakePrisma({ findUniqueResult: user });
      const { fakeCrypto, decrypt } = buildFakeCrypto();
      const service = new UsersService(fakePrisma, fakeCrypto);

      const result = await service.getDecryptedAccessToken('user-1');

      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: {
          accessTokenIv: true,
          accessTokenCiphertext: true,
          accessTokenAuthTag: true,
        },
      });
      expect(decrypt).toHaveBeenCalledWith({
        iv: 'stored-iv',
        ciphertext: 'stored-ciphertext',
        authTag: 'stored-authtag',
      });
      expect(result).toBe('gho_decryptedRealToken');
    });

    it('throws NotFoundException when the user does not exist, and never calls decrypt', async () => {
      const { fakePrisma } = buildFakePrisma({ findUniqueResult: null });
      const { fakeCrypto, decrypt } = buildFakeCrypto();
      const service = new UsersService(fakePrisma, fakeCrypto);

      await expect(service.getDecryptedAccessToken('missing-user')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(decrypt).not.toHaveBeenCalled();
    });
  });

  describe('findByGithubId / findById', () => {
    it('findByGithubId queries by githubId', async () => {
      const user = buildUser();
      const { fakePrisma, findUnique } = buildFakePrisma({ findUniqueResult: user });
      const { fakeCrypto } = buildFakeCrypto();
      const service = new UsersService(fakePrisma, fakeCrypto);

      const result = await service.findByGithubId('gh-1');

      expect(findUnique).toHaveBeenCalledWith({ where: { githubId: 'gh-1' } });
      expect(result).toEqual(user);
    });

    it('findById queries by id and returns null when not found', async () => {
      const { fakePrisma, findUnique } = buildFakePrisma({ findUniqueResult: null });
      const { fakeCrypto } = buildFakeCrypto();
      const service = new UsersService(fakePrisma, fakeCrypto);

      const result = await service.findById('missing');

      expect(findUnique).toHaveBeenCalledWith({ where: { id: 'missing' } });
      expect(result).toBeNull();
    });
  });
});
