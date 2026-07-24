import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

/**
 * Separate process entrypoint for the BullMQ worker. No HTTP listener —
 * this only creates an application context so DI-managed services
 * (Prisma, AiReview) can run job handlers.
 *
 * Phase 1: no real queue consumer is wired yet (that's QueueModule/BullMQ's
 * job in a later phase). This just proves the worker process boots with
 * the correct, restricted module graph (no GithubModule reachable).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  new Logger('WorkerBootstrap').log('Worker application context started (no HTTP listener).');

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap();
