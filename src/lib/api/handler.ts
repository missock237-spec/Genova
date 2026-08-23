// ============================================================
// Gen3ia — createApiHandler() : handler API moderne et unifié
// ============================================================
//  Couche 2 de défense (le middleware Edge est la 1ère) :
//    - Authentification + RBAC via applySecurity() (vérification
//      cryptographique du cookie de session / Bearer / API key)
//    - Rate limiting distribué (Redis + fallback mémoire)
//    - Validation Zod optionnelle (body JSON + query string)
//    - Erreurs centralisées : ApiError(status, code, message)
//    - Enveloppe de réponse moderne :
//        succès : { success: true,  data, meta: { requestId } }
//        erreur : { success: false, error: { code, message, details? } }
//
//  Mode legacy (envelope: false) : les données retournées par le
//  handler sont renvoyées TELLES QUELLES — indispensable pour
//  migrer les routes existantes sans casser le frontend, qui
//  dépend des formes de réponse actuelles.
//
//  Ce module est STRICTEMENT ADDITIF : il ne remplace ni withAuth
//  (src/lib/with-auth.ts) ni withRateLimit (src/lib/api-rate-limit.ts),
//  qui restent pleinement supportés.
//
//  Usage (nouvelle route) :
//    export const POST = createApiHandler(
//      async ({ body, auth }) => {
//        const agent = await db.agent.create({ data: { ...body, userId: auth!.userId } });
//        return agent; // → { success: true, data: agent, meta: { requestId } }
//      },
//      {
//        roles: ['user'],
//        rateLimit: { limit: 20, windowMs: 60_000 },
//        bodySchema: z.object({ name: z.string().min(1) }),
//      },
//    );
//
//  Usage (route legacy migrée, forme de réponse inchangée) :
//    export const GET = createApiHandler(
//      async ({ auth }) => ({ notifications: [], unreadCount: 0 }),
//      { envelope: false, rateLimit: { limit: 60, windowMs: 60_000 } },
//    );
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import type { z } from 'zod';
import { applySecurity, type SecurityContext } from '@/lib/security';
import { rateLimit, type RateLimitOptions } from '@/lib/rate-limiter';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-handler');

// ------------------------------------------------------------
// ApiError — erreur métier typée (status + code machine + message)
// ------------------------------------------------------------

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Requête invalide', details?: unknown): ApiError {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentification requise'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'Accès refusé'): ApiError {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Ressource introuvable'): ApiError {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message = 'Conflit de données'): ApiError {
    return new ApiError(409, 'CONFLICT', message);
  }
  static payloadTooLarge(message = 'Charge utile trop volumineuse'): ApiError {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', message);
  }
  static unprocessable(message = 'Entité non traitable', details?: unknown): ApiError {
    return new ApiError(422, 'UNPROCESSABLE_ENTITY', message, details);
  }
  static tooMany(message = 'Trop de requêtes. Réessayez plus tard.'): ApiError {
    return new ApiError(429, 'RATE_LIMITED', message);
  }
  static internal(message = 'Erreur interne du serveur'): ApiError {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
}

// ------------------------------------------------------------
// Types publics
// ------------------------------------------------------------

export interface ApiContext<
  P extends Record<string, unknown> = Record<string, string>,
  TBody = unknown,
  TQuery = Record<string, unknown>,
> {
  /** Requête brute Next.js. */
  request: NextRequest;
  /** Contexte d'authentification vérifié cryptographiquement (garanti non-null si requireAuth: true). */
  auth: SecurityContext | null;
  /** Paramètres dynamiques de route (Next 14 objet / Next 15 Promise — normalisés, toujours fournis). */
  params: P;
  /** Corps JSON validé par bodySchema (unknown si pas de schéma). */
  body: TBody;
  /** Query string validée par querySchema (ou paires brutes { [k]: string }). */
  query: TQuery;
  /** Identifiant unique de requête (corrélation logs ↔ réponses). */
  requestId: string;
}

export interface ApiHandlerOptions {
  /** Défaut : true (authentification requise). */
  requireAuth?: boolean;
  /** Rôles RBAC requis (ex: ['admin']). */
  roles?: string[];
  /** Politique de rate limiting distribué (Redis + fallback mémoire). */
  rateLimit?: { limit: number; windowMs: number };
  /** Schéma Zod de validation du corps JSON (POST/PUT/PATCH). */
  bodySchema?: z.ZodTypeAny;
  /** Schéma Zod de validation de la query string. */
  querySchema?: z.ZodTypeAny;
  /**
   * Défaut : true — enveloppe moderne { success, data, meta }.
   * false = passthrough legacy : les données du handler sont renvoyées
   * telles quelles et les erreurs gardent la forme { error, code }.
   */
  envelope?: boolean;
}

type ApiHandlerFn<
  P extends Record<string, unknown>,
  TBody,
  TQuery,
> = (ctx: ApiContext<P, TBody, TQuery>) => Promise<unknown>;

