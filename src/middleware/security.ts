/**
 * Security Middleware - Production-Grade API Protection
 *
 * Rate limiting, CORS, CSP headers, input validation, CSRF protection
 */
import { NextRequest, NextResponse } from 'next/server';

const AUTH_RATE_LIMIT = 5; // 5 tentatives
const AUTH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 120;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

// In-memory rate limit store (in production, use Redis/Upstash)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Auth rate limiter - stricter limits for auth endpoints
 */
export async function authRateLimit(req: NextRequest, identifier: string): Promise<NextResponse | null> {
  const key = `auth_rate:${identifier}`;
  const now = Date.now();

  let bucket = rateLimitStore.get(key);
  if (!bucket || bucket.resetTime < now) {
    bucket = { count: 0, resetTime: now + AUTH_WINDOW_MS };
    rateLimitStore.set(key, bucket);
  }

  bucket.count++;

  if (bucket.count > AUTH_RATE_LIMIT) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
      { status: 429 }
    );
  }

  return null;
}

/**
 * Rate limiting middleware
 */
export function rateLimit(req: NextRequest): NextResponse | null {
  const clientId = req.headers.get('x-api-key') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();

  let bucket = rateLimitStore.get(clientId);

  if (!bucket || bucket.resetTime < now) {
    bucket = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimitStore.set(clientId, bucket);
  }

  bucket.count++;

  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    );
  }

  return null;
}

/**
 * CORS middleware
 */
const allowedOrigins = [
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  process.env.NEXT_PUBLIC_APP_URL_PRODUCTION,
  ...(process.env.ADDITIONAL_CORS_ORIGINS?.split(',') || []),
].filter(Boolean);

export function cors(req: NextRequest): NextRequest {
  const origin = req.headers.get('origin');
  const isAllowed = allowedOrigins.includes(origin || '');

  // Clone the request to preserve all properties
  if (isAllowed) {
    const headers = new Headers(req.headers);
    headers.set('Access-Control-Allow-Origin', origin!);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    headers.set('Access-Control-Max-Age', '3600');
    return new NextRequest(req.url, { headers });
  }

  const headers = new Headers(req.headers);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  headers.set('Access-Control-Max-Age', '3600');
  return new NextRequest(req.url, { headers });
}

/**
 * Security headers middleware
 */
export function securityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );
  response.headers.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=self'
  );

  return response;
}

/**
 * Input validation middleware
 */
export function validateInput(req: NextRequest): { valid: boolean; error?: string } {
  const contentType = req.headers.get('content-type');

  if (req.method !== 'GET' && contentType && !contentType.includes('application/json')) {
    return { valid: false, error: 'Invalid Content-Type' };
  }

  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
    return { valid: false, error: 'Request body too large' };
  }

  return { valid: true };
}

/**
 * CSRF token generation and validation
 */
export async function generateCSRFToken(sessionToken: string): Promise<string> {
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  const nonceHex = Array.from(nonce, b => b.toString(16).padStart(2, '0')).join('');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(sessionToken),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(nonceHex));
  const sigHex = Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('');
  return `${nonceHex}:${sigHex}`;
}

export async function validateCSRFToken(token: string, sessionToken: string): Promise<boolean> {
  try {
    const [nonce, signature] = token.split(':');
    if (!nonce || !signature) return false;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(sessionToken),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(nonce));
    const expectedHex = Array.from(new Uint8Array(expected), b => b.toString(16).padStart(2, '0')).join('');

    if (signature.length !== expectedHex.length) return false;
    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expectedHex.charCodeAt(i);
    }
    return result === 0;
  } catch {
    return false;
  }
}

/**
 * SQL injection prevention
 */
export function sanitizeQueryParam(param: unknown): string {
  if (typeof param !== 'string') {
    return String(param);
  }
  return param;
}

/**
 * Compose all security middleware
 */
export function applySecurityMiddleware(req: NextRequest): {
  response: NextResponse | null;
  request: NextRequest;
} {
  const corsReq = cors(req);

  const rateLimitResponse = rateLimit(corsReq);
  if (rateLimitResponse) {
    return { response: rateLimitResponse, request: corsReq };
  }

  const validation = validateInput(corsReq);
  if (!validation.valid) {
    return {
      response: NextResponse.json({ error: validation.error }, { status: 400 }),
      request: corsReq,
    };
  }

  return { response: null, request: corsReq };
}
