/**
 * @module tool-gateway/registry
 * @description Registre des outils intégrés de la plateforme Gen3ia.
 * Ce module gère l'enregistrement, la recherche et le filtrage
 * des outils disponibles pour les agents et les utilisateurs.
 */

import type { ToolDefinition } from './types';

// ---------------------------------------------------------------------------
// Registre interne et registre des outils intégrés
// ---------------------------------------------------------------------------

/**
 * Registre interne de tous les outils enregistrés.
 * Clé = identifiant unique de l'outil.
 * @internal
 */
const toolRegistry: Map<string, ToolDefinition> = new Map();

/**
 * Outils intégrés prédéfinis dans la plateforme.
 * Ces outils sont automatiquement disponibles au démarrage.
 *
 * @type {Record<string, ToolDefinition>}
 */
export const BUILT_IN_TOOLS: Record<string, ToolDefinition> = {
  web_search: {
    id: 'web_search',
    name: 'Recherche Web',
    description:
      'Effectue une recherche sur le web et retourne les résultats les plus pertinents. ' +
      'Utile pour retrouver des informations actualisées, des faits ou des ressources en ligne.',
    category: 'web',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Requête de recherche à effectuer',
        },
        maxResults: {
          type: 'number',
          description: 'Nombre maximal de résultats à retourner (par défaut 5)',
          default: 5,
        },
      },
      required: ['query'],
    },
    requiredPermissions: ['web:read'],
    rateLimit: { maxPerMinute: 20 },
    timeoutMs: 15_000,
    estimatedCostPerCall: 0.001,
    isDestructive: false,
    connectorType: 'web_search',
  },

  code_execute: {
    id: 'code_execute',
    name: 'Exécution de Code',
    description:
      'Exécute du code dans un environnement bac à sable (sandbox) sécurisé. ' +
      'Supporte plusieurs langages (Python, JavaScript, etc.). ' +
      'Les résultats de l\'exécution sont retournés avec stdout et stderr.',
    category: 'compute',
    inputSchema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          description: 'Langage de programmation (python, javascript, typescript, etc.)',
          enum: ['python', 'javascript', 'typescript'],
        },
        code: {
          type: 'string',
          description: 'Code source à exécuter',
        },
        timeout: {
          type: 'number',
          description: 'Délai d\'attente personnalisé en secondes (par défaut 30)',
          default: 30,
        },
      },
      required: ['language', 'code'],
    },
    requiredPermissions: ['compute:execute'],
    rateLimit: { maxPerMinute: 10 },
    timeoutMs: 30_000,
    estimatedCostPerCall: 0.005,
    isDestructive: true,
    connectorType: 'code',
  },

  file_read: {
    id: 'file_read',
    name: 'Lecture de Fichier',
    description:
      'Lit le contenu d\'un fichier depuis le système de stockage. ' +
      'Retourne le contenu textuel du fichier. ' +
      'Limité aux fichiers accessibles par l\'utilisateur ou l\'agent.',
    category: 'storage',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Chemin du fichier à lire',
        },
        encoding: {
          type: 'string',
          description: 'Encodage du fichier (par défaut utf-8)',
          default: 'utf-8',
        },
      },
      required: ['path'],
    },
    requiredPermissions: ['storage:read'],
    rateLimit: { maxPerMinute: 60 },
    timeoutMs: 5_000,
    estimatedCostPerCall: 0.0,
    isDestructive: false,
  },

  file_write: {
    id: 'file_write',
    name: 'Écriture de Fichier',
    description:
      'Écrit du contenu dans un fichier. Si le fichier existe, son contenu est remplacé. ' +
      'Crée les répertoires parents si nécessaire. ' +
      'Attention : cette opération est irréversible.',
    category: 'storage',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Chemin du fichier à écrire',
        },
        content: {
          type: 'string',
          description: 'Contenu à écrire dans le fichier',
        },
        encoding: {
          type: 'string',
          description: 'Encodage du fichier (par défaut utf-8)',
          default: 'utf-8',
        },
      },
      required: ['path', 'content'],
    },
    requiredPermissions: ['storage:write'],
    rateLimit: { maxPerMinute: 30 },
    timeoutMs: 10_000,
    estimatedCostPerCall: 0.0,
    isDestructive: true,
  },

  database_query: {
    id: 'database_query',
    name: 'Requête de Base de Données',
    description:
      'Exécute une requête SQL en lecture seule sur la base de données. ' +
      'Seules les requêtes SELECT sont autorisées pour des raisons de sécurité. ' +
      'Retourne les résultats sous forme de tableau d\'objets.',
    category: 'data',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Requête SQL SELECT à exécuter',
        },
        params: {
          type: 'array',
          description: 'Paramètres de la requête préparée',
          items: {},
        },
      },
      required: ['query'],
    },
    requiredPermissions: ['data:read'],
    rateLimit: { maxPerMinute: 30 },
    timeoutMs: 15_000,
    estimatedCostPerCall: 0.0,
    isDestructive: false,
  },

  http_request: {
    id: 'http_request',
    name: 'Requête HTTP',
    description:
      'Effectue une requête HTTP vers une URL spécifiée. ' +
      'Supporte les méthodes GET, POST, PUT, DELETE, PATCH. ' +
      'Retourne le statut, les en-têtes et le corps de la réponse.',
    category: 'integration',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL cible de la requête',
        },
        method: {
          type: 'string',
          description: 'Méthode HTTP (GET, POST, PUT, DELETE, PATCH)',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
          default: 'GET',
        },
        headers: {
          type: 'object',
          description: 'En-têtes HTTP à inclure dans la requête',
          additionalProperties: { type: 'string' },
        },
        body: {
          type: 'string',
          description: 'Corps de la requête (pour POST, PUT, PATCH)',
        },
      },
      required: ['url'],
    },
    requiredPermissions: ['integration:http'],
    rateLimit: { maxPerMinute: 30 },
    timeoutMs: 20_000,
    estimatedCostPerCall: 0.0,
    isDestructive: false,
    connectorType: 'http',
  },

  email_send: {
    id: 'email_send',
    name: 'Envoi d\'E-mail',
    description:
      'Envoie un e-mail à un ou plusieurs destinataires. ' +
      'Supporte le format HTML et les pièces jointes. ' +
      'Attention : cette opération est irréversible, l\'e-mail ne peut pas être rappelé.',
    category: 'communication',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'array',
          description: 'Liste des adresses e-mail des destinataires',
          items: { type: 'string' },
        },
        subject: {
          type: 'string',
          description: 'Objet de l\'e-mail',
        },
        body: {
          type: 'string',
          description: 'Corps de l\'e-mail (supporte le HTML)',
        },
        isHtml: {
          type: 'boolean',
          description: 'Indique si le corps est en HTML (par défaut false)',
          default: false,
        },
      },
      required: ['to', 'subject', 'body'],
    },
    requiredPermissions: ['communication:email:send'],
    rateLimit: { maxPerMinute: 10 },
    timeoutMs: 10_000,
    estimatedCostPerCall: 0.001,
    isDestructive: true,
  },

  browser_navigate: {
    id: 'browser_navigate',
    name: 'Navigation Navigateur',
    description:
      'Automatise la navigation dans un navigateur web. ' +
      'Permet de naviguer vers des pages, cliquer sur des éléments, ' +
      'remplir des formulaires et extraire du contenu. ' +
      'Utile pour les tâches d\'automatisation web.',
    category: 'web',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL de la page à visiter',
        },
        action: {
          type: 'string',
          description: 'Action à effectuer (navigate, click, fill, screenshot, extract)',
          enum: ['navigate', 'click', 'fill', 'screenshot', 'extract'],
          default: 'navigate',
        },
        selector: {
          type: 'string',
          description: 'Sélecteur CSS pour les actions click/fill',
        },
        value: {
          type: 'string',
          description: 'Valeur à insérer pour l\'action fill',
        },
      },
      required: ['url'],
    },
    requiredPermissions: ['web:browse'],
    rateLimit: { maxPerMinute: 10 },
    timeoutMs: 30_000,
    estimatedCostPerCall: 0.005,
    isDestructive: false,
  },
};

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/**
 * Enregistre tous les outils intégrés dans le registre interne.
 * Exécuté automatiquement au chargement du module.
 * @internal
 */
