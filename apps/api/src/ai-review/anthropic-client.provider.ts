import { Logger, type Provider } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

/** DI token for the shared Anthropic client instance (worker-side only). */
export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');

const logger = new Logger('AnthropicClientProvider');

/**
 * Constructs the Anthropic SDK client. The SDK reads `ANTHROPIC_API_KEY`
 * from `process.env` itself when `apiKey` is omitted, and — per the SDK's
 * own constructor (verified: `this.apiKey = typeof apiKey === 'string' ?
 * apiKey : null`) — never throws at construction time even if no key is
 * configured. That matches this codebase's "boot without crashing on
 * missing config" convention (see GithubStrategy/CryptoService): a missing
 * key surfaces as a real 401 from Anthropic the first time a job actually
 * runs, not a worker boot crash.
 */
export const AnthropicClientProvider: Provider = {
  provide: ANTHROPIC_CLIENT,
  useFactory: (): Anthropic => {
    if (!process.env.ANTHROPIC_API_KEY) {
      logger.warn(
        'ANTHROPIC_API_KEY is not set — the worker will boot, but any ' +
          'review-generation job will fail when it actually calls Anthropic.',
      );
    }
    return new Anthropic();
  },
};
