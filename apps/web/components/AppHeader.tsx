'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { UserDto } from '@code-review-coach/shared';
import { logout } from '@/lib/auth';

interface AppHeaderProps {
  user: UserDto;
}

/**
 * Client Component: needs onClick (logout) and useRouter (redirect after
 * logout), neither of which work in a Server Component.
 */
export function AppHeader({ user }: AppHeaderProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      // Whether logout succeeded or the request itself failed, sending the
      // user back to /login is the safe default — /login re-checks the
      // session via useCurrentUser and will bounce back if it's still valid.
      router.push('/login');
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
      <Link href="/dashboard" className="text-lg font-semibold text-indigo-600">
        PR Review Coach
      </Link>
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/history"
          className="text-sm font-medium text-gray-700 hover:text-indigo-600"
        >
          History
        </Link>
        {user.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt={`${user.username}'s avatar`}
            width={28}
            height={28}
            className="rounded-full"
          />
        ) : null}
        <span className="text-sm font-medium text-gray-700">{user.username}</span>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loggingOut ? 'Logging out…' : 'Log out'}
        </button>
      </div>
    </header>
  );
}
