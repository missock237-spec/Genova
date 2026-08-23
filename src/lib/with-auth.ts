// ============================================================
// Gen3ia — withAuth() : wrapper unique de sécurité pour les routes API
//
// 2ème couche de défense (le middleware est la 1ère).
// - Authentification : JWT / API Key / Bearer
// - RBAC : rôles requis (admin, user, ...)
// - Rate limiting : Redis (distribué) + fallback mémoire
//   -> Les options { limit, windowMs } de la route SONT transmises
//      au rate limiter (politique personnalisée par route).
// - Quota LLM : vérifie le plan + le quota utilisateur
// - Tenant (multi-tenant) : résolution optionnelle de l'organisation
//   courante via { resolveOrg: true }
//
// Usage :
//   export const POST = withAuth(async (req, ctx, auth) => {
//     const params = await ctx.params;       // Next 14 (objet) et 15 (Promise)
//     // ... votre handler
//   }, { roles: ['user'], rateLimit: { limit: 20, windowMs: 60000 } });
//
//   export const GET = withAuth(handler, { requireAuth: false });
//
//   // Route tenant-scopée : résout l'org de l'utilisateur et l'injecte
//   // dans auth.org (si membre).
//   export const GET = withAuth(async (req, ctx, auth) => {
//     const orgId = auth.org?.org.id;
//   }, { resolveOrg: true });
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, type SecurityContext } from '@/lib/security';
import { rateLimit, type RateLimitOptions } from '@/lib/rate-limiter';
import { checkTokenLimit, getPlanLimits } from '@/lib/usage-limits';
import { getOrgContext } from '@/lib/multi-tenant';
import { db } from '@/lib/db';

/**
 * Type des params de route Next.js.
 *
 * - Next 14 : le handler reçoit `params` sous forme d'objet résolu `{ id: string }`.
 * - Next 15 : `params` devient une `Promise`.
 *
 * On type `params` comme une promesse résolvable et le wrapper normalise les
 * deux formes afin que les routes migrées lisent `await ctx.params` sans casser
 * la compilation sur l'une ou l'autre version. Rendue générique pour rester
 * assignable à l'interface de route attendue par Next (`Promise<{id: string}>`).
 */
export type RouteParams<T extends Record<string, unknown> = Record<string, string | string[]>>
  = Promise<T>;

/**
 * Contexte de route normalisé injecté au handler.
 * `params` reste OPTIONNEL pour rester rétro-compatible avec les routes
 * déclarant `ctx: { params?: RouteParams }`. Après normalisation il est
 * toujours fourni (au pire un objet vide) par le wrapper.
 */
export interface RouteContext<P extends Record<string, unknown> = Record<string, string | string[]>> {
  params?: RouteParams<P>;
}

export interface AuthContext extends SecurityContext {}

export interface WithAuthOptions {
  requireAuth?: boolean;
  roles?: string[];
  rateLimit?: {
    limit: number;
    windowMs: number;
  };
  quota?: boolean;
  scopes?: string[];
  /**
   * Résout l'organisation courante de l'utilisateur et l'injecte dans
   * `auth.org` (via `getOrgContext`). Lecture Firestore additionnelle —
   * à n'activer QUE sur les routes tenant-scopées.
   */
  resolveOrg?: boolean;
}

/** Contexte brut transmis par Next (objet Next 14) ou Promise (Next 15). */
type NextRawContext = {
  params?: Record<string, unknown> | Promise<Record<string, unknown>>;
  query?: Record<string, string | string[]>;
};

type HandlerWithAuth<P extends Record<string, unknown> = Record<string, string | string[]>> =
  (request: NextRequest, ctx: RouteContext<P>, auth: SecurityContext)
    => Promise<NextResponse | Response>;

/**
 * Wrapper de sécurité réutilisable pour toutes les routes API.
 * Combine auth + RBAC + rate limit + quota (+ résolution tenant optionnelle).
 */
