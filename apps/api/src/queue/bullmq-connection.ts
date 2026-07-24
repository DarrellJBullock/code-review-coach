import { Logger } from '@nestjs/common';
import IORedis from 'ioredis';

const DEFAULT_REDIS_URL = 'redis://localhost:6379';
const logger = new Logger('BullMqConnection');

/**
 * Builds a dedicated ioredis connection for BullMQ Queue/Worker instances.
 *
 * Reads `REDIS_URL` directly from `process.env` (rather than via
 * `ConfigService`) so this helper works unchanged in both the HTTP app
 * (AppModule's `ConfigModule.forRoot()` populates `process.env` via dotenv)
 * and the worker app (WorkerModule adds its own `ConfigModule.forRoot()` for
 * the same reason — see worker.module.ts).
 *
 * Falls back to a local default + a warning log rather than throwing, to
 * match this codebase's existing "boot without crashing on missing config"
 * convention (see GithubStrategy) — a bad/missing Redis connection surfaces
 * as connection errors from ioredis/BullMQ at actual use time, not a hard
 * boot-time crash.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ for the blocking
 * connections a Worker uses internally (BullMQ throws/warns without it).
 */
export function buildBullMqConnection(): IORedis {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.warn(
      'REDIS_URL is not set — falling back to the default local Redis URL ' +
        `(${DEFAULT_REDIS_URL}). BullMQ job processing will fail to connect ` +
        'unless Redis is actually reachable there.',
    );
  }

  return new IORedis(redisUrl || DEFAULT_REDIS_URL, { maxRetriesPerRequest: null });
}
