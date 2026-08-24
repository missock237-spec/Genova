// ============================================================
// Gen3ia — Gestion des Quotas par Plan
// ============================================================
//  Système de limitation des ressources par utilisateur/organisation.
//  Chaque plan (free, starter, pro, enterprise) définit des limites
//  pour chaque type de ressource. Les compteurs d'utilisation sont
//  stockés dans Firestore (collection `usage_counters`) avec un
//  mécanisme de TTL pour le nettoyage automatique.
//
//  Convention d'identifiant du compteur :
//    `{userId}_{quotaType}_{dateKey}`
//  où `dateKey` est `YYYY-MM-DD` pour les quotas journaliers,
//  `YYYY-MM-DD-HH` pour horaires, ou `all` pour les quota globaux.
//
//  Valeur sentinelle `-1` = illimité (plan enterprise).
// ============================================================

import { db } from '@/lib/db';

/**
 * Types de quota gérés par le système.
 * Chaque type correspond à une métrique de consommation.
 *
 * - `agents` : nombre total d'agents créés.
 * - `tasks_per_day` / `tasks_per_hour` : débit d'exécution de tâches.
 * - `storage_mb` : volume de stockage (fichiers uploadés).
 * - `api_calls_per_min` : fréquence d'appels API.
 * - `credits_monthly` : crédits de facturation mensuels.
 * - `concurrent_executions` : exécutions parallèles simultanées.
 */
export type QuotaType =
  | 'agents'
  | 'tasks_per_day'
  | 'tasks_per_hour'
  | 'storage_mb'
  | 'api_calls_per_min'
  | 'credits_monthly'
  | 'concurrent_executions';

/**
 * Définition d'une limite de quota.
 * La valeur `limit` à `-1` signifie « illimité ».
 *
 * @property type - Type de quota.
 * @property limit - Plafond autorisé (-1 = illimité).
 * @property used - Consommation actuelle (mise à jour par `incrementUsage`).
 */
export interface QuotaLimit {
  type: QuotaType;
  limit: number;
  used: number;
}

// ============================================================
// Définition des plans
// ============================================================

/**
 * Quotas par défaut pour chaque plan.
 * La valeur `-1` représente l'illimité (sentinelle conventionnelle).
 *
 * Plan `free`    : Offre découverte, limites strictes.
 * Plan `starter`  : Petites équipes, quotas raisonnables.
 * Plan `pro`      : Utilisateurs avancés, limites élevées.
 * Plan `enterprise` : Tout illimité.
 */
export const PLAN_QUOTAS: Record<string, QuotaLimit[]> = {
  free: [
    { type: 'agents', limit: 3, used: 0 },
    { type: 'tasks_per_day', limit: 50, used: 0 },
    { type: 'tasks_per_hour', limit: 10, used: 0 },
    { type: 'storage_mb', limit: 100, used: 0 },
    { type: 'api_calls_per_min', limit: 60, used: 0 },
    { type: 'credits_monthly', limit: 0, used: 0 },
    { type: 'concurrent_executions', limit: 1, used: 0 },
  ],
  starter: [
    { type: 'agents', limit: 10, used: 0 },
    { type: 'tasks_per_day', limit: 200, used: 0 },
    { type: 'tasks_per_hour', limit: 30, used: 0 },
    { type: 'storage_mb', limit: 1024, used: 0 },
    { type: 'api_calls_per_min', limit: 120, used: 0 },
    { type: 'credits_monthly', limit: 1000, used: 0 },
    { type: 'concurrent_executions', limit: 3, used: 0 },
  ],
  pro: [
    { type: 'agents', limit: 50, used: 0 },
    { type: 'tasks_per_day', limit: 1000, used: 0 },
    { type: 'tasks_per_hour', limit: 100, used: 0 },
    { type: 'storage_mb', limit: 10240, used: 0 },
    { type: 'api_calls_per_min', limit: 300, used: 0 },
    { type: 'credits_monthly', limit: 5000, used: 0 },
    { type: 'concurrent_executions', limit: 10, used: 0 },
  ],
  enterprise: [
    { type: 'agents', limit: -1, used: 0 },
    { type: 'tasks_per_day', limit: -1, used: 0 },
    { type: 'tasks_per_hour', limit: -1, used: 0 },
    { type: 'storage_mb', limit: -1, used: 0 },
    { type: 'api_calls_per_min', limit: -1, used: 0 },
    { type: 'credits_monthly', limit: -1, used: 0 },
    { type: 'concurrent_executions', limit: -1, used: 0 },
  ],
};

