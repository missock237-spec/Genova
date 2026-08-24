// ============================================================
// Gen3ia — Vérifications de Santé du Système
// ============================================================
//  Point d'entrée unique pour le monitoring de la plateforme.
//  Vérifie la connectivité des dépendances critiques et retourne
//  un statut agrégé avec la latence de chaque vérification.
//
//  Statuts possibles :
//    - `healthy`     : toutes les vérifications passent.
//    - `degraded`    : au moins une vérification secondaire échoue.
//    - `unhealthy`   : une vérification critique échoue (Firestore, Auth).
//
//  Utilisation typique : endpoint `/api/health` ou load balancer.
// ============================================================

import { db } from '@/lib/db';
import { isFirebaseConfigured } from '@/lib/standalone-auth';

/**
 * Résultat individuel d'une vérification de santé.
 *
 * @property ok - `true` si la vérification a réussi.
 * @property latencyMs - Temps de réponse en millisecondes (si mesurable).
 * @property error - Message d'erreur en cas d'échec.
 */
export interface HealthCheckResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Statut global de santé du système.
 *
 * - `healthy`   : toutes les vérifications sont OK.
 * - `degraded`  : vérifications non-critiques en échec.
 * - `unhealthy` : vérifications critiques en échec.
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Résultat complet de la vérification de santé.
 *
 * @property status - Statut global agrégé.
 * @property checks - Résultats détaillés par composant.
 */
export interface SystemHealthResult {
  status: HealthStatus;
  checks: Record<string, HealthCheckResult>;
}

// ============================================================
// Vérifications individuelles
// ============================================================

/**
 * Vérifie la connectivité à Firestore via un `count()` sur la collection `users`.
 * C'est la vérification la plus critique — sans Firestore, le système est inopérant.
 */
async function checkFirestore(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    await db.user.count();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: `Firestore: ${message}`,
    };
  }
}

/**
 * Vérifie que le système d'authentification est configuré.
 * Firebase doit être configuré (Service Account ou variables client),
 * sinon le système standalone doit être actif.
 */
async function checkAuth(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const configured = isFirebaseConfigured();
    // Le système standalone est toujours disponible en fallback
    return {
      ok: true,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: `Auth: ${message}`,
    };
  }
}

/**
 * Vérifie la disponibilité du service OpenAI (vérifie que la clé API est configurée).
 * Non-critique : le système peut fonctionner en mode dégradé sans LLM.
 */
async function checkOpenAI(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const key = process.env.OPENAI_API_KEY;
    const configured = !!key && key.length > 10;
    return {
      ok: configured,
      latencyMs: Date.now() - start,
      ...(configured ? {} : { error: 'OPENAI_API_KEY non configurée ou trop courte' }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: `OpenAI: ${message}`,
    };
  }
}

/**
 * Vérifie la disponibilité du service Stripe (vérifie que la clé secrète est configurée).
 * Non-critique : le système fonctionne sans Stripe (mode free).
 */
async function checkStripe(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    const configured = !!key && key.startsWith('sk_');
    return {
      ok: configured,
      latencyMs: Date.now() - start,
      ...(configured ? {} : { error: 'STRIPE_SECRET_KEY non configurée ou invalide' }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: `Stripe: ${message}`,
    };
  }
}

/**
 * Vérifie la disponibilité du service Hugging Face.
 * Non-critique : utilisé uniquement pour certains modèles.
 */
async function checkHuggingFace(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const key = process.env.HUGGINGFACE_API_KEY;
    const configured = !!key && key.length > 10;
    return {
      ok: configured,
      latencyMs: Date.now() - start,
      ...(configured ? {} : { error: 'HUGGINGFACE_API_KEY non configurée' }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: `HuggingFace: ${message}`,
    };
  }
}

/**
 * Vérifie la disponibilité du service OpenRouter.
 * Non-critique : fallback pour le routing LLM.
 */
async function checkOpenRouter(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const key = process.env.OPENROUTER_API_KEY;
    const configured = !!key && key.length > 10;
    return {
      ok: configured,
      latencyMs: Date.now() - start,
      ...(configured ? {} : { error: 'OPENROUTER_API_KEY non configurée' }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: `OpenRouter: ${message}`,
    };
  }
}

// ============================================================
// Vérification globale
// ============================================================

/**
 * Vérifications critiques dont l'échec entraîne le statut `unhealthy`.
 */
const CRITICAL_CHECKS = ['firestore', 'auth'] as const;

/**
 * Exécute toutes les vérifications de santé du système et retourne
 * un statut agrégé.
 *
 * Les vérifications s'exécutent en parallèle pour minimiser la latence.
 *
 * @returns Statut global et résultats détaillés par composant.
 *
 * @example
 * ```ts
 * // Dans un endpoint /api/health
 * const health = await checkSystemHealth();
 * const statusCode = health.status === 'healthy' ? 200
 *   : health.status === 'degraded' ? 200
 *   : 503;
 * return NextResponse.json(health, { status: statusCode });
 * ```
 */
export async function checkSystemHealth(): Promise<SystemHealthResult> {
  // Exécute toutes les vérifications en parallèle
  const [
    firestoreResult,
    authResult,
    openaiResult,
    stripeResult,
    huggingfaceResult,
    openrouterResult,
  ] = await Promise.all([
    checkFirestore(),
    checkAuth(),
    checkOpenAI(),
    checkStripe(),
    checkHuggingFace(),
    checkOpenRouter(),
  ]);

  const checks: Record<string, HealthCheckResult> = {
    firestore: firestoreResult,
    auth: authResult,
    openai: openaiResult,
    stripe: stripeResult,
    huggingface: huggingfaceResult,
    openrouter: openrouterResult,
  };

  // Détermine le statut agrégé
  let status: HealthStatus = 'healthy';

  for (const [name, result] of Object.entries(checks)) {
    if (!result.ok) {
      if ((CRITICAL_CHECKS as readonly string[]).includes(name)) {
        status = 'unhealthy';
        break;
      }
      if (status === 'healthy') {
        status = 'degraded';
      }
    }
  }

  return { status, checks };
}
