import { redirect } from 'next/navigation';

/**
 * Server Component: `/` has no content of its own — `/login` is the real
 * entry point (it already handles both the signed-out landing screen and
 * bouncing an already-authenticated user to `/dashboard`), so this route
 * just redirects there. Previously rendered a static "Scaffold OK" page
 * left over from the initial Phase 1 skeleton with a non-functional button.
 */
export default function Home() {
  redirect('/login');
}
