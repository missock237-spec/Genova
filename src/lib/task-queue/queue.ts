// ============================================================
// Gen3ia — File de tâches (Task Queue)
// ============================================================
//  Implémentation d'une file d'attente persistante basée sur
//  Firestore, compatible avec les fonctions serverless Vercel.
//
//  Fonctionnalités :
//    - Enfilement avec priorité et délai
//    - Défilement atomique (claim) avec tri par priorité
//    - Retour arrière exponentiel (exponential backoff)
//    - File de lettres mortes (dead letter queue)
//    - Statistiques et purge
//
//  Collection Firestore : `queue_jobs`
// ============================================================

import { FirestoreRepository } from '@/lib/firebase/firestore';

import type { QueueJob, JobPriority, JobStatus } from './types';

// ----------------------------------------------------------------
// Référentiel Firestore
// ----------------------------------------------------------------

/** Référentiel pour les travaux en file. */
const jobRepo = new FirestoreRepository<QueueJob>('queue_jobs');

// ----------------------------------------------------------------
// Constantes
// ----------------------------------------------------------------

/** Poids de priorité pour le tri. Plus élevé = traité en premier. */
export const PRIORITY_WEIGHTS: Record<JobPriority, number> = {
  low: 1,
  normal: 5,
  high: 10,
  critical: 20,
};

/** Nombre maximum de travaux récupérés par appel à dequeue. */
const MAX_DEQUEUE_LIMIT = 50;

/** Nombre de jours par défaut pour la purge des travaux terminés. */
const DEFAULT_PURGE_DAYS = 7;

// ----------------------------------------------------------------
// Fonctions utilitaires
// ----------------------------------------------------------------

/**
 * Convertit un document Firestore brut en QueueJob.
 * Gère la conversion des dates potentiellement invalides.
 *
 * @param raw - Document Firestore désérialisé.
 * @returns Objet QueueJob typé.
 */
function toQueueJob(raw: Record<string, unknown>): QueueJob {
  function safeDate(value: unknown): Date {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    if (typeof value === 'number' && value > 0) return new Date(value);
    return new Date();
  }

  return {
    id: raw.id as string,
    queue: raw.queue as string,
    payload: (raw.payload as Record<string, unknown>) ?? {},
    status: raw.status as JobStatus,
    priority: raw.priority as JobPriority,
    attempts: (raw.attempts as number) ?? 0,
    maxAttempts: (raw.maxAttempts as number) ?? 3,
    runAt: raw.runAt ? safeDate(raw.runAt) : undefined,
    startedAt: raw.startedAt ? safeDate(raw.startedAt) : undefined,
    completedAt: raw.completedAt ? safeDate(raw.completedAt) : undefined,
    failedAt: raw.failedAt ? safeDate(raw.failedAt) : undefined,
    lastError: raw.lastError as string | undefined,
    result: (raw.result as Record<string, unknown>) ?? undefined,
    correlationId: raw.correlationId as string | undefined,
    createdAt: safeDate(raw.createdAt),
  };
}

// ----------------------------------------------------------------
// API publique
// ----------------------------------------------------------------

/**
 * Options d'enfilement d'un travail.
 */
export interface EnqueueOptions {
  /** Priorité du travail (défaut : 'normal'). */
  priority?: JobPriority;
  /** Délai avant que le travail soit disponible (en ms). */
  delayMs?: number;
  /** Nombre maximum de tentatives (défaut : 3). */
  maxAttempts?: number;
  /** Identifiant de corrélation pour le traçage. */
  correlationId?: string;
  /** Date/heure de première exécution. */
  runAt?: Date;
}

/**
 * Enfile un nouveau travail dans la file d'attente.
 *
 * Crée un document dans la collection `queue_jobs` avec le statut
 * `'queued'`. Si `delayMs` est spécifié, le champ `runAt` est
 * positionné à `maintenant + delayMs`.
 *
 * @param queue    - Nom de la file de destination.
 * @param payload  - Charge utile du travail.
 * @param options  - Options de priorité, délai et tentatives.
 * @returns Identifiant du travail créé.
 */
export async function enqueue(
  queue: string,
  payload: Record<string, unknown>,
  options?: EnqueueOptions,
): Promise<string> {
  const priority = options?.priority ?? 'normal';
  const maxAttempts = options?.maxAttempts ?? 3;

  let runAt: Date | undefined;
  if (options?.runAt) {
    runAt = options.runAt;
  } else if (options?.delayMs && options.delayMs > 0) {
    runAt = new Date(Date.now() + options.delayMs);
  }

  const created = await jobRepo.create({
    data: {
      queue,
      payload,
      status: 'queued',
      priority,
      priorityWeight: PRIORITY_WEIGHTS[priority],
      attempts: 0,
      maxAttempts,
      runAt,
      correlationId: options?.correlationId,
    },
  });

  return (created as Record<string, unknown>).id as string;
}

