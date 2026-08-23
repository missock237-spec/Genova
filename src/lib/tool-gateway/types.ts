/**
 * @module tool-gateway/types
 * @description Définitions de types pour la passerelle d'outils de la plateforme Gen3ia.
 * Ce module contient toutes les interfaces utilisées pour la définition,
 * l'exécution, les permissions et les résultats des outils disponibles.
 */

// ---------------------------------------------------------------------------
// Interfaces principales
// ---------------------------------------------------------------------------

/**
 * Définition complète d'un outil disponible dans la passerelle.
 * Contient les métadonnées, le schéma d'entrée/sortie, les permissions
 * et les contraintes d'exécution.
 *
 * @interface ToolDefinition
 * @property {string} id - Identifiant unique de l'outil dans le registre
 * @property {string} name - Nom lisible de l'outil
 * @property {string} description - Description détaillée de l'outil (pour l'IA)
 * @property {string} category - Catégorie de l'outil (web, compute, storage, etc.)
 * @property {Record<string, unknown>} inputSchema - Schéma JSON des paramètres d'entrée
 * @property {Record<string, unknown>} [outputSchema] - Schéma JSON de la sortie attendue
 * @property {string[]} requiredPermissions - Liste des permissions requises pour l'exécution
 * @property {{ maxPerMinute: number }} [rateLimit] - Limites de débit optionnelles
 * @property {number} timeoutMs - Délai d'attente maximal en millisecondes
 * @property {number} estimatedCostPerCall - Coût estimé par appel en USD
 * @property {boolean} isDestructive - Indique si l'outil modifie de manière irréversible des données
 * @property {string} [connectorType] - Type de connecteur à utiliser (ex: 'http', 'code', 'web_search')
 */
export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  requiredPermissions: string[];
  rateLimit?: { maxPerMinute: number };
  timeoutMs: number;
  estimatedCostPerCall: number;
  isDestructive: boolean;
  connectorType?: string;
}

/**
 * Requête d'exécution d'un outil.
 * Contient l'identifiant de l'outil, les paramètres d'entrée
 * et le contexte d'exécution.
 *
 * @interface ToolExecutionRequest
 * @property {string} toolId - Identifiant de l'outil à exécuter
 * @property {Record<string, unknown>} input - Paramètres d'entrée de l'outil
 * @property {string} userId - Identifiant de l'utilisateur qui déclenche l'exécution
 * @property {string} [agentId] - Identifiant de l'agent qui exécute l'outil
 * @property {string} [executionId] - Identifiant unique de l'exécution (pour le traçage)
 * @property {number} [timeoutMs] - Délai d'attente personnalisé (surcharge celui de l'outil)
 */
export interface ToolExecutionRequest {
  toolId: string;
  input: Record<string, unknown>;
  userId: string;
  agentId?: string;
  executionId?: string;
  timeoutMs?: number;
}

/**
 * Résultat normalisé d'une exécution d'outil.
 *
 * @interface ToolExecutionResult
 * @property {boolean} success - Indique si l'exécution a réussi
 * @property {Record<string, unknown>} output - Données de sortie de l'outil
 * @property {string} [error] - Message d'erreur en cas d'échec
 * @property {number} durationMs - Durée réelle de l'exécution en millisecondes
 * @property {number} [tokensUsed] - Nombre de tokens utilisés (si applicable)
 * @property {number} [costUsd] - Coût réel de l'exécution en USD
 */
export interface ToolExecutionResult {
  success: boolean;
  output: Record<string, unknown>;
  error?: string;
  durationMs: number;
  tokensUsed?: number;
  costUsd?: number;
}

/**
 * Enregistrement de permission pour un outil.
 * Définit les conditions dans lesquelles un utilisateur ou un agent
 * est autorisé à utiliser un outil spécifique.
 *
 * @interface ToolPermission
 * @property {string} toolId - Identifiant de l'outil concerné
 * @property {string} [agentId] - Identifiant de l'agent (si applicable)
 * @property {string} userId - Identifiant de l'utilisateur
 * @property {string} grantedBy - Identifiant de l'utilisateur ou du système qui a accordé la permission
 * @property {Date} grantedAt - Date et heure de l'octroi de la permission
 * @property {Date} [expiresAt] - Date d'expiration de la permission (optionnel)
 * @property {Record<string, unknown>} [conditions] - Conditions supplémentaires d'utilisation
 */
export interface ToolPermission {
  toolId: string;
  agentId?: string;
  userId: string;
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date;
  conditions?: Record<string, unknown>;
}
