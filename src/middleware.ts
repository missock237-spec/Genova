// ============================================================
// Gen3ia — Middleware de sécurité (deny-by-default) — Firebase
// ============================================================
//  Règle : TOUTE route /api/* est protégée SAUF celles
//  explicitement listées comme publiques (route par route).
//
//  SÉCURITÉ :
//  - Layer 1 (ce middleware) : exige UNE forme d'auth (session cookie
//    Firebase OU présence x-api-key/bearer qui seront VALIDES en couche 2
//    withAuth).
//  - Les routes ADMIN exigent TOUJOURS le rôle 'admin' (custom claim
//    Firebase Auth), jamais court-circuité par une api key non validée.
// ============================================================
import { SESSION_COOKIE_NAME } from '@/lib/firebase/config';
import { generateCspNonce, buildCspHeader } from '@/lib/csp';
import { getSecurityHeaders } from '@/lib/security-headers';
import {
  getApiVersion,
  isVersionSupported,
  getSunsetHeaderValue,
  CURRENT_API_VERSION,
  SUPPORTED_API_VERSIONS,
} from '@/lib/api-version';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// P1 — Rate limiting. Edge-safe : store mémoire/Redis injecté.
import { rateLimit } from '@/lib/security/rate-limit';

// Quotas de rate limiting (P1). Les clés API ont un quota supérieur.
const RL_WINDOW_SEC = 60;
const RL_MAX_ANON = 120;    // IP / session anonyme : 120 req/min
const RL_MAX_APIKEY = 1000; // clé API validée : 1000 req/min

// Routes publiques LISTÉES ROUTE PAR ROUTE.
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/send-verification',
  // /api/auth/me est publique : un client non authentifié doit pouvoir
  // demander "est-ce que j'ai une session?" pour décider d'afficher le
  // dashboard ou la landing. La route retourne { user: null } si pas de
  // session valide — ce qui est une réponse publique, pas une fuite.
  '/api/auth/me',
  '/api/auth/session',
  '/api/auth/debug',
  '/api/health',
  '/api/health/features',
  '/api/control-plane/health',
  '/api/register',
  '/api/webhook/stripe',
  '/api/webhook/sebpay',
  '/api/webhooks/stripe',
  '/api/webhooks/sebpay',
  '/api/webhooks/chariow',
  '/api/events/sse',
  '/api/docs',
  '/api/docs/openapi.json',
  '/api/public/',
  '/api/version',
];

// Routes ADMIN : exigent TOUJOURS le rôle 'admin' (custom claim Firebase).
const ADMIN_ROUTES = [
  '/api/admin/',
  '/api/terminal/execute',
  '/api/services/',
  // NOTE: '/api/keys/' is NOT here — it's a user route (manage own API keys), not admin.
  '/api/metrics/',
  '/api/monitoring/',
  '/api/system/',
  '/api/observability/',
  // Evolution Engine — privileged: only admins can trigger/rollback/approve
  '/api/evolution/',
];

const IS_PROD = process.env.NODE_ENV === 'production';

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(route.endsWith('/') ? route : route + '/');
}

/**
 * Vérifie la présence d'un session cookie SANS importer firebase-admin
 * (interdit en Edge Runtime — voir build Next.js). La vérification
 * cryptographique est reportée sur la couche 2 (withAuth) qui s'exécute en
 * Node.js Runtime. Ici on ne fait qu'une vérification de présence pour
 * court-circuiter les requêtes sans aucune auth.
 */
