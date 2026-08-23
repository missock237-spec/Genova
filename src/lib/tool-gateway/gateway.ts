/**
 * @module tool-gateway/gateway
 * @description Passerelle centrale d'exécution des outils de la plateforme Gen3ia.
 * Ce module orchestre l'exécution des outils en gérant les permissions,
 * la validation des entrées, la limitation de débit et le routage
 * vers les connecteurs appropriés.
 */

import type { ToolExecutionRequest, ToolExecutionResult } from './types';
import { getTool } from './registry';
import { executeHttpRequest } from './connectors/http';
import { executeCode } from './connectors/code';
import { webSearch } from './connectors/web-search';

// ---------------------------------------------------------------------------
// Limitation de débit en mémoire
// ---------------------------------------------------------------------------

/**
 * Fenêtre de limitation de débit en mémoire.
 * @interface RateLimitWindow
 * @property {number} count - Nombre d'appels dans la fenêtre courante
 * @property {number} windowStart - Timestamp de début de la fenêtre en millisecondes
 * @internal
 */
interface RateLimitWindow {
  count: number;
  windowStart: number;
}

/**
 * Stockage en mémoire des compteurs de limitation de débit.
 * Clé = `${userId}:${toolId}`.
 * @internal
 */
const rateLimitStore: Map<string, RateLimitWindow> = new Map();

/**
 * Durée d'une fenêtre de limitation de débit en millisecondes (60 secondes).
 * @internal
 */
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Nombre maximal de requêtes par minute par défaut (si non spécifié par l'outil).
 * @internal
 */
const DEFAULT_RATE_LIMIT = 60;

/**
 * Nettoie périodiquement les entrées expirées du registre de limitation de débit.
 * Exécuté toutes les 5 minutes.
 * @internal
 */
function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, window] of rateLimitStore.entries()) {
    if (now - window.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitStore.delete(key);
    }
  }
}

// Nettoyage automatique toutes les 5 minutes
setInterval(cleanupRateLimits, 5 * 60_000);

/**
 * Vérifie et met à jour la limitation de débit pour un utilisateur et un outil.
 *
 * @param {string} userId - Identifiant de l'utilisateur
 * @param {string} toolId - Identifiant de l'outil
 * @param {number} maxPerMinute - Nombre maximal d'appels par minute
 * @returns {boolean} true si la requête est autorisée, false si la limite est atteinte
 * @internal
 */
