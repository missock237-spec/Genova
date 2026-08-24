/**
 * @module observability/logger
 * @description Journalisation structurée avec identifiants de corrélation.
 * Chaque entrée est émise en JSON vers la sortie standard, permettant
 * une collecte par Vercel Logs, Loki, Datadog ou tout agrégateur compatible.
 */

import type { LogLevel, LogEntry, LogError } from './types';

/**
 * Options de configuration du journaliseur.
 * @interface LoggerOptions
 */
export interface LoggerOptions {
  /** Identifiant de corrélation pour le suivi de requête */
  correlationId?: string;
  /** Identifiant de l'utilisateur concerné */
  userId?: string;
  /** Identifiant de l'agent concerné */
  agentId?: string;
  /** Identifiant de l'exécution concernée */
  executionId?: string;
}

/**
 * Poids numériques des niveaux de journalisation.
 * Utilisé pour le filtrage par niveau minimum.
 * @internal
 */
const LOG_LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

/**
 * Niveau de journalisation minimum basé sur la variable d'environnement.
 * Par défaut, 'info' en production et 'debug' en développement.
 * @internal
 */
const MIN_LOG_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

/**
 * Journaliseur structuré avec support des identifiants de corrélation.
 *
 * Chaque méthode de journalisation produit une ligne JSON complète
 * sur la sortie standard, incluant le contexte de service et de corrélation.
 *
 * @example
 * ```typescript
 * const logger = createLogger('mon-service', { correlationId: 'abc-123' });
 * logger.info('Traitement démarré', { taskId: 42 });
 * logger.error('Échec du traitement', err, { retryCount: 3 });
 * ```
 */
export class Logger {
  /** Nom du service émetteur */
  private readonly service: string;
  /** Identifiant de corrélation */
  private correlationId?: string;
  /** Identifiant de l'utilisateur */
  private userId?: string;
  /** Identifiant de l'agent */
  private agentId?: string;
  /** Identifiant de l'exécution */
  private executionId?: string;

  /**
   * Crée une nouvelle instance de journaliseur.
   *
   * @param serviceName - Nom du service émetteur (ex: 'agent-orchestrator').
   * @param options - Options de contexte initiales.
   */
  constructor(
    serviceName: string,
    options?: LoggerOptions,
  ) {
    this.service = serviceName;
    this.correlationId = options?.correlationId;
    this.userId = options?.userId;
    this.agentId = options?.agentId;
    this.executionId = options?.executionId;
  }

  /**
   * Extrait les informations d'erreur depuis un objet Error ou une valeur inconnue.
   *
   * @param err - L'erreur à extraire.
   * @returns Objet structuré représentant l'erreur, ou indéfini.
   * @internal
   */
  private extractError(err: Error | unknown): LogError | undefined {
    if (err instanceof Error) {
      return {
        name: err.name,
        message: err.message,
        stack: err.stack,
      };
    }
    if (typeof err === 'string') {
      return {
        name: 'Error',
        message: err,
      };
    }
    if (err !== null && err !== undefined && typeof err === 'object') {
      return {
        name: (err as Record<string, unknown>).constructor?.name as string || 'UnknownError',
        message: String((err as Record<string, unknown>).message ?? err),
      };
    }
    return undefined;
  }

  /**
   * Émet une entrée de journal vers la sortie standard.
   *
   * @param level - Niveau de sévérité.
   * @param message - Message principal.
   * @param error - Erreur optionnelle à capturer.
   * @param metadata - Métadonnées additionnelles.
   * @internal
   */
  private emit(
    level: LogLevel,
    message: string,
    error?: Error | unknown,
    metadata?: Record<string, unknown>,
  ): void {
    // Filtrage par niveau minimum
    if (LOG_LEVEL_WEIGHTS[level] < LOG_LEVEL_WEIGHTS[MIN_LOG_LEVEL]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
    };

    if (this.correlationId) entry.correlationId = this.correlationId;
    if (this.userId) entry.userId = this.userId;
    if (this.agentId) entry.agentId = this.agentId;
    if (this.executionId) entry.executionId = this.executionId;

    if (error) {
      entry.error = this.extractError(error);
    }

    if (metadata && Object.keys(metadata).length > 0) {
      entry.metadata = metadata;
    }

    const serialized = JSON.stringify(entry);

    // Les niveaux error et fatal vont sur stderr, le reste sur stdout
    if (level === 'error' || level === 'fatal') {
      console.error(serialized);
    } else {
      console.log(serialized);
    }
  }

  /**
   * Journalise un message de niveau DEBUG.
   * Réservé aux informations de diagnostic détaillées.
   *
   * @param message - Message de débogage.
   * @param metadata - Métadonnées optionnelles.
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.emit('debug', message, undefined, metadata);
  }

  /**
   * Journalise un message de niveau INFO.
   * Pour les événements opérationnels significatifs.
   *
   * @param message - Message d'information.
   * @param metadata - Métadonnées optionnelles.
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.emit('info', message, undefined, metadata);
  }

  /**
   * Journalise un message de niveau WARN.
   * Pour les situations anormales mais récupérables.
   *
   * @param message - Message d'avertissement.
   * @param metadata - Métadonnées optionnelles.
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.emit('warn', message, undefined, metadata);
  }

  /**
   * Journalise un message de niveau ERROR.
   * Pour les erreurs nécessitant une attention immédiate.
   *
   * @param message - Message d'erreur.
   * @param error - L'erreur capturée, si disponible.
   * @param metadata - Métadonnées optionnelles.
   */
  error(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void {
    this.emit('error', message, error, metadata);
  }

  /**
   * Journalise un message de niveau FATAL.
   * Pour les erreurs critiques nécessitant un redémarrage du service.
   *
   * @param message - Message d'erreur fatale.
   * @param error - L'erreur capturée, si disponible.
   * @param metadata - Métadonnées optionnelles.
   */
  fatal(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void {
    this.emit('fatal', message, error, metadata);
  }

  /**
   * Crée un journaliseur enfant héritant du contexte parent.
   * Les options fournies surchargent celles du parent.
   *
   * @param options - Options de contexte à ajouter ou surcharger.
   * @returns Nouvelle instance de Logger avec le contexte enrichi.
   */
  child(options: LoggerOptions): Logger {
    const childLogger = new Logger(this.service, {
      correlationId: options.correlationId ?? this.correlationId,
      userId: options.userId ?? this.userId,
      agentId: options.agentId ?? this.agentId,
      executionId: options.executionId ?? this.executionId,
    });
    return childLogger;
  }
}

/**
 * Fabrique un journaliseur pour un service donné.
 * Fonction utilitaire simplifiant la création de journaliseurs.
 *
 * @param serviceName - Nom du service émetteur.
 * @param options - Options de contexte initiales.
 * @returns Instance de Logger configurée.
 *
 * @example
 * ```typescript
 * import { createLogger } from '@/lib/observability';
 * const log = createLogger('mon-microservice', { userId: 'u-123' });
 * log.info('Requête reçue');
 * ```
 */
export function createLogger(
  serviceName: string,
  options?: LoggerOptions,
): Logger {
  return new Logger(serviceName, options);
}
