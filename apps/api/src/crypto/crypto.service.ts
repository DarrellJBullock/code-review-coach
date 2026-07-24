import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // recommended IV length for GCM
const KEY_LENGTH_BYTES = 32; // AES-256 key length

export interface EncryptedPayload {
  /** base64-encoded initialization vector */
  iv: string;
  /** base64-encoded ciphertext */
  ciphertext: string;
  /** base64-encoded GCM auth tag */
  authTag: string;
}

/**
 * AES-256-GCM encrypt/decrypt for values at rest (e.g. stored GitHub access
 * tokens, in a later phase). Key material comes from the TOKEN_ENCRYPTION_KEY
 * env var, expected to be a 64-character hex string (32 bytes), e.g.
 * generated via `openssl rand -hex 32` (see .env.example).
 *
 * No GitHub/DB logic lives here — this is a pure infrastructure utility.
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);

  private getKey(): Buffer {
    const raw = process.env.TOKEN_ENCRYPTION_KEY;
    if (!raw) {
      throw new InternalServerErrorException(
        'TOKEN_ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32` and set it in .env.',
      );
    }

    const key = Buffer.from(raw, 'hex');
    if (key.length !== KEY_LENGTH_BYTES) {
      throw new InternalServerErrorException(
        `TOKEN_ENCRYPTION_KEY must decode to ${KEY_LENGTH_BYTES} bytes (a ${KEY_LENGTH_BYTES * 2}-character hex string), got ${key.length} bytes.`,
      );
    }

    return key;
  }

  encrypt(plaintext: string): EncryptedPayload {
    const key = this.getKey();
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  decrypt(payload: EncryptedPayload): string {
    const key = this.getKey();
    const iv = Buffer.from(payload.iv, 'base64');
    const authTag = Buffer.from(payload.authTag, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }
}
