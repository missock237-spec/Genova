// ============================================================
// Gen3ia — Journal d'Audit (Plan de Contrôle)
// ============================================================
//  Système centralisé de journalisation des événements de sécurité
//  et d'activité. S'appuie sur la collection `audit_logs` de Firestore
//  via la façade `db.auditLog`.
//
//  Chaque entrée d'audit contient :
//    - Un type d'événement structuré (`AuditEventType`).
//    - L'identifiant de l'utilisateur à l'origine de l'action.
//    - Une corrélation ID pour le suivi distribué.
//    - Des métadonnées optionnelles (IP, User-Agent, sévérité).
//
//  Ce module étend l'audit existant (firebase/analytics.ts) en
//  fournissant une API typée et structurée pour le plan de contrôle.
// ============================================================

import { randomUUID } from 'crypto';
import { db } from '@/lib/db';

/**
 * Types d'événements d'audit couvrant l'ensemble du système.
 * Organisés par domaine fonctionnel :
 *  - `auth.*` : événements d'authentification.
 *  - `agent.*` : opérations sur les agents.
 *  - `task.*` : cycle de vie des tâches.
 *  - `workflow.*` / `tool.*` / `model.*` : exécutions.
 *  - `admin.*` : actions administrateur.
 *  - `billing.*` : opérations de facturation.
 *  - `api_key.*` : gestion des clés API.
 *  - `policy.*` : violations de politique.
 */
export type AuditEventType =
  // Authentification
  | 'auth.login'
  | 'auth.register'
  | 'auth.logout'
  | 'auth.password_reset'
  // Agents
  | 'agent.create'
  | 'agent.update'
  | 'agent.delete'
  | 'agent.execute'
  // Tâches
  | 'task.create'
  | 'task.complete'
  | 'task.fail'
  // Workflows
  | 'workflow.execute'
  // Outils
  | 'tool.execute'
  // Modèles
  | 'model.call'
  // Politiques
  | 'policy.violation'
  // Administration
  | 'admin.user_update'
  | 'admin.role_change'
  // Facturation
  | 'billing.purchase'
  | 'billing.consume'
  // Clés API
  | 'api_key.create'
  | 'api_key.revoke';

/**
 * Niveaux de sévérité pour les événements d'audit.
 * Utilisés pour le filtrage et les alertes.
 */
export type AuditSeverity = 'info' | 'warn' | 'error' | 'critical';

/**
 * Paramètres pour la création d'une entrée d'audit.
 *
 * @property userId - Identifiant de l'utilisateur à l'origine de l'événement.
 * @property resourceId - Identifiant de la ressource concernée (optionnel).
 * @property resourceType - Type de la ressource (ex: `agent`, `task`).
 * @property details - Métadonnées additionnelles structurées.
 * @property ipAddress - Adresse IP du client.
 * @property userAgent - User-Agent du client.
 * @property severity - Niveau de sévérité (défaut `info`).
 *   Déduit automatiquement du type d'événement si non spécifié.
 */
export interface AuditParams {
  userId: string;
  resourceId?: string;
  resourceType?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  severity?: AuditSeverity;
}

/**
 * Entrée d'audit complète stockée dans Firestore.
 */
export interface AuditEntry {
  /** Identifiant unique du document Firestore. */
  id: string;
  /** Type d'événement structuré. */
  eventType: AuditEventType;
  /** Identifiant de l'utilisateur. */
  userId: string;
  /** Identifiant de la ressource concernée. */
  resourceId?: string;
  /** Type de la ressource. */
  resourceType?: string;
  /** Métadonnées additionnelles. */
  details?: Record<string, unknown>;
  /** Adresse IP du client. */
  ipAddress?: string;
  /** User-Agent du client. */
  userAgent?: string;
  /** Niveau de sévérité. */
  severity: AuditSeverity;
  /** ID de corrélation pour le suivi distribué. */
  correlationId: string;
  /** Horodatage de l'événement. */
  createdAt: unknown;
}

// ============================================================
// Mapping sévérité par défaut
// ============================================================

