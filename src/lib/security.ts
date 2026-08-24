// ============================================================
// Gen3ia — Security Middleware pour les routes API
// Authentification (Firebase OU Standalone) + API keys + RBAC
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/firebase/config';
import { db } from '@/lib/db';
import { isFirebaseConfigured, verifyJWT } from '@/lib/standalone-auth';
import { hashApiKey } from '@/lib/api-key';
import type { ResolvedOrg } from '@/lib/multi-tenant';

export interface SecurityContext {
  userId: string;
  uid: string;
  role: string;
  email?: string;
  /** Prisma/legacy-compat alias for `userId`. */
  id?: string;
  /** Legacy alias — display name (not populated, kept for backward compat). */
  name?: string;
  /**
   * Organisation resolue du tenant courant (multi-tenant).
   * OPTIONNEL : uniquement peuple par `withAuth(..., { resolveOrg: true })`.
   */
  org?: ResolvedOrg;
}

interface SecurityOptions {
  requireAuth?: boolean;
  roles?: string[];
  requireRole?: string | string[];
  /** Legacy no-op field (rate limiting is enforced by middleware). */
  rateLimit?: { interval?: string | number; limit?: number } | Record<string, unknown>;
}

/** @returns true si la clé (avec expiresAt) est encore valide. */
function isKeyActive(key: Record<string, unknown>): boolean {
  if (key.isActive === false || key.isActive === 'false') return false;
  const expiresAt = key.expiresAt;
  if (expiresAt == null) return true; // sans expiration → toujours valide
  const t = expiresAt instanceof Date
    ? expiresAt.getTime()
    : new Date(expiresAt as string).getTime();
  return Number.isFinite(t) && t > Date.now();
}

/**
 * Middleware de securite pour les routes API.
 * Supporte (par ordre de priorite) :
 *  1. Session cookie (Firebase OU Standalone JWT)
 *  2. Bearer token (Firebase ID token OU Standalone JWT)
 *  3. X-API-Key (cles persistantes)
 *  + RBAC via role
 */