export function withAuth<P extends Record<string, unknown> = Record<string, string | string[]>>(
  handler: HandlerWithAuth<P>,
  options: WithAuthOptions = {}
) {
  const {
    requireAuth = true,
    roles,
    rateLimit: rlOptions,
    quota = false,
    resolveOrg = false,
  } = options;

  // Signature souple (type local, non-générique public) acceptant les deux
  // formats de Next, ce qui évite toute erreur d'assignabilité TS17805/TS2345
  // sur les exports `GET` / `POST` / `PUT` / `DELETE`.
  // Use a loose context type to stay compatible across Next.js versions
  // (Next 14 passes an object, Next 15 passes a Promise). The actual
  // normalization happens inside the handler body below.
  return async function wrappedHandler(
    request: NextRequest,
    rawContext: any
  ): Promise<NextResponse | Response> {
    // 1. Authentification + RBAC
    const { auth, error } = await applySecurity(request, { requireAuth, roles });
    if (error) return error;

    // 2. Rate limiting (Redis distribué, ou fallback mémoire).
    //    Les options { limit, windowMs } déclarées par la route sont transmises
    //    au rate limiter : la politique de token bucket est personnalisée.
    if (rlOptions) {
      const rlOpts: RateLimitOptions = {
        limit: rlOptions.limit,
        windowMs: rlOptions.windowMs,
      };
      const { allowed, remaining, resetIn } = await rateLimit(
        request,
        auth?.userId,
        undefined,
        undefined,
        rlOpts,
      );
      if (!allowed) {
        return NextResponse.json(
          { error: 'Trop de requêtes', remaining, resetIn },
          { status: 429 }
        );
      }
    }

    // 3. Quota LLM / crédits (sur les routes coûteuses)
    if (quota && auth?.userId) {
      const user = await db.user.findUnique({
        where: { id: auth.userId },
        select: ['plan', 'credits'],
      });
      if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 401 });

      if ((user.credits as number) <= 0 && user.plan !== 'free') {
        return NextResponse.json(
          { error: 'Quota de crédits épuisé. Rechargez vos crédits.' },
          { status: 402 }
        );
      }

      const tokenLimit = await checkTokenLimit(auth.userId, (user.plan as string) || 'free');
      if (!tokenLimit.allowed) {
        const planLimits = getPlanLimits((user.plan as string) || 'free');
        return NextResponse.json(
          { error: `Quota LLM journalier atteint (${tokenLimit.current}/${tokenLimit.limit}). Dépasse le seuil de ${planLimits.maxTokensPerDay} tokens.` },
          { status: 429 }
        );
      }
    }

    // 4. Exécuter le handler avec le contexte d'auth
    if (!auth) return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });

    // 5. Résolution tenant (opt-in) : injecte `auth.org` si l'utilisateur
    //    est membre actif d'une organisation. Ne lève jamais (retourne
    //    simplement sans `org` si l'utilisateur n'a pas d'organisation).
    if (resolveOrg && auth.userId) {
      const orgCtx = await getOrgContext(auth.userId);
      if (orgCtx.member && orgCtx.org) {
        auth.org = orgCtx.org;
      }
    }

    // Normalise `params` (objet Next 14 OU Promise Next 15) en une RouteParams.
    // Toujours fourni (au pire vide) pour préserver le contrat `await ctx.params`.
// @ts-ignore — type narrowing pending, see refactor ticket
    const params: RouteParams<P> = Promise.resolve({
      ...(rawContext?.params
        ? (rawContext.params instanceof Promise ? await rawContext.params : rawContext.params)
        : {}),
    });

    return handler(request, { params }, auth);
  };
}

export type { SecurityContext };
export { db } from '@/lib/db';

// Alias pour réduire le boilerplate sur les routes simples
export const requireAuth = <P extends Record<string, unknown> = Record<string, string | string[]>>(
  handler: HandlerWithAuth<P>,
  opts: Omit<WithAuthOptions, 'requireAuth'> = {}
) => withAuth(handler, { ...opts, requireAuth: true });

export const optionalAuth = <P extends Record<string, unknown> = Record<string, string | string[]>>(
  handler: HandlerWithAuth<P>,
  opts: Omit<WithAuthOptions, 'requireAuth'> = {}
) => withAuth(handler, { ...opts, requireAuth: false });
