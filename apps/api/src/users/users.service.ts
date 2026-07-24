import { Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaService } from '../prisma/prisma.service';

export interface UpsertFromGithubProfileInput {
  githubId: string;
  username: string;
  avatarUrl: string | null;
  /** Plaintext GitHub access token — encrypted before it ever touches the DB. */
  accessToken: string;
}

/**
 * Real UsersService (Phase 2). Owns all reads/writes of the `users` table,
 * including encrypting/decrypting the stored GitHub access token via
 * CryptoService. Nothing here talks to GitHub's API directly (that's
 * GithubModule, Phase 3) — this module only persists what AuthModule's
 * GithubStrategy hands it after a successful OAuth callback.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async findByGithubId(githubId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { githubId } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Upserts a User row keyed on `githubId` (the stable GitHub identity).
   * Always re-encrypts and overwrites the stored access token, since a
   * fresh OAuth callback means we have a fresh (and possibly rotated) token.
   */
  async upsertFromGithubProfile(input: UpsertFromGithubProfileInput): Promise<User> {
    const { githubId, username, avatarUrl, accessToken } = input;
    const encrypted = this.crypto.encrypt(accessToken);

    return this.prisma.user.upsert({
      where: { githubId },
      create: {
        githubId,
        username,
        avatarUrl,
        accessTokenIv: encrypted.iv,
        accessTokenCiphertext: encrypted.ciphertext,
        accessTokenAuthTag: encrypted.authTag,
      },
      update: {
        username,
        avatarUrl,
        accessTokenIv: encrypted.iv,
        accessTokenCiphertext: encrypted.ciphertext,
        accessTokenAuthTag: encrypted.authTag,
      },
    });
  }

  /**
   * Decrypts and returns the raw GitHub access token for a user. Consumed by
   * GithubModule (Phase 3) to build an authenticated Octokit client — kept
   * here now so that consumer has a stable, correct method to call against.
   */
  async getDecryptedAccessToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        accessTokenIv: true,
        accessTokenCiphertext: true,
        accessTokenAuthTag: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    return this.crypto.decrypt({
      iv: user.accessTokenIv,
      ciphertext: user.accessTokenCiphertext,
      authTag: user.accessTokenAuthTag,
    });
  }
}