export async function applySecurity(
  request: NextRequest,
  options: SecurityOptions = {},
): Promise<{ auth?: SecurityContext; error?: NextResponse }> {
  // 1. Session cookie (Firebase OU Standalone)
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionCookie) {
    // --- Tentative Firebase (si configure) ---
    // Même logique de retry que getServerSession() et verifyIdToken() :
    //   1. verifySessionCookie(cookie, true)  — vérif signature + révocation
    //   2. verifySessionCookie(cookie, false) — sans révocation (cold start)
    //   3. Pause 1s + retry — cold start Vercel (JWKS download)
    if (isFirebaseConfigured()) {
      let fbAuth: SecurityContext | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const { getAdminAuth } = await import('@/lib/firebase/admin');
          const adminAuth = getAdminAuth();
          const checkRevoked = attempt === 1;
          const decoded = await adminAuth.verifySessionCookie(sessionCookie, checkRevoked);
          const user = await adminAuth.getUser(decoded.uid);
          const role = (user.customClaims?.role as string) || 'user';
          fbAuth = {
            userId: decoded.uid, uid: decoded.uid, id: decoded.uid,
            role, email: user.email || undefined,
          };
          break; // Succès — sortir de la boucle
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[applySecurity] Firebase session verify attempt ${attempt}/3 failed:`, errMsg);
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      }
      if (fbAuth) return validateRole(fbAuth, options);
      // Tous les tentatives Firebase ont échoué — on tente le standalone
    }

    // --- Tentative Standalone JWT ---
    const standaloneSession = verifyJWT(sessionCookie);
    if (standaloneSession) {
      const auth: SecurityContext = {
        userId: standaloneSession.userId,
        uid: standaloneSession.userId,
        id: standaloneSession.userId,
        role: standaloneSession.role || 'user',
        email: standaloneSession.email,
      };
      return validateRole(auth, options);
    }
  }

  // 2. Bearer token
   const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    // --- Tentative Firebase (si configure) ---
    if (isFirebaseConfigured()) {
      try {
        const { verifyAccessToken } = await import('@/lib/firebase/auth');
        const payload = await verifyAccessToken(token);
        if (payload) {
          const auth: SecurityContext = {
            userId: payload.sub, uid: payload.uid || payload.sub,
            id: payload.sub, role: payload.role, email: payload.email,
          };
          return validateRole(auth, options);
        }
      } catch {
        // Firebase verify failed, try standalone
      }
    }

    // --- Tentative Standalone JWT ---
    const standaloneSession = verifyJWT(token);
    if (standaloneSession) {
      const auth: SecurityContext = {
        userId: standaloneSession.userId, uid: standaloneSession.userId,
        id: standaloneSession.userId, role: standaloneSession.role || 'user',
        email: standaloneSession.email,
      };
      return validateRole(auth, options);
    }
  }

  // 3. API Key (cles persistantes dans Firestore)
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    const auth = await authenticateApiKey(apiKey);
    if (auth) return validateRole(auth, options);
  }

  // 4. Si auth requise, retourner 401
  if (options.requireAuth) {
    return { error: NextResponse.json({ error: 'Authentification requise' }, { status: 401 }) };
  }

  return { auth: { userId: 'anonymous', uid: 'anonymous', role: 'guest' } };
}

/**
 * Ajoute des en-tetes de securite a la reponse
 */
export function secureResponse(response: NextResponse, _request: NextRequest): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
}

/**
 * Authentifie via API Key (Firestore collection `api_keys`)
 *
 * La clé brute n'est PAS persistée : on compare l'empreinte scrypt de la
 * clé reçue (via X-API-Key) à celle stockée dans `keyHash`. Voir
 * src/lib/api-key.ts. On vérifie aussi isActive et expiresAt.
 */
async function authenticateApiKey(apiKey: string): Promise<SecurityContext | null> {
  try {
    const keyHash = hashApiKey(apiKey);
    const key = (await db.apiKey.findFirst({
      where: [{ field: 'keyHash', op: '==', value: keyHash }],
    })) as Record<string, unknown> | null;

    if (!key) return null;
    if (!isKeyActive(key)) return null;

    const userId = key.userId as string;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    await db.apiKey
      .update({ where: { id: key.id as string }, data: { lastUsed: new Date() } })
      .catch(() => {});

    return {
      userId, uid: userId,
      role: ((user as Record<string, unknown>).role as string) || 'user',
      email: (user as Record<string, unknown>).email as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Verifie les permissions RBAC
 */
function validateRole(auth: SecurityContext, options: SecurityOptions): { auth: SecurityContext; error?: NextResponse } {
  const requireRole = options.requireRole;
  const allowedRoles = options.roles ?? (requireRole ? (Array.isArray(requireRole) ? requireRole : [requireRole]) : undefined);
  if (allowedRoles && !allowedRoles.includes(auth.role)) {
    return {
      auth,
      error: NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 }),
    };
  }
  return { auth };
}

/** Modele Firestore possedant un champ `userId` (ownership check). */
type OwnedModel = {
  findUnique(args: { where: { id: string }; select?: string[] }): Promise<Record<string, unknown> | null>;
};

/**
 * Verifie qu'une ressource appartient a l'utilisateur authentifie.
 */
export async function verifyOwnership(
  resourceType: string, resourceId: string, userId: string,
): Promise<boolean> {
  try {
    const model = (db as unknown as Record<string, OwnedModel>)[resourceType];
    if (!model) return false;
    const record = await model.findUnique({
      where: { id: resourceId }, select: ['userId'],
    });
    return record?.userId === userId;
  } catch {
    return false;
  }
}

/**
 * Origines CORS autorisees pour les endpoints SSE/streaming.
 */
export function getAllowedOrigins(origin?: string): string | null {
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean);

  if (!origin) return allowedOrigins[0] || null;
  return allowedOrigins.includes(origin) ? origin : null;
}

// Re-export pour compat avec l'ancienne API
export async function getServerSession() {
  if (isFirebaseConfigured()) {
    const { getServerSession: fbSession } = await import('@/lib/firebase/auth');
    return fbSession();
  }
  const { getStandaloneServerSession } = await import('@/lib/standalone-auth');
  return getStandaloneServerSession();
}