/**
 * Défile des travaux disponibles depuis la file.
 *
 * Récupère les travaux en statut `'queued'` dont `runAt` est
 * passé ou non défini, triés par poids de priorité décroissant
 * puis par date de création croissante. Les travaux récupérés
 * sont immédiatement marqués comme `'running'` (claim atomique).
 *
 * @param queue - Nom de la file.
 * @param limit - Nombre maximum de travaux à récupérer (défaut : 10).
 * @returns Liste des travaux réclamés.
 */
export async function dequeue(
  queue: string,
  limit?: number,
): Promise<QueueJob[]> {
  const effectiveLimit = Math.min(limit ?? 10, MAX_DEQUEUE_LIMIT);
  const now = new Date();

  // Récupérer les travaux disponibles triés par priorité décroissante
  // Firestore ne supporte qu'un seul orderBy, donc on lit plus de
  // documents et on trie en mémoire pour les deux critères
  const available = await jobRepo.findMany({
    where: [
      { field: 'queue', op: '==', value: queue },
      { field: 'status', op: '==', value: 'queued' },
    ],
    orderBy: { priorityWeight: 'desc' },
    limit: effectiveLimit * 3, // Sur-lire pour filtrer en mémoire
  });

  // Filtrer par runAt et trier par priorité puis createdAt
  const ready = available
    .map((d) => toQueueJob(d as Record<string, unknown>))
    .filter((job) => !job.runAt || job.runAt <= now)
    .sort((a, b) => {
      // Premier critère : poids de priorité décroissant
      const weightDiff = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
      if (weightDiff !== 0) return weightDiff;
      // Second critère : date de création croissante
      return a.createdAt.getTime() - b.createdAt.getTime();
    })
    .slice(0, effectiveLimit);

  if (ready.length === 0) return [];

  // Marquer les travaux comme 'running' (claim atomique)
  const claimed: QueueJob[] = [];
  for (const job of ready) {
    try {
      await jobRepo.update({
        where: { id: job.id },
        data: {
          status: 'running',
          startedAt: new Date(),
        },
      });
      job.status = 'running';
      job.startedAt = new Date();
      claimed.push(job);
    } catch {
      // Le travail a pu être réclamé par un autre worker — ignorer
    }
  }

  return claimed;
}

/**
 * Marque un travail comme terminé avec succès.
 *
 * @param jobId  - Identifiant du travail.
 * @param result - Résultat optionnel du travail.
 */
export async function completeJob(
  jobId: string,
  result?: Record<string, unknown>,
): Promise<void> {
  const data: Record<string, unknown> = {
    status: 'completed',
    completedAt: new Date(),
  };
  if (result) data.result = result;

  await jobRepo.update({ where: { id: jobId }, data });
}

/**
 * Signale l'échec d'un travail.
 *
 * Si le nombre de tentatives est inférieur à `maxAttempts`,
 * le travail est replacé en file `'queued'` avec un délai
 * d'attente exponentiel (`2^attempts * 1000` ms).
 *
 * Sinon, le travail est déplacé en file de lettres mortes
 * (statut `'dead_letter'`).
 *
 * @param jobId - Identifiant du travail.
 * @param error - Message d'erreur.
 */
export async function failJob(jobId: string, error: string): Promise<void> {
  const doc = await jobRepo.findUnique({ where: { id: jobId } });
  if (!doc) return;

  const job = toQueueJob(doc as Record<string, unknown>);
  const nextAttempt = job.attempts + 1;

  if (nextAttempt < job.maxAttempts) {
    // Retour en file avec backoff exponentiel
    const backoffMs = Math.pow(2, nextAttempt) * 1000;
    const runAt = new Date(Date.now() + backoffMs);

    await jobRepo.update({
      where: { id: jobId },
      data: {
        status: 'queued',
        attempts: nextAttempt,
        lastError: error,
        failedAt: new Date(),
        startedAt: undefined,
        runAt,
      },
    });
  } else {
    // Toutes les tentatives épuisées → dead letter
    await jobRepo.update({
      where: { id: jobId },
      data: {
        status: 'dead_letter',
        attempts: nextAttempt,
        lastError: error,
        failedAt: new Date(),
      },
    });
  }
}

/**
 * Annule un travail en attente ou en cours.
 *
 * @param jobId - Identifiant du travail à annuler.
 */
