// ============================================================
// Gen3ia — Security Middleware pour les routes API
// Authentification Firebase (session cookie + ID token) + API keys + RBAC
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getServerSession } from '@/lib/firebase/auth';
import { db } from '@/lib/db';
import { SESSION_COOKIE_NAME } from '@/lib/firebase/config';
import { getAdminAuth } from '@/lib/firebase/admin';
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
   * Organisation résolue du tenant courant (multi-tenant).
   * OPTIONNEL : uniquement peuplé par `withAuth(..., { resolveOrg: true })`.
   * `applySecurity` ne le renseigne pas (aucune lecture Firestore implicite).
   */
  org?: ResolvedOrg;
}

interface SecurityOptions {
  requireAuth?: boolean;
  /** Prisma-compat alias for `roles`. */
  roles?: string[];
  /** Prisma-compat alias for `roles` (accepts string or string[]). */
  requireRole?: string | string[];
  /** Legacy no-op field (rate limiting is enforced by middleware). */
  rateLimit?: { interval?: string | number; limit?: number } | Record<string, unknown>;
}

/**
 * Middleware de sécurité pour les routes API.
 * Supporte (par ordre de priorité) :
 *  1. Session cookie Firebase (gen3ia_session) — navigateur
 *  2. Bearer token Firebase ID token — clients API / mobile
 *  3. X-API-Key — clés API persistantes
 *  + RBAC via custom claims Firebase (role)
 */
export async function applySecurity(
  request: NextRequest,
  options: SecurityOptions = {},
): Promise<{ auth?: SecurityContext; error?: NextResponse }> {
  // 1. Session cookie Firebase (principalement navigateur)
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionCookie) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
      const user = await getAdminAuth().getUser(decoded.uid);
      const role = (user.customClaims?.role as string) || 'user';
      const auth: SecurityContext = {
        userId: decoded.uid,
        uid: decoded.uid,
        id: decoded.uid,
        role,
        email: user.email || undefined,
      };
      return validateRole(auth, options);
    } catch {
      // Cookie invalide ou expiré, on continue
    }
  }

  // 2. Bearer token Firebase ID token
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyAccessToken(token);
    if (payload) {
      const auth: SecurityContext = {
        userId: payload.sub,
        uid: payload.uid || payload.sub,
        id: payload.sub,
        role: payload.role,
        email: payload.email,
      };
      return validateRole(auth, options);
    }
  }

  // 3. API Key (clés persistantes stockées dans Firestore)
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
 * Ajoute des en-têtes de sécurité à la réponse
 */
export function secureResponse(response: NextResponse, _request: NextRequest): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
}

/**
 * Authentifie via API Key (Firestore collection `api_keys`)
 */
async function authenticateApiKey(apiKey: string): Promise<SecurityContext | null> {
  try {
    const key = (await db.apiKey.findFirst({
      where: [{ field: 'keyValue', op: '==', value: apiKey }, { field: 'isActive', op: '==', value: true }],
    })) as Record<string, unknown> | null;

    if (!key) return null;

    // Récupère l'utilisateur propriétaire pour obtenir son rôle
    const userId = key.userId as string;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    // Met à jour lastUsed
    await db.apiKey
      .update({ where: { id: key.id as string }, data: { lastUsed: new Date() } })
      .catch(() => {});

    return {
      userId,
      uid: userId,
      role: ((user as Record<string, unknown>).role as string) || 'user',
      email: (user as Record<string, unknown>).email as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Vérifie les permissions RBAC
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

/** Modèle Firestore possédant un champ `userId` (ownership check). */
type OwnedModel = {
  findUnique(args: { where: { id: string }; select?: string[] }): Promise<Record<string, unknown> | null>;
};

/**
 * Vérifie qu'une ressource appartient à l'utilisateur authentifié.
 */
export async function verifyOwnership(
  resourceType: string,
  resourceId: string,
  userId: string,
): Promise<boolean> {
  try {
    const model = (db as unknown as Record<string, OwnedModel>)[resourceType];
    if (!model) return false;
    const record = await model.findUnique({
      where: { id: resourceId },
      select: ['userId'],
    });
    return record?.userId === userId;
  } catch {
    return false;
  }
}

/**
 * Origines CORS autorisées pour les endpoints SSE/streaming.
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
export { getServerSession };
