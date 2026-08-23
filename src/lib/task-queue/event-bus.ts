// ============================================================
// Gen3ia — Bus d'événements
// ============================================================
//  Bus d'événements persistant basé sur Firestore.
//  Permet la communication découplée entre modules via
//  la publication/abonnement à des événements typés.
//
//  Deux modes de consommation :
//    1. Abonnement temps réel (onSnapshot) — processus longs.
//    2. Interrogation (polling) — compatible serverless Vercel.
//
//  Collection Firestore : `events`
// ============================================================

import { FirestoreRepository } from '@/lib/firebase/firestore';

import type { EventMessage } from './types';

// ----------------------------------------------------------------
// Référentiel Firestore
// ----------------------------------------------------------------

/** Référentiel pour les événements. */
const eventRepo = new FirestoreRepository<EventMessage>('events');

// ----------------------------------------------------------------
// Constantes — types d'événements système
// ----------------------------------------------------------------

/**
 * Types d'événements système prédéfinis.
 * Utilisés pour la communication inter-modules.
 */
export const SYSTEM_EVENTS = {
  /** Tâche d'orchestration créée. */
  TASK_CREATED: 'system.task.created',
  /** Tâche d'orchestration terminée avec succès. */
  TASK_COMPLETED: 'system.task.completed',
  /** Tâche d'orchestration échouée. */
  TASK_FAILED: 'system.task.failed',
  /** Agent exécuté avec succès. */
  AGENT_EXECUTED: 'system.agent.executed',
  /** Crédits consommés par une opération. */
  CREDIT_CONSUMED: 'system.credit.consumed',
  /** Nouvel utilisateur inscrit. */
  USER_REGISTERED: 'system.user.registered',
  /** Workflow déclenché. */
  WORKFLOW_TRIGGERED: 'system.workflow.triggered',
} as const;

// ----------------------------------------------------------------
// Fonctions utilitaires
// ----------------------------------------------------------------

/**
 * Convertit un document Firestore brut en EventMessage.
 *
 * @param raw - Document Firestore désérialisé.
 * @returns Objet EventMessage typé.
 */
function toEventMessage(raw: Record<string, unknown>): EventMessage {
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
    type: raw.type as string,
    source: (raw.source as string) ?? 'unknown',
    payload: (raw.payload as Record<string, unknown>) ?? {},
    timestamp: safeDate(raw.timestamp),
    correlationId: raw.correlationId as string | undefined,
    userId: raw.userId as string | undefined,
  };
}

// ----------------------------------------------------------------
// API publique
// ----------------------------------------------------------------

/**
 * Options de publication d'un événement.
 */
export interface PublishOptions {
  /** Source de l'événement (module émetteur). */
  source?: string;
  /** Identifiant de corrélation pour le traçage. */
  correlationId?: string;
  /** Identifiant de l'utilisateur concerné. */
  userId?: string;
}

/**
 * Publie un événement sur le bus.
 *
 * Crée un document dans la collection `events`. L'événement
 * sera consommé par les abonnés (soit en temps réel via onSnapshot,
 * soit par interrogation via `getEvents`).
 *
 * @param eventType - Type de l'événement (ex: 'system.task.created').
 * @param payload   - Charge utile de l'événement.
 * @param options   - Options de source, corrélation et utilisateur.
 * @returns Identifiant de l'événement créé.
 */
export async function publish(
  eventType: string,
  payload: Record<string, unknown>,
  options?: PublishOptions,
): Promise<string> {
  const created = await eventRepo.create({
    data: {
      type: eventType,
      source: options?.source ?? 'orchestration',
      payload,
      timestamp: new Date(),
      correlationId: options?.correlationId,
      userId: options?.userId,
    },
  });

  return (created as Record<string, unknown>).id as string;
}

/**
 * Résultat d'abonnement avec fonction de désabonnement.
 */
export interface SubscriptionHandle {
  /** Fonction appelée pour se désabonner et libérer les ressources. */
  unsubscribe: () => void;
}

