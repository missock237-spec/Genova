// ============================================================
// Gen3ia — File de tâches / Bus d'événements : point d'entrée
// ============================================================
//  Ré-exporte l'ensemble des types et fonctions du module
//  task-queue pour un accès unifié via `@/lib/task-queue`.
// ============================================================

// --- Types ---
export type {
  JobStatus,
  JobPriority,
  QueueJob,
  EventMessage,
} from './types';

// --- File de tâches ---
export {
  enqueue,
  dequeue,
  completeJob,
  failJob,
  cancelJob,
  getJob,
  getDeadLetterJobs,
  retryDeadLetterJob,
  getQueueStats,
  purgeCompleted,
  PRIORITY_WEIGHTS,
} from './queue';

export type { EnqueueOptions, QueueStats } from './queue';

// --- Bus d'événements ---
export {
  publish,
  subscribe,
  getEvents,
  SYSTEM_EVENTS,
} from './event-bus';

export type { PublishOptions, SubscriptionHandle } from './event-bus';
