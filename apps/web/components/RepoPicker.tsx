'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RepositoryDto } from '@code-review-coach/shared';
import { api, ApiError } from '@/lib/api';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorState } from './ErrorState';
import { EmptyState } from './EmptyState';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Client Component: local search-input state, a debounce timer, and
 * click-to-select navigation — none of which work in a Server Component.
 */
export function RepoPicker() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [repos, setRepos] = useState<RepositoryDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Debounce the search box so we don't hit GET /repositories?search= on
  // every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const query = debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : '';

    api
      .get<RepositoryDto[]>(`/repositories${query}`)
      .then((data) => {
        if (!cancelled) setRepos(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRepos(null);
        setError(
          err instanceof ApiError ? err.message : 'Something went wrong loading repositories.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, version]);

  async function handleSelect(repo: RepositoryDto) {
    setSelectError(null);
    setSelectingId(repo.id);
    try {
      const selected = await api.post<RepositoryDto>(
        `/repositories/${repo.owner}/${repo.name}/select`,
      );
      router.push(`/dashboard/repos/${selected.id}/pulls`);
    } catch (err) {
      setSelectError(
        err instanceof ApiError ? err.message : `Couldn't select ${repo.fullName} — try again.`,
      );
      setSelectingId(null);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Pick a repository</h2>
        <p className="text-sm text-gray-500">Choose a repository to review pull requests for.</p>
      </div>

      <label className="flex w-full max-w-md flex-col gap-1 text-xs font-medium text-gray-600">
        <span className="sr-only">Search your repositories</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your repositories…"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>

      {selectError ? <ErrorState message={selectError} /> : null}

      {loading ? (
        <LoadingSpinner label="Loading repositories…" />
      ) : error ? (
        <ErrorState
          message="Couldn't load repositories — try again."
          onRetry={() => setVersion((v) => v + 1)}
        />
      ) : !repos || repos.length === 0 ? (
        <EmptyState message="No repositories found." />
      ) : (
        <ul className="flex flex-col divide-y divide-gray-200 rounded-md border border-gray-200">
          {repos.map((repo) => (
            <li key={repo.id}>
              <button
                type="button"
                onClick={() => handleSelect(repo)}
                disabled={selectingId !== null}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                <span className="font-medium text-gray-900">{repo.fullName}</span>
                {selectingId === repo.id ? (
                  <span className="text-xs text-gray-500">Selecting…</span>
                ) : repo.isPrivate ? (
                  <span className="text-xs text-gray-400">Private</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