// ============================================================
// Helpers
// ============================================================

/**
 * Construit la clé de date pour un type de quota.
 * Permet de partitionner les compteurs temporels.
 *
 * - Quotas journaliers (`tasks_per_day`) → `YYYY-MM-DD`
 * - Quotas horaires (`tasks_per_hour`) → `YYYY-MM-DD-HH`
 * - Quotas mensuels (`credits_monthly`) → `YYYY-MM`
 * - Quotas globaux (`agents`, `storage_mb`, etc.) → `all`
 *
 * @param quotaType - Type de quota.
 * @returns Clé de partition temporelle.
 */
function getDateKey(quotaType: QuotaType): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');

  switch (quotaType) {
    case 'tasks_per_day':
    case 'api_calls_per_min':
      return `${y}-${m}-${d}`;
    case 'tasks_per_hour':
      return `${y}-${m}-${d}-${h}`;
    case 'credits_monthly':
      return `${y}-${m}`;
    default:
      return 'all';
  }
}

/**
 * Construit l'identifiant unique d'un compteur d'utilisation.
 *
 * @param userId - Identifiant de l'utilisateur.
 * @param quotaType - Type de quota.
 * @returns Identifiant du document dans `usage_counters`.
 */
function buildCounterId(userId: string, quotaType: QuotaType): string {
  const dateKey = getDateKey(quotaType);
  return `${userId}_${quotaType}_${dateKey}`;
}

/**
 * Détermine la collection Firestore à interroger pour compter
 * l'utilisation actuelle d'un type de quota.
 *
 * Pour les compteurs simples (agents, tasks), on compte directement
 * dans la collection métier. Pour les compteurs complexes (storage,
 * credits), on utilise la collection `usage_counters`.
 *
 * @param quotaType - Type de quota.
 * @param userId - Identifiant de l'utilisateur.
 * @returns Utilisation actuelle (nombre d'unités consommées).
 */
async function getCurrentUsage(userId: string, quotaType: QuotaType): Promise<number> {
  try {
    switch (quotaType) {
      case 'agents': {
        return await db.agent.count({
          where: [{ field: 'userId', op: '==', value: userId }],
        });
      }
      case 'tasks_per_day': {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        return await db.task.count({
          where: [
            { field: 'userId', op: '==', value: userId },
            { field: 'createdAt', op: '>=', value: startOfDay },
          ],
        });
      }
      case 'tasks_per_hour': {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        return await db.task.count({
          where: [
            { field: 'userId', op: '==', value: userId },
            { field: 'createdAt', op: '>=', value: oneHourAgo },
          ],
        });
      }
      default: {
        // Pour les compteurs gérés via usage_counters (storage, credits, etc.)
        const counterId = buildCounterId(userId, quotaType);
        const counter = await db.usageDaily.findUnique({
          where: { id: counterId },
        }) as Record<string, unknown> | null;
        return (counter?.count as number) ?? 0;
      }
    }
  } catch {
    // En cas d'erreur de lecture, on considère l'utilisation à 0
    // pour ne pas bloquer l'utilisateur injustement.
    return 0;
  }
}

// ============================================================
// API publique
// ============================================================

/**
 * Résultat d'une vérification de quota.
 *
 * @property allowed - `true` si l'action est autorisée.
 * @property remaining - Nombre d'unités restantes avant le plafond.
 *   Vaut `Infinity` pour les plans illimités.
 * @property limit - Plafond du quota pour ce type/plan.
 */
export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

/**
 * Vérifie si un utilisateur respecte un quota donné pour son plan.
 * Compte l'utilisation actuelle depuis Firestore et la compare
 * à la limite du plan spécifié.
 *
 * @param userId - Identifiant de l'utilisateur (ou organisation).
 * @param plan - Nom du plan (`free`, `starter`, `pro`, `enterprise`).
 * @param quotaType - Type de quota à vérifier.
 * @param additional - Nombre d'unités supplémentaires souhaitées (défaut 1).
 * @returns Résultat de la vérification avec le solde restant.
 *
 * @example
 * ```ts
 * const check = await checkQuota(userId, 'free', 'tasks_per_day');
 * if (!check.allowed) {
 *   return NextResponse.json(
 *     { error: `Quota atteint (${check.limit}/jour)` },
 *     { status: 429 }
 *   );
 * }
 * ```
 */
