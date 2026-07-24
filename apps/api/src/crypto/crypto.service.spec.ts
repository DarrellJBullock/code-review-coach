import { InternalServerErrorException } from '@nestjs/common';
import { CryptoService } from './crypto.service';

/**
 * Security-sensitive coverage for AES-256-GCM token encryption at rest
 * (Phase 2/3's stored GitHub access tokens flow through this). Verifies the
 * encrypt/decrypt round trip, that ciphertext/IV are never predictable
 * across calls, that tampering is detected (GCM auth tag), and that a
 * missing/malformed TOKEN_ENCRYPTION_KEY fails loudly rather than silently
 * using weak/no encryption.
 */

const VALID_KEY_HEX = 'a'.repeat(64); // 32 bytes
const OTHER_VALID_KEY_HEX = 'b'.repeat(64);

describe('CryptoService', () => {
  const originalEnv = process.env.TOKEN_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.TOKEN_ENCRYPTION_KEY = originalEnv;
    }
  });

  describe('encrypt/decrypt round trip', () => {
    it('decrypts back to the original plaintext', () => {
      process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY_HEX;
      const service = new CryptoService();

      const payload = service.encrypt('gho_realGithubAccessToken1234567890');
      const decrypted = service.decrypt(payload);

      expect(decrypted).toBe('gho_realGithubAccessToken1234567890');
    });

    it('round-trips an empty string', () => {
      process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY_HEX;
      const service = new CryptoService();

      const payload = service.encrypt('');
      expect(service.decrypt(payload)).toBe('');
    });

    it('produces a different IV and ciphertext on each call (never reuses an IV for the same plaintext)', () => {
      process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY_HEX;
      const service = new CryptoService();

      const first = service.encrypt('same-plaintext');
      const second = service.encrypt('same-plaintext');

      expect(first.iv).not.toBe(second.iv);
      expect(first.ciphertext).not.toBe(second.ciphertext);
      // Both must still independently decrypt correctly.
      expect(service.decrypt(first)).toBe('same-plaintext');
      expect(service.decrypt(second)).toBe('same-plaintext');
    });

    it('never stores/returns the plaintext inside the encrypted payload', () => {
      process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY_HEX;
      const service = new CryptoService();

      const payload = service.encrypt('super-secret-token');

      expect(payload.iv).not.toContain('super-secret-token');
      expect(payload.ciphertext).not.toContain('super-secret-token');
      expect(payload.authTag).not.toContain('super-secret-token');
    });
  });

  describe('tamper detection (GCM auth tag)', () => {
    it('throws when the ciphertext has been tampered with', () => {
      process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY_HEX;
      const service = new CryptoService();
      const payload = service.encrypt('gho_realGithubAccessToken');

      const tamperedCiphertext = Buffer.from(payload.ciphertext, 'base64');
      tamperedCiphertext[0] ^= 0xff; // flip a bit
      const tampered = { ...payload, ciphertext: tamperedCiphertext.toString('base64') };

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('throws when the auth tag has been tampered with', () => {
      process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY_HEX;
      const service = new CryptoService();
      const payload = service.encrypt('gho_realGithubAccessToken');

      const tamperedAuthTag = Buffer.from(payload.authTag, 'base64');
      tamperedAuthTag[0] ^= 0xff;
      const tampered = { ...payload, authTag: tamperedAuthTag.toString('base64') };

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('fails to decrypt a payload that was encrypted under a different key', () => {
      process.env.TOKEN_ENCRYPTION_KEY = VALID_KEY_HEX;
      const service = new CryptoService();
      const payload = service.encrypt('gho_realGithubAccessToken');

      process.env.TOKEN_ENCRYPTION_KEY = OTHER_VALID_KEY_HEX;
      expect(() => service.decrypt(payload)).toThrow();
    });
  });

  describe('key validation', () => {
    it('throws InternalServerErrorException when TOKEN_ENCRYPTION_KEY is unset', () => {
      delete process.env.TOKEN_ENCRYPTION_KEY;
      const service = new CryptoService();

      expect(() => service.encrypt('x')).toThrow(InternalServerErrorException);
    });

    it('throws InternalServerErrorException when TOKEN_ENCRYPTION_KEY does not decode to 32 bytes', () => {
      process.env.TOKEN_ENCRYPTION_KEY = 'abcd'; // valid hex, but only 2 bytes
      const service = new CryptoService();

      expect(() => service.encrypt('x')).toThrow(InternalServerErrorException);
    });

    it('also validates the key on decrypt, not just encrypt', () => {
      delete process.env.TOKEN_ENCRYPTION_KEY;
      const service = new CryptoService();

      expect(() =>
        service.decrypt({ iv: 'AAAA', ciphertext: 'AAAA', authTag: 'AAAA' }),
      ).toThrow(InternalServerErrorException);
    });
  });
});
