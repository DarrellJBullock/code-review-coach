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
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Login with GitHub
      </a>
    </main>
  );
}
