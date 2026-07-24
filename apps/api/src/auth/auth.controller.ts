import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import type { UserDto } from '@code-review-coach/shared';
import { CurrentUser } from './decorators/current-user.decorator';
import { SessionAuthGuard } from './guards/session-auth.guard';

const DEFAULT_WEB_URL = 'http://localhost:3000';

function toUserDto(user: User): UserDto {
  return { id: user.id, username: user.username, avatarUrl: user.avatarUrl };
}

@Controller('auth')
export class AuthController {
  /**
   * Kicks off the GitHub OAuth handshake. AuthGuard('github') runs
   * GithubStrategy, which redirects the browser to GitHub — this handler
   * body never actually executes.
   */
  @Get('github')
  @UseGuards(AuthGuard('github'))
  githubLogin(): void {
    // Intentionally empty — Passport handles the redirect.
  }

  /**
   * GitHub redirects back here after the user approves/denies access.
   * AuthGuard('github') runs GithubStrategy.validate (which upserts the
   * User row) and attaches the resulting user to `req.user`. We then start
   * a cookie session by storing just the user id, and redirect the browser
   * back to the web app.
   */
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  githubCallback(@Req() req: Request, @Res() res: Response): void {
    const user = req.user as User;
    req.session.userId = user.id;

    const webUrl = process.env.NEXT_PUBLIC_WEB_URL || DEFAULT_WEB_URL;
    res.redirect(`${webUrl}/dashboard`);
  }

  /**
   * Returns the currently authenticated user, or 401 (via SessionAuthGuard)
   * if there is no valid session.
   */
  @Get('me')
  @UseGuards(SessionAuthGuard)
  me(@CurrentUser() user: User): UserDto {
    return toUserDto(user);
  }

  /**
   * Destroys the session and clears the session cookie.
   */
  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response): void {
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ message: 'Failed to log out' });
        return;
      }
      res.clearCookie('connect.sid');
      res.status(200).json({ success: true });
    });
  }
}