async function verifyFirebaseSession(cookieValue: string | undefined): Promise<{ uid: string; role: string } | null> {
  if (!cookieValue) return null;
  try {
    // Edge-safe : on décode juste le JWT (pas de vérif crypto — la couche 2 le fait)
    const parts = cookieValue.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const role = (payload.role as string) || 'user';
    return { uid: payload.uid || payload.sub || '', role };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Security headers + CSP (nonce per-request) ---
  const nonce = generateCspNonce();
  const csp = buildCspHeader(nonce);
  const securityHeaders = getSecurityHeaders(IS_PROD);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Appliquer tous les en-têtes de sécurité
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('x-nonce', nonce);

  // 1. Fichiers statiques
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') ||
      pathname === '/icon.svg' || pathname === '/sw.js' || pathname === '/manifest.json') {
    return response;
  }

  // 2. Routes non-API : protection des pages
  if (!pathname.startsWith('/api/')) {
    // Pages publiques (auth) : accessibles sans session
    // + vues SPA (toutes servies par / via zustand currentView)
    const PUBLIC_PAGES = [
      '/', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email',
      '/dashboard', '/agents', '/agent-chat', '/automation', '/guardrails',
      '/coordination', '/settings', '/approvals', '/analytics', '/billing',
      '/developers', '/voice', '/images', '/integrations', '/notifications',
      '/scheduler', '/prompts',
    ];

    if (PUBLIC_PAGES.includes(pathname)) {
      return response;
    }

    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/';
    return NextResponse.redirect(dashboardUrl, { headers: response.headers });
  }

  // 2.a — Versioning API
  const apiVersion = getApiVersion(request);

  if (!isVersionSupported(apiVersion)) {
    const errorRes = NextResponse.json(
      {
        error: `Unsupported API version: ${apiVersion}`,
        supportedVersions: SUPPORTED_API_VERSIONS,
        currentVersion: CURRENT_API_VERSION,
      },
      { status: 400, headers: response.headers }
    );
    errorRes.headers.set('X-API-Version', CURRENT_API_VERSION);
    return errorRes;
  }

  requestHeaders.set('x-api-version', apiVersion);
  response.headers.set('X-API-Version', apiVersion);

  const sunsetHeader = getSunsetHeaderValue(apiVersion);
  if (sunsetHeader) {
    response.headers.set('Sunset', sunsetHeader);
  }

  const normalizedPathname = pathname.replace(/^\/api\/v\d+(?:\.\d+)?/, '/api');

  // 2.bis — P1 Rate limiting
  // FIX « Failed to fetch keys » : le quota anonyme par IP ne s'applique QU'aux
  // requêtes NON authentifiées. Une session valide (cookie gen3ia_session — JWT
  // standalone ou Firebase) n'est PAS limitée par IP, sinon le dashboard SPA, qui
  // émet plusieurs appels /api/* au montage (hydrate, compteurs, navigation),
  // dépassait RL_MAX_ANON et faisait échouer GET /api/keys avec 429 → le client
  // montrait « Failed to fetch keys ».
  const sessionCookieForRl = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessionForRl = await verifyFirebaseSession(sessionCookieForRl);
  const apiKeyRl = request.headers.get('x-api-key');
  const rlIsAnonymous = !sessionForRl && !apiKeyRl;

  if (rlIsAnonymous) {
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';
    const rlResult = await rateLimit({
      key: `ip:${clientIp}`,
      windowSec: RL_WINDOW_SEC,
      max: RL_MAX_ANON,
      bypass: false,
    });
    response.headers.set('X-RateLimit-Limit', String(RL_MAX_ANON));
    if (!rlResult.ok) {
      const retryAfterSec = rlResult.retryAfterSec;
      const rlRes = NextResponse.json(
        { error: 'Too Many Requests', retryAfterSec },
        { status: 429, headers: response.headers },
      );
      rlRes.headers.set('Retry-After', String(retryAfterSec));
      rlRes.headers.set('X-RateLimit-Remaining', '0');
      return rlRes;
    }
  } else {
    // Authentifié (session) ou clé API : budget élevé / non limité par IP.
    response.headers.set('X-RateLimit-Limit', String(apiKeyRl ? RL_MAX_APIKEY : RL_MAX_ANON));
  }

  // 3. Routes publiques (liste stricte)
  if (PUBLIC_PATHS.some((p) => matchesRoute(pathname, p) || matchesRoute(normalizedPathname, p))) {
    return response;
  }

  // 4. DENY-BY-DEFAULT : une auth est requise.
  const session = await verifyFirebaseSession(sessionCookieForRl);

  const apiKey = request.headers.get('x-api-key');
  const hasBearer = request.headers.get('authorization')?.startsWith('Bearer ');
  const cronSecret = process.env.CRON_SECRET;
  const cronHeader = request.headers.get('x-cron-secret');
  const hasValidCronSecret = !!(cronSecret && cronHeader && cronHeader === cronSecret);

  if (!session && !apiKey && !hasBearer && !hasValidCronSecret) {
    const unauthRes = NextResponse.json(
      { error: 'Authentification requise' },
      { status: 401, headers: response.headers }
    );
    unauthRes.headers.set('X-API-Version', apiVersion);
    return unauthRes;
  }

  // 5. Routes ADMIN : le rôle vient UNIQUEMENT du custom claim Firebase.
  if (ADMIN_ROUTES.some((p) => pathname.startsWith(p) || normalizedPathname.startsWith(p))) {
    if (!session || session.role !== 'admin') {
      const forbiddenRes = NextResponse.json(
        { error: 'Accès réservé aux administrateurs' },
        { status: 403, headers: response.headers }
      );
      forbiddenRes.headers.set('X-API-Version', apiVersion);
      return forbiddenRes;
    }
  }

  // 6. Sinon : on laisse passer pour la couche 2 (withAuth validera les api keys/bearer).
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.json).*)'],
};
