import type { Request } from 'express';
import type { User } from '@prisma/client';

/**
 * Express Request narrowed to what SessionAuthGuard attaches. Used instead
 * of a global `declare global { namespace Express { ... } }` augmentation
 * so the type stays explicit at each call site.
 */
export interface AuthenticatedRequest extends Request {
  currentUser?: User;
}