for (const [id, tool] of Object.entries(BUILT_IN_TOOLS)) {
  toolRegistry.set(id, tool);
}

// ---------------------------------------------------------------------------
// Fonctions publiques
// ---------------------------------------------------------------------------

/**
 * Enregistre un nouvel outil dans le registre.
 * Si un outil avec le même identifiant existe déjà, il est remplacé.
 *
 * @param {ToolDefinition} tool - Définition complète de l'outil à enregistrer
 * @returns {void}
 *
 * @example
 * ```ts
 * registerTool({
 *   id: 'slack_send',
 *   name: 'Envoi Slack',
 *   description: 'Envoie un message sur un canal Slack',
 *   category: 'communication',
 *   inputSchema: {
 *     type: 'object',
 *     properties: {
 *       channel: { type: 'string' },
 *       message: { type: 'string' },
 *     },
 *     required: ['channel', 'message'],
 *   },
 *   requiredPermissions: ['communication:slack:send'],
 *   timeoutMs: 5000,
 *   estimatedCostPerCall: 0.0,
 *   isDestructive: false,
 * });
 * ```
 */
export function registerTool(tool: ToolDefinition): void {
  toolRegistry.set(tool.id, tool);
}

/**
 * Récupère un outil par son identifiant.
 *
 * @param {string} toolId - Identifiant unique de l'outil
 * @returns {ToolDefinition | undefined} Définition de l'outil, ou undefined si introuvable
 */
export function getTool(toolId: string): ToolDefinition | undefined {
  return toolRegistry.get(toolId);
}

/**
 * Filtres applicables lors de la liste des outils.
 * @interface ToolFilters
 * @property {string} [category] - Filtrer par catégorie
 * @property {string} [agentId] - Filtrer par agent (réservé pour un usage futur avec les permissions par agent)
 */
interface ToolFilters {
  category?: string;
  agentId?: string;
}

/**
 * Liste tous les outils correspondant aux filtres optionnels.
 * Si aucun filtre n'est fourni, tous les outils sont retournés.
 *
 * @param {ToolFilters} [filters] - Critères de filtrage optionnels
 * @returns {ToolDefinition[]} Liste des outils correspondant aux filtres
 *
 * @example
 * ```ts
 * // Tous les outils de la catégorie web
 * const webTools = listTools({ category: 'web' });
 * ```
 */
export function listTools(filters?: ToolFilters): ToolDefinition[] {
  let tools = Array.from(toolRegistry.values());

  if (filters?.category) {
    tools = tools.filter((t) => t.category === filters.category);
  }

  // L'agentId est réservé pour un filtrage futur basé sur les permissions par agent.
  // Pour le moment, il n'affecte pas le résultat.

  return tools;
}