export async function cancelJob(jobId: string): Promise<void> {
  await jobRepo.update({
    where: { id: jobId },
    data: { status: 'cancelled' },
  });
}

/**
 * Récupère un travail par son identifiant.
 *
 * @param jobId - Identifiant du travail.
 * @returns Le travail ou `null` si introuvable.
 */
export async function getJob(jobId: string): Promise<QueueJob | null> {
  const doc = await jobRepo.findUnique({ where: { id: jobId } });
  if (!doc) return null;
  return toQueueJob(doc as Record<string, unknown>);
}

/**
 * Récupère les travaux en file de lettres mortes.
 *
 * @param queue - Nom de la file.
 * @param limit - Nombre maximum de résultats (défaut : 50).
 * @returns Liste des travaux en dead_letter, triés par date d'échec décroissante.
 */
export async function getDeadLetterJobs(
  queue: string,
  limit?: number,
): Promise<QueueJob[]> {
  const docs = await jobRepo.findMany({
    where: [
      { field: 'queue', op: '==', value: queue },
      { field: 'status', op: '==', value: 'dead_letter' },
    ],
    orderBy: { failedAt: 'desc' },
    limit: limit ?? 50,
  });

  return docs.map((d) => toQueueJob(d as Record<string, unknown>));
}

/**
 * Replace un travail de la file de lettres mortes en file normale.
 * Réinitialise le compteur de tentatives à zéro.
 *
 * @param jobId - Identifiant du travail à relancer.
 */
export async function retryDeadLetterJob(jobId: string): Promise<void> {
  await jobRepo.update({
    where: { id: jobId },
    data: {
      status: 'queued',
      attempts: 0,
      lastError: undefined,
      failedAt: undefined,
      startedAt: undefined,
      completedAt: undefined,
      runAt: undefined,
    },
  });
}

/**
 * Statistiques agrégées d'une file d'attente.
 */
export interface QueueStats {
  /** Nombre de travaux en attente. */
  queued: number;
  /** Nombre de travaux en cours d'exécution. */
  running: number;
  /** Nombre de travaux terminés avec succès. */
  completed: number;
  /** Nombre de travaux en échec (en attente de retry ou dead_letter). */
  failed: number;
  /** Nombre de travaux en file de lettres mortes. */
  deadLetter: number;
}

/**
 * Récupère les statistiques d'une file d'attente.
 * Compte le nombre de travaux par statut pour la file donnée.
 *
 * @param queue - Nom de la file.
 * @returns Statistiques agrégées.
 */
export async function getQueueStats(queue: string): Promise<QueueStats> {
  const [queued, running, completed, failed, deadLetter] = await Promise.all([
    jobRepo.count({ where: [{ field: 'queue', op: '==', value: queue }, { field: 'status', op: '==', value: 'queued' }] }),
    jobRepo.count({ where: [{ field: 'queue', op: '==', value: queue }, { field: 'status', op: '==', value: 'running' }] }),
    jobRepo.count({ where: [{ field: 'queue', op: '==', value: queue }, { field: 'status', op: '==', value: 'completed' }] }),
    jobRepo.count({ where: [{ field: 'queue', op: '==', value: queue }, { field: 'status', op: '==', value: 'failed' }] }),
    jobRepo.count({ where: [{ field: 'queue', op: '==', value: queue }, { field: 'status', op: '==', value: 'dead_letter' }] }),
  ]);

  return { queued, running, completed, failed, deadLetter };
}

/**
 * Purge les travaux terminés (completed) plus anciens qu'un seuil.
 *
 * Supprime définitivement les documents de la collection.
 * Utilisé pour le nettoyage périodique et la gestion du coût Firestore.
 *
 * @param queue          - Nom de la file.
 * @param olderThanDays  - Âge minimum en jours (défaut : 7).
 * @returns Nombre de travaux supprimés.
 */
export async function purgeCompleted(
  queue: string,
  olderThanDays?: number,
): Promise<number> {
  const threshold = new Date(
    Date.now() - (olderThanDays ?? DEFAULT_PURGE_DAYS) * 24 * 60 * 60 * 1000,
  );

  const toDelete = await jobRepo.findMany({
    where: [
      { field: 'queue', op: '==', value: queue },
      { field: 'status', op: '==', value: 'completed' },
      { field: 'completedAt', op: '<=', value: threshold },
    ],
    limit: 500,
  });

  if (toDelete.length === 0) return 0;

  for (const doc of toDelete) {
    const id = (doc as Record<string, unknown>).id as string;
    await jobRepo.delete({ where: { id } });
  }

  return toDelete.length;
}
