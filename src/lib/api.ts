// Centralized API fetch utility for Genova
// All API calls should use this instead of raw fetch() to ensure:
// 1. httpOnly session cookies are always sent (credentials: 'include')
// 2. Consistent error handling
// 3. No token management needed client-side

const API_BASE = '';

interface ApiFetchOptions extends RequestInit {
  /** JSON body — automatically stringified */
  json?: unknown;
}

/**
 * Typed fetch wrapper for Genova API routes.
 * Automatically includes credentials (httpOnly cookies) and handles JSON bodies.
 *
 * Usage:
 * ```ts
 * // Simple GET
 * const data = await apiFetch<User>('/api/auth/me');
 *
 * // POST with JSON body
 * const result = await apiFetch<Agent>('/api/agents', {
 *   method: 'POST',
 *   json: { name: 'My Agent', type: 'assistant' },
 * });
 *
 * // With error handling
 * const res = await apiFetch('/api/agents', { method: 'DELETE' });
 * if (!res.ok) { ... }
 * ```
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response & { json(): Promise<T> }> {
  const { json, headers: customHeaders, ...rest } = options;

  const headers = new Headers(customHeaders as HeadersInit);
  if (json !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    credentials: 'include', // Always send httpOnly cookies
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  return response as Response & { json(): Promise<T> };
}

/**
 * Convenience: apiFetch that throws on non-ok responses
 */
export async function apiFetchJson<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const res = await apiFetch<T>(path, options);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Erreur réseau' }));
    throw new Error(error.error || `Erreur ${res.status}`);
  }
  return res.json();
}
