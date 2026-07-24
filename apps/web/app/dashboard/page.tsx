'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/auth';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorState } from '@/components/ErrorState';
import { AppHeader } from '@/components/AppHeader';
import { RepoPicker } from '@/components/RepoPicker';

/**
 * Client Component: this is the OAuth callback's redirect target and the
 * "logged in home" screen. It needs the useCurrentUser hook (client-side
 * cookie read) to gate the page, plus router.replace for the
 * unauthenticated redirect — neither works in a Server Component.
 */
export default function DashboardPage() {
  const { user, loading, error } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user && !error) {
      router.replace('/login');
    }
  }, [loading, user, error, router]);

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <LoadingSpinner label="Loading your account…" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <ErrorState
          message="Couldn't reach the API to check your session — try again."
          onRetry={() => window.location.reload()}
        />
      </main>
    );
  }

  if (!user) {
    // Redirect effect above is in flight.
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <RepoPicker />
      </main>
    </div>
  );
}
