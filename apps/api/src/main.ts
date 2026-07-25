import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import passport from 'passport';
import { AppModule } from './app.module';

const DEFAULT_WEB_URL = 'http://localhost:3000';
const DEV_ONLY_INSECURE_SESSION_SECRET = 'dev-insecure-session-secret-CHANGE-ME';

async function bootstrap(): Promise<void> {
  // NestExpressApplication (not the platform-agnostic INestApplication) so
  // `app.set('trust proxy', ...)` below — an Express-specific method — is
  // typed. NestFactory.create still returns the Express adapter by default.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  // apps/web (port 3000) and apps/api (port 4000) are different origins, and
  // the session cookie needs to travel with fetch requests from the web app.
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL || DEFAULT_WEB_URL;
  app.enableCors({
    origin: webUrl,
    credentials: true,
  });

  // In production (Railway API + Vercel web are on different real domains,
  // both over HTTPS) the session cookie must be `secure: true` +
  // `sameSite: 'none'` or the browser silently drops it on every
  // credentialed cross-origin fetch — the symptom is a "successful" GitHub
  // login that just bounces back to /login with no session. Local dev keeps
  // `secure: false` / `sameSite: 'lax'` since it's plain http://localhost.
  // Trust the first proxy hop (Railway's edge) so Express sees the original
  // https:// scheme via X-Forwarded-Proto rather than the internal http
  // connection — required for `secure` cookies to be set at all here.
  const isProduction = process.env.NODE_ENV === 'production';
  app.set('trust proxy', 1);

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    logger.warn(
      'SESSION_SECRET is not set in .env — falling back to an insecure ' +
        'development-only secret. Generate a real one with `openssl rand ' +
        '-hex 32` and set SESSION_SECRET before relying on real sessions.',
    );
  }

  app.use(
    session({
      secret: sessionSecret || DEV_ONLY_INSECURE_SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      },
    }),
  );

  // Only used to run the GitHub OAuth handshake (AuthGuard('github')) — we
  // do not use passport's own session serialization (see AuthModule).
  app.use(passport.initialize());

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
}

bootstrap();
