// ============================================================
// Gen3ia — Plan d'orchestration : définitions de types
// ============================================================
//  Types centraux pour le moteur d'orchestration multi-agents :
//    - États de tâche et d'étape
//    - Tâche d'orchestration complète
//    - Étape d'orchestration
// ============================================================

/**
 * États possibles d'une tâche d'orchestration.
 * - `pending`     : en attente de démarrage.
 * - `planning`    : en cours de planification (décomposition en étapes).
 * - `in_progress` : exécution des étapes en cours.
 * - `waiting`     : en attente d'une ressource ou d'un événement externe.
 * - `completed`   : toutes les étapes terminées avec succès.
 * - `failed`      : au moins une étape a échoué de manière irrécupérable.
 * - `cancelled`   : annulée par l'utilisateur ou le système.
 */
export type TaskStatus =
  | 'pending'
  | 'planning'
  | 'in_progress'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * États possibles d'une étape individuelle au sein d'une tâche.
 * - `pending`  : en attente d'exécution.
 * - `running`  : en cours d'exécution.
 * - `completed`: terminée avec succès.
 * - `failed`   : terminée en erreur.
 * - `skipped`  : ignorée (dépendance non satisfaite ou inutile).
 */
export type StepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

/**
 * Budget alloué à une tâche d'orchestration.
 * Définit les limites de consommation autorisées.
 */
export interface TaskBudget {
  /** Nombre maximum de tokens (prompt + complétion) sur l'ensemble des étapes. */
  maxTokens: number;
  /** Coût maximal autorisé en USD. */
  maxCostUsd: number;
  /** Durée maximale d'exécution en millisecondes. */
  maxDurationMs: number;
}

/**
 * Tâche d'orchestration complète.
 * Représente un objectif utilisateur décomposé en étapes
 * séquentielles ou avec dépendances, exécutées par des agents.
 */
export interface OrchestrationTask {
  /** Identifiant unique du document Firestore. */
  id: string;
  /** Identifiant de l'utilisateur demandeur. */
  userId: string;
  /** Identifiant de l'organisation (multi-tenant, optionnel). */
  orgId?: string;
  /** Description textuelle de l'objectif à atteindre. */
  objective: string;
  /** État actuel de la tâche. */
  status: TaskStatus;
  /** Plan décomposé en étapes ordonnées. */
  plan: OrchestrationStep[];
  /** Index de l'étape en cours d'exécution. */
  currentStepIndex: number;
  /** Données d'entrée initiales de la tâche. */
  input: Record<string, unknown>;
  /** Données de sortie accumulées (résultat final). */
  output: Record<string, unknown>;
  /** Identifiants des agents sélectionnés pour l'exécution. */
  selectedAgentIds: string[];
  /** Identifiant du modèle LLM sélectionné. */
  selectedModel: string;
  /** Liste des outils activés pour la tâche. */
  selectedTools: string[];
  /** Message d'erreur en cas d'échec. */
  error?: string;
  /** Budget alloué à la tâche. */
  budget: TaskBudget;
  /** Nombre total de tokens consommés. */
  tokensUsed: number;
  /** Coût total en USD de la tâche. */
  costUsd: number;
  /** Horodatage de début d'exécution. */
  startedAt?: Date;
  /** Horodatage de fin d'exécution. */
  completedAt?: Date;
  /** Identifiant de corrélation pour le traçage distribué. */
  correlationId: string;
  /** Horodatage de création du document. */
  createdAt: Date;
  /** Horodatage de dernière mise à jour. */
  updatedAt: Date;
}

/**
 * Étape individuelle au sein d'un plan d'orchestration.
 * Chaque étape est exécutée par un agent spécifique
 * avec ses propres outils et paramètres.
 */
export interface OrchestrationStep {
  /** Identifiant unique de l'étape. */
  id: string;
  /** Identifiant de la tâche parente. */
  taskId: string;
  /** Position de l'étape dans le plan (index base 0). */
  index: number;
  /** Description textuelle de l'action à réaliser. */
  description: string;
  /** Identifiant de l'agent assigné à cette étape (assigné après la planification). */
  agentId?: string;
  /** Identifiant du modèle LLM à utiliser pour cette étape. */
  model?: string;
  /** Liste des outils activés pour cette étape. */
  tools: string[];
  /** Données d'entrée spécifiques à l'étape. */
  input: Record<string, unknown>;
  /** Données de sortie produites par l'étape. */
  output?: Record<string, unknown>;
  /** État actuel de l'étape. */
  status: StepStatus;
  /** Message d'erreur en cas d'échec. */
  error?: string;
  /** Nombre de tokens consommés par cette étape. */
  tokensUsed: number;
  /** Coût en USD de cette étape. */
  costUsd: number;
  /** Durée réelle d'exécution en millisecondes. */
  durationMs: number;
  /** Nombre de tentatives déjà effectuées. */
  retryCount: number;
  /** Nombre maximum de tentatives autorisées. */
  maxRetries: number;
  /** Identifiants des étapes dont dépend cette étape. */
  dependsOn?: string[];
}
