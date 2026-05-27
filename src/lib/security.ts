// CORS + Rate Limiting Middleware for Genova API Routes
// Prevents: CSRF (Cross-Site Request Forgery), DoS (Denial of Service)

import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// CORS — Cross-Origin Resource Sharing
// FIX: No CORS was configured → any website could make requests to our API (CSRF)
// Now only allows same-origin requests by default, configurable allowlist
// ============================================================

const ALLOWED_ORIGINS = new Set([
  process.env.APP_URL || 'http://localhost:3000',
  // Add production domains here
]);

const CORS_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
const CORS_ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'X-Request-ID'];
const CORS_MAX_AGE = 86400; // 24 hours

/**
 * Apply CORS headers to a response
 * For same-origin: no Access-Control-Allow-Origin header needed (browser blocks cross-origin by default)
 * For allowed origins: reflects the requesting origin
 * For unknown origins: blocks the request
 */
export function applyCorsHeaders(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get('origin');

  // No origin = same-origin request (curl, server-to-server) → allow
  if (!origin) return response;

  // Check if origin is allowed
  if (ALLOWED_ORIGINS.has(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  // If origin not in allowlist → no Access-Control-Allow-Origin header → browser blocks

  response.headers.set('Access-Control-Allow-Methods', CORS_ALLOWED_METHODS.join(', '));
  response.headers.set('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS.join(', '));
  response.headers.set('Access-Control-Max-Age', CORS_MAX_AGE.toString());
  response.headers.set('Vary', 'Origin'); // Important for caching with multiple origins

  return response;
}

/**
 * Handle CORS preflight (OPTIONS) requests
 * Returns 204 with CORS headers or 403 if origin not allowed
 */
export function handleCorsPreflightRequest(request: NextRequest): NextResponse | null {
  if (request.method !== 'OPTIONS') return null;

  const origin = request.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return new NextResponse(null, { status: 403 });
  }

  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', CORS_ALLOWED_METHODS.join(', '));
  response.headers.set('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS.join(', '));
  response.headers.set('Access-Control-Max-Age', CORS_MAX_AGE.toString());
  response.headers.set('Vary', 'Origin');
  return response;
}

// ============================================================
// RATE LIMITING — Prevent DoS and API abuse
// FIX: No rate limiting existed → any client could spam requests
// Uses in-memory sliding window counter per IP + userId
// ============================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
  blocked: boolean;
  blockedUntil: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configurations per endpoint type
export interface RateLimitConfig {
  windowMs: number;   // Time window in milliseconds
  maxRequests: number; // Max requests per window
  blockDurationMs: number; // How long to block after exceeding
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Auth endpoints — strict limits
  auth: { windowMs: 60_000, maxRequests: 10, blockDurationMs: 300_000 },        // 10/min
  login: { windowMs: 15_000, maxRequests: 5, blockDurationMs: 600_000 },        // 5/15s (brute force protection)

  // AI endpoints — moderate limits (API costs money)
  ai: { windowMs: 60_000, maxRequests: 20, blockDurationMs: 120_000 },          // 20/min
  aiExecute: { windowMs: 60_000, maxRequests: 10, blockDurationMs: 300_000 },   // 10/min

  // CRUD endpoints — generous limits
  read: { windowMs: 60_000, maxRequests: 100, blockDurationMs: 60_000 },        // 100/min
  write: { windowMs: 60_000, maxRequests: 30, blockDurationMs: 120_000 },       // 30/min
  delete: { windowMs: 60_000, maxRequests: 10, blockDurationMs: 300_000 },      // 10/min

  // Upload — strict limits
  upload: { windowMs: 60_000, maxRequests: 5, blockDurationMs: 300_000 },       // 5/min

  // Default
  default: { windowMs: 60_000, maxRequests: 60, blockDurationMs: 120_000 },     // 60/min
};

// Cleanup old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60_000;
let lastCleanup = Date.now();

function cleanupRateLimitStore(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, entry] of rateLimitStore.entries()) {
    // Remove entries older than window + block duration
    const maxAge = entry.windowStart + entry.blockedUntil - entry.windowStart + 600_000;
    if (now - entry.windowStart > maxAge) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Check rate limit for a request
 * Returns null if allowed, or a NextResponse with 429 if rate limited
 */
export function checkRateLimit(
  request: NextRequest,
  userId?: string,
  config: RateLimitConfig = RATE_LIMITS.default
): NextResponse | null {
  cleanupRateLimitStore();

  // Build rate limit key from IP + userId (if available)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const key = userId ? `${ip}:${userId}` : ip;

  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // If blocked and block hasn't expired
  if (entry?.blocked && now < entry.blockedUntil) {
    const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez plus tard.', retryAfter },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(entry.blockedUntil).toISOString(),
        },
      }
    );
  }

  // Reset window if expired
  if (!entry || now - entry.windowStart > config.windowMs) {
    rateLimitStore.set(key, {
      count: 1,
      windowStart: now,
      blocked: false,
      blockedUntil: 0,
    });
    return null; // Allowed
  }

  // Increment count
  entry.count++;

  if (entry.count > config.maxRequests) {
    // Rate limit exceeded — block
    entry.blocked = true;
    entry.blockedUntil = now + config.blockDurationMs;

    const retryAfter = Math.ceil(config.blockDurationMs / 1000);
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez plus tard.', retryAfter },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(entry.blockedUntil).toISOString(),
        },
      }
    );
  }

  return null; // Allowed
}