/**
 * Sévérité par défaut pour chaque type d'événement.
 * Les événements sensibles (suppression, violation) sont
 * automatiquement classés `warn` ou `error`.
 */
const DEFAULT_SEVERITY: Partial<Record<AuditEventType, AuditSeverity>> = {
  'auth.password_reset': 'warn',
  'agent.delete': 'warn',
  'task.fail': 'warn',
  'policy.violation': 'error',
  'admin.user_update': 'warn',
  'admin.role_change': 'warn',
  'billing.consume': 'info',
  'billing.purchase': 'info',
  'api_key.revoke': 'warn',
};

// ============================================================
// API publique
// ============================================================

/**
 * Enregistre un événement d'audit dans Firestore.
 * Génère automatiquement un ID de corrélation si non fourni
 * dans `details.correlationId`.
 *
 * L'écriture est asynchrone et les erreurs sont interceptées
 * pour ne jamais bloquer le flux principal de l'application.
 *
 * @param eventType - Type d'événement structuré.
 * @param params - Paramètres de l'événement.
 *
 * @example
 * ```ts
 * await audit('agent.execute', {
 *   userId: 'uid123',
 *   resourceId: 'agent_abc',
 *   resourceType: 'agent',
 *   ipAddress: request.headers.get('x-forwarded-for') || undefined,
 *   userAgent: request.headers.get('user-agent') || undefined,
 *   severity: 'info',
 *   details: { model: 'gpt-4', tokensUsed: 1500 },
 * });
 * ```
 */
export async function audit(
  eventType: AuditEventType,
  params: AuditParams,
): Promise<void> {
  try {
    const now = new Date();

    // Corrélation ID : priorité au champ `details.correlationId`,
    // sinon génération d'un UUID v4.
    const correlationId =
      (params.details?.correlationId as string) || randomUUID();

    // Sévérité : priorité au paramètre, sinon valeur par défaut, sinon `info`.
    const severity: AuditSeverity =
      params.severity ?? DEFAULT_SEVERITY[eventType] ?? 'info';

    // Nettoie `details` pour retirer `correlationId` (on ne le duplique pas)
    const { correlationId: _, ...cleanDetails } = params.details ?? {};

    const entry: Record<string, unknown> = {
      eventType,
      userId: params.userId,
      severity,
      correlationId,
      createdAt: now,
    };

    // Champs optionnels — uniquement inclus s'ils sont définis
    if (params.resourceId) entry.resourceId = params.resourceId;
    if (params.resourceType) entry.resourceType = params.resourceType;
    if (params.ipAddress) entry.ipAddress = params.ipAddress;
    if (params.userAgent) entry.userAgent = params.userAgent;
    if (Object.keys(cleanDetails).length > 0) entry.details = cleanDetails;

    await db.auditLog.create({ data: entry });
  } catch (error) {
    // L'audit ne doit JAMAIS bloquer l'application.
    // On loggue l'erreur en console pour le debugging.
    console.error(`[audit] Échec de l'enregistrement de l'événement ${eventType}:`, error);
  }
}

/**
 * Récupère les entrées d'audit pour un utilisateur.
 * Paginé par curseur pour les grandes collections.
 *
 * @param userId - Identifiant de l'utilisateur.
 * @param options - Options de pagination et filtrage.
 * @returns Entrées d'audit paginées.
 */
export async function getUserAuditLog(
  userId: string,
  options: {
    limit?: number;
    cursor?: string;
    eventType?: AuditEventType;
  } = {},
): Promise<{ items: AuditEntry[]; nextCursor: string | null }> {
  const where: Array<{ field: string; op: string; value: unknown }> = [
    { field: 'userId', op: '==', value: userId },
  ];

  if (options.eventType) {
    where.push({ field: 'eventType', op: '==', value: options.eventType });
  }

  const result = await db.auditLog.paginate({
    where,
    orderBy: [{ field: 'createdAt', direction: 'desc' }],
    limit: options.limit ?? 50,
    cursor: options.cursor,
  });

  return {
    items: result.items as unknown as AuditEntry[],
    nextCursor: result.nextCursor,
  };
}