export async function checkQuota(
  userId: string,
  plan: string,
  quotaType: QuotaType,
  additional: number = 1,
): Promise<QuotaCheckResult> {
  const quotas = PLAN_QUOTAS[plan] ?? PLAN_QUOTAS.free;
  const quotaDef = quotas.find((q) => q.type === quotaType);

  // Si le type de quota n'est pas défini pour le plan, on l'autorise
  // (principe de moindre restriction pour les types inconnus).
  if (!quotaDef) {
    return { allowed: true, remaining: Infinity, limit: -1 };
  }

  const limit = quotaDef.limit;

  // Plan illimité
  if (limit === -1) {
    return { allowed: true, remaining: Infinity, limit: -1 };
  }

  const used = await getCurrentUsage(userId, quotaType);
  const remaining = Math.max(0, limit - used);
  const allowed = used + additional <= limit;

  return { allowed, remaining, limit };
}

/**
 * TTL par défaut des compteurs d'utilisation en millisecondes.
 * Les compteurs journaliers expirent après 48h, horaires après 2h.
 */
const TTL_MS: Record<QuotaType, number> = {
  agents: 0, // Pas de TTL — compteur global, jamais périmé
  tasks_per_day: 48 * 60 * 60 * 1000,
  tasks_per_hour: 2 * 60 * 60 * 1000,
  storage_mb: 0, // Pas de TTL
  api_calls_per_min: 2 * 60 * 60 * 1000,
  credits_monthly: 35 * 24 * 60 * 60 * 1000, // 35 jours (marge de sécurité)
  concurrent_executions: 0, // Pas de TTL
};

/**
 * Incrémente le compteur d'utilisation d'un utilisateur pour un type de quota.
 * Stocke le compteur dans la collection `usage_counters` (réutilisation
 * de `usageDaily` dans la façade db) avec un champ `expiresAt` pour
 * le nettoyage futur.
 *
 * @param userId - Identifiant de l'utilisateur.
 * @param quotaType - Type de quota à incrémenter.
 * @param amount - Quantité à ajouter (défaut 1).
 *
 * @example
 * ```ts
 * await incrementUsage(userId, 'tasks_per_day');
 * // Après l'exécution d'une tâche
 * ```
 */
export async function incrementUsage(
  userId: string,
  quotaType: QuotaType,
  amount: number = 1,
): Promise<void> {
  const counterId = buildCounterId(userId, quotaType);
  const ttl = TTL_MS[quotaType];
  const now = new Date();
  const expiresAt = ttl > 0 ? new Date(now.getTime() + ttl) : null;

  try {
    await db.usageDaily.upsert({
      where: { id: counterId },
      create: {
        id: counterId,
        userId,
        quotaType,
        count: amount,
        date: now.toISOString(),
        ...(expiresAt ? { expiresAt } : {}),
      },
      update: {
        count: { increment: amount },
      },
    });
  } catch (error) {
    // L'échec de l'incrémentation ne doit pas bloquer l'action
    // de l'utilisateur — on loggue et on continue.
    console.error(
      `[quotas] Échec de l'incrémentation du compteur ${counterId}:`,
      error,
    );
  }
}

/**
 * Réinitialise le compteur d'utilisation pour un utilisateur et un type de quota.
 * Principalement utilisé pour les tests et l'administration.
 *
 * @param userId - Identifiant de l'utilisateur.
 * @param quotaType - Type de quota à réinitialiser.
 */
export async function resetUsage(
  userId: string,
  quotaType: QuotaType,
): Promise<void> {
  const counterId = buildCounterId(userId, quotaType);
  try {
    await db.usageDaily.upsert({
      where: { id: counterId },
      create: {
        id: counterId,
        userId,
        quotaType,
        count: 0,
        date: new Date().toISOString(),
      },
      update: {
        count: 0,
      },
    });
  } catch (error) {
    console.error(
      `[quotas] Échec de la réinitialisation du compteur ${counterId}:`,
      error,
    );
  }
}