/**
 * Abonne un gestionnaire à un type d'événement.
 *
 * Met en place un listener Firestore (`onSnapshot`) filtré par
 * type d'événement. Chaque nouvel événement déclenche le gestionnaire.
 *
 * ⚠️ **Attention — Compatibilité serverless** :
 * Cette fonction utilise `onSnapshot` qui nécessite une connexion
 * persistante. Elle ne fonctionne PAS dans un environnement
 * serverless (Vercel, Cloud Functions). Pour Vercel, les événements
 * doivent être consommés via :
 *   - Des déclencheurs Firestore (onWrite/onCreate)
 *   - Des endpoints HTTP dédiés
 *   - Des travaux en file d'attente (cf. `@/lib/task-queue`)
 *
 * @param eventType - Type d'événement à écouter.
 * @param handler   - Fonction asynchrone appelée pour chaque événement.
 * @returns Handle avec une fonction `unsubscribe`.
 */
export async function subscribe(
  eventType: string,
  handler: (event: EventMessage) => Promise<void>,
): Promise<SubscriptionHandle> {
  // Import dynamique du SDK Firebase Admin pour onSnapshot
  const { getAdminDb } = await import('@/lib/firebase/admin');
  const adminDb = getAdminDb();

  const query = adminDb
    .collection('events')
    .where('type', '==', eventType)
    .orderBy('timestamp', 'desc')
    .limit(100);

  // Suivre les nouveaux événements (uniquement les nouveaux documents)
  let lastProcessedTimestamp = Date.now();

  const unsubscribe = query.onSnapshot(
    (snapshot) => {
      for (const doc of snapshot.docChanges()) {
        // Traiter uniquement les nouveaux documents
        if (doc.type !== 'added') continue;

        const data = doc.doc.data();
        const timestamp = data.timestamp;
        const ts = timestamp?.toDate?.()?.getTime?.() ??
          (timestamp instanceof Date ? timestamp.getTime() : 0);

        // Ignorer les événements antérieurs à l'abonnement
        if (ts <= lastProcessedTimestamp) continue;

        lastProcessedTimestamp = ts;

        const event: EventMessage = {
          id: doc.doc.id,
          type: data.type as string,
          source: (data.source as string) ?? 'unknown',
          payload: (data.payload as Record<string, unknown>) ?? {},
          timestamp: ts > 0 ? new Date(ts) : new Date(),
          correlationId: data.correlationId as string | undefined,
          userId: data.userId as string | undefined,
        };

        // Exécuter le gestionnaire de manière non-bloquante
        handler(event).catch((err) => {
          console.error(
            `[event-bus] Erreur dans le gestionnaire d'événements '${eventType}' :`,
            err,
          );
        });
      }
    },
    (error) => {
      console.error(
        `[event-bus] Erreur sur le listener d'événements '${eventType}' :`,
        error,
      );
    },
  );

  return { unsubscribe };
}

/**
 * Récupère des événements depuis la collection.
 *
 * Compatible serverless — aucun listener persistant n'est requis.
 * Utilisé pour l'interrogation périodique ou la consultation.
 *
 * @param eventType - Filtrer par type d'événement (optionnel).
 * @param userId    - Filtrer par utilisateur (optionnel).
 * @param limit     - Nombre maximum de résultats (défaut : 50).
 * @returns Liste des événements, triés par date décroissante.
 */
export async function getEvents(
  eventType?: string,
  userId?: string,
  limit?: number,
): Promise<EventMessage[]> {
  const where: Array<{ field: string; op: string; value: unknown }> = [];

  if (eventType) {
    where.push({ field: 'type', op: '==', value: eventType });
  }

  if (userId) {
    where.push({ field: 'userId', op: '==', value: userId });
  }

  const docs = await eventRepo.findMany({
    where: where.length > 0 ? where : undefined,
    orderBy: { timestamp: 'desc' },
    limit: limit ?? 50,
  });

  return docs.map((d) => toEventMessage(d as Record<string, unknown>));
}
