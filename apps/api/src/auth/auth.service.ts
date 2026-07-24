import { Injectable } from '@nestjs/common';

/**
 * Intentionally minimal for Phase 2. The actual login flow (GitHub OAuth
 * handshake, session creation, upserting the User row) is handled by
 * GithubStrategy + AuthController + UsersService — none of that needed a
 * separate service layer. Kept as a real (empty) provider so future
 * auth-adjacent business logic (e.g. token refresh, account linking) has an
 * obvious home without a module wiring change.
 */
@Injectable()
export class AuthService {}
