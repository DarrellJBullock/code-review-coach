/**
 * Small typed fetch wrapper around the NestJS API.
 *
 * - Always sends `credentials: "include"` so the httpOnly session cookie
 *   (set by GET /auth/github/callback on the API's origin) is attached to
 *   cross-origin requests from the web app's origin.
 * - Throws `ApiError` (with a `status` code) for any non-2xx response so
 *   callers can branch on status (e.g. 401 vs 500) instead of parsing
 *   `Response.ok` themselves.
 * - By default, a 401 triggers a hard redirect to /login, since that means
 *   the session cookie is missing/expired and nothing else in the app can
 *   proceed without re-authenticating. Pass `skipAuthRedirect: true` for
 *   calls where a 401 is an expected, non-fatal outcome (e.g. checking
 *   "am I logged in?" on the login page itself).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  /** JSON-serializable request body. Sets Content-Type: application/json automatically. */
  body?: unknown;
  /** If true, a 401 response is thrown as an ApiError instead of redirecting to /login. */
  skipAuthRedirect?: boolean;
}

function resolveApiUrl(): string {
  if (!API_URL) {
    throw new Error(
      'NEXT_PUBLIC_API_URL is not set. Copy .env.example to .env.local in apps/web and set it.',
    );
  }
  return API_URL;
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (data && typeof data === 'object' && 'message' in data) {
      const message = (data as { message?: unknown }).message;
      if (Array.isArray(message)) return message.join(', ');
      if (typeof message === 'string') return message;
    }
  } catch {
    // Response body wasn't JSON (or was empty) — fall through to the default message.
  }
  return `Request failed with status ${res.status}`;
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const baseUrl = resolveApiUrl();
  const { body, headers, skipAuthRedirect, ...rest } = options;

  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    if (!skipAuthRedirect && typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    throw new ApiError(res.status, await extractErrorMessage(res));
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
};
