// ============================================================
// Gen3ia — File de tâches / Bus d'événements : définitions de types
// ============================================================
//  Types centraux pour le système de file d'attente et le bus
//  d'événements :
//    - États et priorités des travaux
//    - Travaux en file (QueueJob)
//    - Messages d'événement (EventMessage)
// ============================================================

/**
 * États possibles d'un travail en file d'attente.
 * - `queued`     : en attente d'exécution.
 * - `running`    : en cours d'exécution par un worker.
 * - `completed`  : terminé avec succès.
 * - `failed`     : en échec (relancé si tentatives restantes).
 * - `cancelled`  : annulé manuellement.
 * - `dead_letter` : échec définitif (toutes tentatives épuisées).
 */
export type JobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'dead_letter';

/**
 * Niveaux de priorité d'un travail.
 * Détermine l'ordre de traitement par les workers.
 */
export type JobPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Travail en file d'attente.
 * Représente une unité de travail asynchrone avec son
 * statut, ses tentatives, son résultat et ses métadonnées.
 */
export interface QueueJob {
  /** Identifiant unique du document Firestore. */
  id: string;
  /** Nom de la file (ex: 'emails', 'generations', 'reports'). */
  queue: string;
  /** Charge utile du travail (données d'entrée sérialisées). */
  payload: Record<string, unknown>;
  /** État actuel du travail. */
  status: JobStatus;
  /** Niveau de priorité. */
  priority: JobPriority;
  /** Nombre de tentatives d'exécution déjà effectuées. */
  attempts: number;
  /** Nombre maximum de tentatives avant passage en dead_letter. */
  maxAttempts: number;
  /** Horodatage de la prochaine exécution (pour les travaux différés). */
  runAt?: Date;
  /** Horodatage de début d'exécution. */
  startedAt?: Date;
  /** Horodatage de fin d'exécution. */
  completedAt?: Date;
  /** Horodatage du dernier échec. */
  failedAt?: Date;
  /** Message d'erreur de la dernière tentative. */
  lastError?: string;
  /** Résultat produit par le travail (en cas de succès). */
  result?: Record<string, unknown>;
  /** Identifiant de corrélation pour le traçage distribué. */
  correlationId?: string;
  /** Horodatage de création. */
  createdAt: Date;
}

/**
 * Message d'événement diffusé sur le bus d'événements.
 * Représente un fait qui s'est produit dans le système,
 * consommé par des abonnés de manière découplée.
 */
export interface EventMessage {
  /** Identifiant unique du document Firestore. */
  id: string;
  /** Type d'événement (ex: 'system.task.created'). */
  type: string;
  /** Source de l'événement (module ou service émetteur). */
  source: string;
  /** Charge utile de l'événement (données structurées). */
  payload: Record<string, unknown>;
  /** Horodatage de l'événement. */
  timestamp: Date;
  /** Identifiant de corrélation pour le traçage distribué. */
  correlationId?: string;
  /** Identifiant de l'utilisateur concerné (optionnel). */
  userId?: string;
}
