import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import session from 'express-session';
import passport from 'passport';
import { AppModule } from './app.module';

const DEFAULT_WEB_URL = 'http://localhost:3000';
const DEV_ONLY_INSECURE_SESSION_SECRET = 'dev-insecure-session-secret-CHANGE-ME';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // apps/web (port 3000) and apps/api (port 4000) are different origins, and
  // the session cookie needs to travel with fetch requests from the web app.
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL || DEFAULT_WEB_URL;
  app.enableCors({
    origin: webUrl,
    credentials: true,
  });

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
        // NOTE: this MUST become `true` once the app is served over HTTPS in
        // production — secure cookies are silently dropped by browsers over
        // plain HTTP, so it has to stay `false` for local http://localhost
        // dev.
        secure: false,
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
