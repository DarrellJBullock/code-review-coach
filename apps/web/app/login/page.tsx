'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/auth';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Client Component: needs the useCurrentUser hook (client-side cookie read
 * via GET /auth/me) to decide whether to show the login button or bounce an
 * already-authenticated user straight to /dashboard.
 */
export default function LoginPage() {
  const { user, loading } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [loading, user, router]);

  if (loading || user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <LoadingSpinner label="Checking session…" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold text-indigo-600">PR Review Coach</h1>
      <p className="max-w-sm text-sm text-gray-500">
        Sign in with your GitHub account to pick a repository and get AI-powered pull request
        reviews.
      </p>
      {/*
        Plain <a href>, not a fetch/onClick: GET /auth/github starts a
        302 redirect chain to GitHub and back to our own callback, which
        only works as a real browser navigation.
      */}
      <a
        href={`${API_URL}/auth/github`}
        className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        <svg
          viewBox="0 0 16 16"
          width="18"
          height="18"
          fill="currentColor"
          aria-hidden="true"
          className="shrink-0"
        >
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
        Login with GitHub
      </a>
    </main>
  );
}
