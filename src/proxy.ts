import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'genova_session';

const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/refresh',
  '/api',
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname === route + '/'
  );
}

function getCorsOrigin(origin: string | null): string | null {
  if (!origin) return null;

  const allowedOrigins: string[] = [
    ...(process.env.CORS_ALLOWED_ORIGINS?.split(',').filter(Boolean) || []),
    ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000'] : []),
  ];

  if (allowedOrigins.includes(origin)) return origin;

  const serverHost = process.env.NEXT_PUBLIC_APP_URL || '';
  if (serverHost && origin === serverHost) return origin;

  return null;
}

function addCorsHeaders(response: NextResponse, origin: string | null): void {
  const allowedOrigin = getCorsOrigin(origin);
  if (allowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Max-Age', '86400');
}

function addSecurityHeaders(response: NextResponse): void {
  // Content-Security-Policy — restrict resource loading to same origin
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' https:; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );

  // X-Content-Type-Options — prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // X-Frame-Options — prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // Referrer-Policy — limit referrer information
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions-Policy — disable browser features that could be exploited
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), ambient-light-sensor=(), autoplay=(), encrypted-media=(), fullscreen=(self), picture-in-picture=()'
  );

  // X-XSS-Protection — enable browser XSS filter
  response.headers.set('X-XSS-Protection', '1; mode=block');
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get('origin');

  // Allow CORS preflight requests through without auth
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    addCorsHeaders(response, origin);
    addSecurityHeaders(response);
    return response;
  }

  // Skip auth for public routes
  if (isPublicRoute(pathname)) {
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  }

  // Check for session cookie
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    const response = NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
    addCorsHeaders(response, origin);
    addSecurityHeaders(response);
    return response;
  }

  // Session cookie exists — let the request through.
  // Actual session validation (DB lookup, expiry check) happens in each
  // route handler via `applySecurity`.
  const response = NextResponse.next();
  addSecurityHeaders(response);
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