// ============================================================
// COMBINED MIDDLEWARE — Apply all security layers at once
// ============================================================

export interface SecurityOptions {
  requireAuth?: boolean;       // Require Bearer token (default: true)
  rateLimit?: RateLimitConfig; // Rate limit config (default: RATE_LIMITS.default)
  rateLimitCategory?: keyof typeof RATE_LIMITS; // Or use named category
}

/**
 * Apply all security middleware to an API route handler.
 * Usage:
 * ```ts
 * export async function GET(request: NextRequest) {
 *   const security = await applySecurity(request, { rateLimitCategory: 'read' });
 *   if (security.error) return security.error;
 *   const { auth } = security;
 *   // auth.userId is verified
 * }
 * ```
 */
export async function applySecurity(
  request: NextRequest,
  options: SecurityOptions = {}
): Promise<{
  auth: { userId: string } | null;
  error: NextResponse | null;
}> {
  const {
    requireAuth = true,
    rateLimit,
    rateLimitCategory,
  } = options;

  // 1. CORS preflight
  const corsResponse = handleCorsPreflightRequest(request);
  if (corsResponse) {
    return { auth: null, error: corsResponse };
  }

  // 2. Authentication
  let auth: { userId: string } | null = null;
  if (requireAuth) {
    const { getAuthenticatedUser } = await import('@/lib/session');
    auth = await getAuthenticatedUser(request);
    if (!auth) {
      return {
        auth: null,
        error: NextResponse.json(
          { error: 'Non autorisé — token invalide ou manquant' },
          { status: 401 }
        ),
      };
    }
  }

  // 3. Rate limiting
  const rateLimitConfig = rateLimit || (rateLimitCategory ? RATE_LIMITS[rateLimitCategory] : RATE_LIMITS.default);
  const rateLimitError = checkRateLimit(request, auth?.userId, rateLimitConfig);
  if (rateLimitError) {
    return { auth, error: rateLimitError };
  }

  return { auth, error: null };
}

/**
 * Wrap a response with CORS headers
 */
export function secureResponse(request: NextRequest, response: NextResponse): NextResponse {
  return applyCorsHeaders(request, response);
}

/**
 * Verify resource ownership — returns 403 if authenticated user doesn't own the resource
 */
export function verifyOwnership(
  authenticatedUserId: string,
  resourceUserId: string,
  resourceName: string = 'Ressource'
): NextResponse | null {
  if (authenticatedUserId !== resourceUserId) {
    return NextResponse.json(
      { error: `Accès refusé — vous ne possédez pas cette ${resourceName.toLowerCase()}` },
      { status: 403 }
    );
  }
  return null; // Ownership verified
}
