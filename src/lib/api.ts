interface ApiFetchOptions extends RequestInit {
  params?: Record<string, string>;
}

/**
 * Custom API error class with HTTP status code.
 * Used by apiFetch to provide structured error information.
 */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Client-side fetch wrapper with automatic credentials and error handling.
 *
 * Key behaviors:
 * - Automatically sends httpOnly cookies via `credentials: 'include'`
 * - Auto-sets `Content-Type: application/json` for string bodies
 * - On 401: throws ApiError but does NOT auto-logout (the auth store handles
 *   session refresh and logout logic centrally)
 * - On other errors: throws ApiError with server error message
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = path;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const headers = new Headers(fetchOptions.headers);
  if (!headers.has('Content-Type') && fetchOptions.body && typeof fetchOptions.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    // Throw a structured error — the auth store's validateSession handles
    // refresh logic and logout. We do NOT dispatch events or clear state here
    // to avoid race conditions and duplicate logout triggers.
    throw new ApiError('Authentication required', 401);
  }

  if (!response.ok) {
    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: 'Request failed' };
    }
    throw new ApiError(
      (errorData as { error?: string })?.error || 'Request failed',
      response.status
    );
  }

  return response.json() as Promise<T>;
}
