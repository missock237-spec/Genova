/**
 * @module observability/types
 * @description Types et interfaces du système d'observabilité Gen3ia.
 * Définit les structures pour les journaux structurés, les métriques
 * et les spans de traçage distribué.
 */

/**
 * Niveaux de journalisation supportés.
 * Ordonnés du moins au plus sévère.
 * @typedef {'debug' | 'info' | 'warn' | 'error' | 'fatal'} LogLevel
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Informations sur une erreur capturée dans un journal.
 * @interface LogError
 */
export interface LogError {
  /** Nom de l'erreur (ex: 'TypeError') */
  name: string;
  /** Message descriptif de l'erreur */
  message: string;
  /** Pile d'appels, si disponible */
  stack?: string;
}

/**
 * Entrée de journal structuré.
 * Chaque entrée contient le contexte complet pour une analyse ultérieure.
 * @interface LogEntry
 */
export interface LogEntry {
  /** Horodatage ISO 8601 */
  timestamp: string;
  /** Niveau de sévérité */
  level: LogLevel;
  /** Message principal */
  message: string;
  /** Nom du service émetteur */
  service: string;
  /** Identifiant de corrélation pour le suivi de requête */
  correlationId?: string;
  /** Identifiant de l'utilisateur concerné */
  userId?: string;
  /** Identifiant de l'agent concerné */
  agentId?: string;
  /** Identifiant de l'exécution concernée */
  executionId?: string;
  /** Durée de l'opération en millisecondes */
  durationMs?: number;
  /** Erreur capturée, le cas échéant */
  error?: LogError;
  /** Métadonnées additionnelles */
  metadata?: Record<string, unknown>;
}

/**
 * Point de mesure d'une métrique.
 * @interface MetricPoint
 */
export interface MetricPoint {
  /** Nom de la métrique */
  name: string;
  /** Valeur numérique */
  value: number;
  /** Horodatage ISO 8601 */
  timestamp: string;
  /** Étiquettes de dimension pour le filtrage et l'agrégation */
  tags: Record<string, string>;
  /** Unité de mesure (ex: 'ms', 'bytes', 'count') */
  unit?: string;
}

/**
 * Span de traçage représentant une unité de travail.
 * @interface Span
 */
export interface Span {
  /** Identifiant unique de la trace */
  traceId: string;
  /** Identifiant unique de ce span */
  spanId: string;
  /** Identifiant du span parent, si imbriqué */
  parentSpanId?: string;
  /** Nom de l'opération représentée */
  operationName: string;
  /** Heure de début (epoch millisecondes) */
  startTime: number;
  /** Heure de fin (epoch millisecondes) */
  endTime?: number;
  /** Durée calculée en millisecondes */
  durationMs?: number;
  /** Statut final du span */
  status: 'ok' | 'error';
  /** Étiquettes de contexte */
  tags: Record<string, string>;
  /** Journaux associés à ce span */
  logs: LogEntry[];
}