function checkRateLimit(userId: string, toolId: string, maxPerMinute: number): boolean {
  const key = `${userId}:${toolId}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // Aucune entrée existante — premier appel
  if (!entry) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return true;
  }

  // Si la fenêtre a expiré, réinitialiser le compteur
  if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return true;
  }

  // Vérifier si la limite est atteinte
  if (entry.count >= maxPerMinute) {
    return false;
  }

  // Incrémenter le compteur
  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Validation des entrées
// ---------------------------------------------------------------------------

/**
 * Résultat de la validation d'un schéma JSON.
 * @interface ValidationResult
 * @property {boolean} valid - Indique si la validation a réussi
 * @property {string[]} errors - Liste des erreurs de validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Types primitifs supportés par la validation.
 * @internal
 */
const JSON_SCHEMA_TYPES = ['string', 'number', 'boolean', 'object', 'array', 'null', 'integer'];

/**
 * Valide une entrée d'outil contre un schéma JSON basique.
 * Supporte la vérification des champs obligatoires et des types.
 *
 * Cette implémentation gère :
 * - La vérification des champs `required`
 * - La vérification du `type` pour les primitives
 * - La vérification de `enum` pour les valeurs énumérées
 * - La validation basique des tableaux et objets
 *
 * @param {Record<string, unknown>} input - Données d'entrée à valider
 * @param {Record<string, unknown>} schema - Schéma JSON de validation
 * @returns {ValidationResult} Résultat de la validation avec les erreurs éventuelles
 *
 * @example
 * ```ts
 * const result = validateInput(
 *   { query: 'test', maxResults: 5 },
 *   {
 *     type: 'object',
 *     properties: {
 *       query: { type: 'string' },
 *       maxResults: { type: 'number' },
 *     },
 *     required: ['query'],
 *   },
 * );
 * console.log(result.valid); // true
 * ```
 */
export function validateInput(
  input: Record<string, unknown>,
  schema: Record<string, unknown>,
): ValidationResult {
  const errors: string[] = [];

  // Vérifier que l'entrée est un objet
  if (schema.type === 'object' && (typeof input !== 'object' || input === null || Array.isArray(input))) {
    errors.push('L\'entrée doit être un objet.');
    return { valid: false, errors };
  }

  // Si le schéma n'est pas de type object, validation minimale
  if (schema.type !== 'object') {
    return { valid: true, errors: [] };
  }

  const properties = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
  const required = (schema.required as string[]) ?? [];

  // Vérification des champs obligatoires
  for (const fieldName of required) {
    if (!(fieldName in input)) {
      errors.push(`Champ obligatoire manquant : "${fieldName}".`);
    }
  }

  // Vérification des types de chaque propriété fournie
  for (const [fieldName, value] of Object.entries(input)) {
    const propSchema = properties[fieldName];
    if (!propSchema) continue;

    const expectedType = propSchema.type as string | undefined;
    if (!expectedType) continue;

    // Validation du type
    if (expectedType === 'string' && typeof value !== 'string') {
      errors.push(`Le champ "${fieldName}" doit être de type string, reçu : ${typeof value}.`);
    } else if (expectedType === 'number' && typeof value !== 'number') {
      errors.push(`Le champ "${fieldName}" doit être de type number, reçu : ${typeof value}.`);
    } else if (expectedType === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) {
      errors.push(`Le champ "${fieldName}" doit être de type integer, reçu : ${typeof value}.`);
    } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
      errors.push(`Le champ "${fieldName}" doit être de type boolean, reçu : ${typeof value}.`);
    } else if (expectedType === 'array' && !Array.isArray(value)) {
      errors.push(`Le champ "${fieldName}" doit être de type array, reçu : ${typeof value}.`);
    } else if (expectedType === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
      errors.push(`Le champ "${fieldName}" doit être de type object, reçu : ${typeof value}.`);
    }

    // Validation de l'énumération
    if (propSchema.enum && Array.isArray(propSchema.enum)) {
      const enumValues = propSchema.enum as unknown[];
      if (!enumValues.includes(value)) {
        errors.push(
          `Le champ "${fieldName}" doit être l'une des valeurs suivantes : [${enumValues.join(', ')}]. Valeur reçue : ${JSON.stringify(value)}.`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Vérification des permissions
// ---------------------------------------------------------------------------

/**
 * Vérifie si un utilisateur (ou un agent) a la permission d'utiliser un outil.
 * Utilise la collection `tool_permissions` de la base de données.
 *
 * Stratégie de sécurité actuelle :
 * - Si un enregistrement de permission existe et est valide → vérifier les conditions
 * - Si aucun enregistrement n'existe → autoriser par défaut (politique permissive)
 * - Si l'enregistrement a expiré → refuser l'accès
 *
 * @param {string} toolId - Identifiant de l'outil
 * @param {string} userId - Identifiant de l'utilisateur
 * @param {string} [agentId] - Identifiant de l'agent (optionnel)
 * @returns {Promise<boolean>} true si l'outil est autorisé, false sinon
 *
 * @example
 * ```ts
 * const allowed = await checkToolPermission('web_search', 'user-123');
 * if (!allowed) throw new Error('Permission refusée.');
 * ```
 */
export async function checkToolPermission(
  toolId: string,
  userId: string,
  agentId?: string,
): Promise<boolean> {
  try {
    const db = await import('@/lib/db').catch(() => null);
    if (!db || !db.toolPermission) {
      // Base de données non disponible — autoriser par défaut
      return true;
    }

    // Rechercher une permission explicite pour cet utilisateur/outil/agent
    const whereClause: Record<string, unknown> = {
      toolId,
      userId,
    };

    if (agentId) {
      whereClause.agentId = agentId;
    }

    // @ts-expect-error — accès dynamique au modèle Prisma
    const permission = await db.toolPermission.findFirst({
      where: whereClause,
      orderBy: { grantedAt: 'desc' },
    });

    // Si aucune permission n'est enregistrée → autoriser par défaut
    if (!permission) {
      return true;
    }

    // Vérifier l'expiration
    if (permission.expiresAt && new Date(permission.expiresAt) < new Date()) {
      return false;
    }

    return true;
  } catch {
    // En cas d'erreur de base de données, autoriser par défaut
    // (ne pas bloquer l'exécution à cause d'un problème de permissions)
    return true;
  }
}

// ---------------------------------------------------------------------------
// Journal d'audit
// ---------------------------------------------------------------------------

/**
 * Enregistre l'exécution d'un outil dans le journal d'audit de manière non-bloquante.
 *
 * @param {ToolExecutionRequest} request - Requête d'exécution
 * @param {ToolExecutionResult} result - Résultat de l'exécution
 * @param {string} toolName - Nom de l'outil
 * @internal
 */
async function logExecution(
  request: ToolExecutionRequest,
  result: ToolExecutionResult,
  toolName: string,
): Promise<void> {
  try {
    const db = await import('@/lib/db').catch(() => null);
    if (!db || !db.auditLog) return;

    // @ts-expect-error — accès dynamique au modèle Prisma
    db.auditLog.create({
      data: {
        action: 'tool_execute',
        userId: request.userId,
        agentId: request.agentId ?? null,
        resourceId: request.toolId,
        details: {
          toolName,
          toolId: request.toolId,
          executionId: request.executionId,
          success: result.success,
          durationMs: result.durationMs,
          costUsd: result.costUsd,
          error: result.error,
        },
        timestamp: new Date(),
      },
    }).catch(() => {
      /* échec silencieux du journal d'audit */
    });
  } catch {
    /* Le journal d'audit ne doit jamais bloquer */
  }
}

// ---------------------------------------------------------------------------
// Exécution via les connecteurs
// ---------------------------------------------------------------------------

/**
 * Route et exécute l'outil via le connecteur approprié.
 *
 * @param {string} connectorType - Type de connecteur à utiliser
 * @param {Record<string, unknown>} input - Paramètres d'entrée
 * @returns {Promise<Record<string, unknown>>} Résultat de l'exécution du connecteur
 * @throws {Error} Si le connecteur n'est pas supporté
 * @internal
 */
async function routeToConnector(
  connectorType: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (connectorType) {
    case 'http':
      return executeHttpRequest({
        url: input.url as string,
        method: input.method as string | undefined,
        headers: input.headers as Record<string, string> | undefined,
        body: input.body as string | undefined,
      });

    case 'code':
      return executeCode({
        language: input.language as string,
        code: input.code as string,
        timeout: input.timeout as number | undefined,
      });

    case 'web_search':
      return webSearch({
        query: input.query as string,
        maxResults: input.maxResults as number | undefined,
      });

    default:
      throw new Error(
        `Connecteur non supporté : "${connectorType}". Connecteurs disponibles : http, code, web_search.`,
      );
  }
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

/**
 * Exécute un outil via la passerelle centrale.
 *
 * Cette fonction est le point d'entrée principal de la passerelle d'outils.
 * Elle effectue les étapes suivantes :
 * 1. Recherche l'outil dans le registre
 * 2. Vérifie les permissions de l'utilisateur
 * 3. Valide les entrées contre le schéma de l'outil
 * 4. Vérifie la limitation de débit
 * 5. Exécute l'outil avec un délai d'attente
 * 6. Route vers le connecteur approprié
 * 7. Enregistre l'exécution dans le journal d'audit (non-bloquant)
 * 8. Retourne le résultat normalisé
 *
 * @param {ToolExecutionRequest} request - Requête d'exécution complète
 * @returns {Promise<ToolExecutionResult>} Résultat normalisé de l'exécution
 * @throws {Error} Si l'outil est introuvable, si les permissions sont refusées,
 *                   si la validation échoue, ou si la limite de débit est atteinte
 *
 * @example
 * ```ts
 * const result = await executeTool({
 *   toolId: 'http_request',
 *   input: { url: 'https://api.example.com/data' },
 *   userId: 'user-123',
 *   agentId: 'agent-456',
 * });
 *
 * if (result.success) {
 *   console.log('Résultat :', result.output);
 * } else {
 *   console.error('Erreur :', result.error);
 * }
 * console.log(`Durée : ${result.durationMs}ms`);
 * ```
 */
export async function executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
  const startTime = Date.now();

  // Étape 1 : Recherche de l'outil dans le registre
  const tool = getTool(request.toolId);
  if (!tool) {
    return {
      success: false,
      output: {},
      error: `Outil introuvable : "${request.toolId}". Vérifiez que l'outil est enregistré dans le registre.`,
      durationMs: Date.now() - startTime,
    };
  }

  // Étape 2 : Vérification des permissions
  const hasPermission = await checkToolPermission(
    request.toolId,
    request.userId,
    request.agentId,
  );
  if (!hasPermission) {
    return {
      success: false,
      output: {},
      error: `Permission refusée pour l'outil "${tool.name}" (${request.toolId}). L'utilisateur "${request.userId}" n'a pas les droits nécessaires.`,
      durationMs: Date.now() - startTime,
    };
  }

  // Étape 3 : Validation des entrées
  const validation = validateInput(request.input, tool.inputSchema);
  if (!validation.valid) {
    return {
      success: false,
      output: {},
      error: `Validation des entrées échouée pour l'outil "${tool.name}": ${validation.errors.join(' ')}`,
      durationMs: Date.now() - startTime,
    };
  }

  // Étape 4 : Vérification de la limitation de débit
  const maxPerMinute = tool.rateLimit?.maxPerMinute ?? DEFAULT_RATE_LIMIT;
  if (!checkRateLimit(request.userId, request.toolId, maxPerMinute)) {
    return {
      success: false,
      output: {},
      error: `Limite de débit atteinte pour l'outil "${tool.name}". Maximum ${maxPerMinute} appels par minute.`,
      durationMs: Date.now() - startTime,
    };
  }

  // Étape 5 et 6 : Exécution avec délai d'attente et routage vers le connecteur
  const effectiveTimeoutMs = request.timeoutMs ?? tool.timeoutMs;

  // Si l'outil n'a pas de connecteur, retourner une erreur
  if (!tool.connectorType) {
    return {
      success: false,
      output: {},
      error: `L'outil "${tool.name}" n'a pas de connecteur configuré. Le champ "connectorType" est manquant.`,
      durationMs: Date.now() - startTime,
    };
  }

  let output: Record<string, unknown>;

  try {
    // Exécution avec AbortController pour le délai d'attente
    const executionPromise = routeToConnector(tool.connectorType, request.input);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`L'exécution de l'outil "${tool.name}" a expiré après ${effectiveTimeoutMs}ms.`));
      }, effectiveTimeoutMs);
    });

    output = await Promise.race([executionPromise, timeoutPromise]);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: {},
      error: `Erreur lors de l'exécution de l'outil "${tool.name}": ${errorMessage}`,
      durationMs: Date.now() - startTime,
    };
  }

  // Construction du résultat
  const durationMs = Date.now() - startTime;
  const result: ToolExecutionResult = {
    success: true,
    output,
    durationMs,
    costUsd: tool.estimatedCostPerCall,
  };

  // Étape 7 : Journal d'audit (non-bloquant)
  logExecution(request, result, tool.name).catch(() => {
    /* ne jamais bloquer sur le journal */
  });

  return result;
}
