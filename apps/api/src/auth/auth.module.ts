import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GithubStrategy } from './github.strategy';
import { SessionAuthGuard } from './guards/session-auth.guard';

/**
 * `PassportModule.register({ session: false })`: we use Passport only to
 * run the GitHub OAuth handshake (redirect + callback validate()), not to
 * manage its own session/serialization. Session persistence is handled
 * ourselves via express-session (`req.session.userId`, set in
 * AuthController's callback handler) plus SessionAuthGuard re-reading the
 * user from the DB on each request. This avoids needing
 * passport.serializeUser/deserializeUser at all.
 */
@Module({
  imports: [PassportModule.register({ session: false }), UsersModule],
  controllers: [AuthController],
  providers: [AuthService, GithubStrategy, SessionAuthGuard],
  exports: [AuthService, SessionAuthGuard],
})
export class AuthModule {}
