import 'express-session';

/**
 * Augments express-session's SessionData with the single field we actually
 * store: the authenticated user's id. We deliberately do NOT stash the full
 * user object in the session — SessionAuthGuard re-reads the user from the
 * DB via UsersService.findById on each request, so session data can never
 * go stale relative to the DB.
 */
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}