// ------------------------------------------------------------
// Helpers internes
// ------------------------------------------------------------

function formatZodIssues(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

function errorResponse(err: unknown, envelope: boolean, requestId: string): NextResponse {
  if (err instanceof ApiError) {
    const payload = envelope
      ? {
          success: false as const,
          error: {
            code: err.code,
            message: err.message,
            ...(err.details !== undefined ? { details: err.details } : {}),
          },
          meta: { requestId },
        }
      : { error: err.message, code: err.code };
    return NextResponse.json(payload, { status: err.status });
  }

  // Erreur inattendue : log serveur détaillé, message générique côté client
  // (jamais de stack ni d'interne exposés en production).
  log.error('Unhandled API error', {
    requestId,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  const payload = envelope
    ? {
        success: false as const,
        error: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' },
        meta: { requestId },
      }
    : { error: 'Erreur interne du serveur' };
  return NextResponse.json(payload, { status: 500 });
}

// ------------------------------------------------------------
// createApiHandler
// ------------------------------------------------------------

export function createApiHandler<
  P extends Record<string, unknown> = Record<string, string>,
  TBody = unknown,
  TQuery = Record<string, unknown>,
>(
  handler: ApiHandlerFn<P, TBody, TQuery>,
  options: ApiHandlerOptions = {},
) {
  const {
    requireAuth = true,
    roles,
    rateLimit: rlOptions,
    bodySchema,
    querySchema,
    envelope = true,
  } = options;

  // Signature souple (rawContext: any) compatible Next 14 (params objet)
  // et Next 15 (params Promise) — même stratégie éprouvée que withAuth().
  return async function routeHandler(
    request: NextRequest,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawContext: any,
  ): Promise<NextResponse> {
    const requestId = crypto.randomUUID();
    try {
      // 1. Authentification + RBAC (vérification cryptographique)
      const { auth, error } = await applySecurity(request, { requireAuth, roles });
      if (error) return error;
      if (requireAuth && !auth) {
        return errorResponse(ApiError.unauthorized(), envelope, requestId);
      }

      // 2. Rate limiting (Redis distribué + fallback mémoire)
      if (rlOptions) {
        const rlOpts: RateLimitOptions = {
          limit: rlOptions.limit,
          windowMs: rlOptions.windowMs,
        };
        const { allowed, resetIn } = await rateLimit(
          request,
          auth?.userId,
          undefined,
          undefined,
          rlOpts,
        );
        if (!allowed) {
          const res = errorResponse(ApiError.tooMany(), envelope, requestId);
          res.headers.set('Retry-After', String(Math.max(1, Math.ceil(resetIn / 1000))));
          res.headers.set('X-RateLimit-Limit', String(rlOptions.limit));
          res.headers.set('X-RateLimit-Remaining', '0');
          return res;
        }
      }

      // 3. Paramètres de route (normalisés, toujours fournis)
      const params = (rawContext?.params
        ? rawContext.params instanceof Promise
          ? await rawContext.params
          : rawContext.params
        : {}) as P;

      // 4. Corps JSON (validation Zod optionnelle)
      let body: TBody = undefined as TBody;
      if (bodySchema) {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return errorResponse(ApiError.badRequest('Corps JSON invalide ou absent'), envelope, requestId);
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return errorResponse(
            ApiError.badRequest('Validation du corps échouée', formatZodIssues(parsed.error)),
            envelope,
            requestId,
          );
        }
        body = parsed.data as TBody;
      }

      // 5. Query string (validation Zod optionnelle)
      let query: TQuery;
      const rawQuery = Object.fromEntries(request.nextUrl.searchParams.entries());
      if (querySchema) {
        const parsedQuery = querySchema.safeParse(rawQuery);
        if (!parsedQuery.success) {
          return errorResponse(
            ApiError.badRequest('Paramètres de requête invalides', formatZodIssues(parsedQuery.error)),
            envelope,
            requestId,
          );
        }
        query = parsedQuery.data as TQuery;
      } else {
        query = rawQuery as unknown as TQuery;
      }

      // 6. Handler métier
      const result = await handler({ request, auth: auth ?? null, params, body, query, requestId });

      // Réponse déjà construite par le handler → passthrough intégral.
      if (result instanceof Response) return result as NextResponse;

      if (envelope) {
        return NextResponse.json({ success: true, data: result ?? null, meta: { requestId } });
      }
      return NextResponse.json(result ?? {});
    } catch (err) {
      return errorResponse(err, envelope, requestId);
    }
  };
}

/** Alias de commodité : route publique (requireAuth: false). */
export function createPublicHandler<
  P extends Record<string, unknown> = Record<string, string>,
  TBody = unknown,
  TQuery = Record<string, unknown>,
>(
  handler: ApiHandlerFn<P, TBody, TQuery>,
  options: Omit<ApiHandlerOptions, 'requireAuth'> = {},
) {
  return createApiHandler(handler, { ...options, requireAuth: false });
}
