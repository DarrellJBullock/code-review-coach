import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Real PrismaService, wired against the generated PrismaClient for the
 * schema at apps/api/prisma/schema.prisma (see DBA notes there).
 *
 * Deliberately lazy-connect: we do NOT call `this.$connect()` in
 * onModuleInit. PrismaClient already connects lazily on its first actual
 * query, so skipping an eager `$connect()` here means Nest's module
 * bootstrap does not depend on a live Postgres connection at boot time. If
 * Postgres is unreachable, boot still succeeds; only the first real query
 * will fail (surfaced as a normal request-time error), instead of the whole
 * process refusing to start. This matters right now because local Postgres
 * is currently contended/unreachable (see repo-root docker-compose notes) —
 * an eager `await this.$connect()` here would turn that into a boot crash
 * for the whole API, not just DB-touching endpoints.
 *
 * `$disconnect()` on module destroy is always safe to call (a no-op if
 * never connected), so that lifecycle hook stays eager.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    this.logger.debug(
      'PrismaService initialized (lazy connect — no query has been issued yet)',
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
