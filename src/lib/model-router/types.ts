/**
 * @module model-router/types
 * @description Définitions de types pour le routeur de modèles de la plateforme Gen3ia.
 * Ce module contient toutes les interfaces et alias de types utilisés
 * pour la sélection, la configuration et l'exécution des modèles d'IA.
 */

// ---------------------------------------------------------------------------
// Énumérations et alias de base
// ---------------------------------------------------------------------------

/**
 * Fournisseurs de modèles d'IA pris en charge par la plateforme.
 * Chaque fournisseur dispose de son propre adaptateur de communication.
 * @typedef {'openai' | 'anthropic' | 'groq' | 'huggingface' | 'openrouter' | 'local'} ModelProvider
 */
export type ModelProvider =
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'huggingface'
  | 'openrouter'
  | 'local';

/**
 * Capacités fonctionnelles d'un modèle d'IA.
 * Utilisé pour filtrer et sélectionner les modèles selon les besoins.
 * @typedef {'chat' | 'completion' | 'embedding' | 'image_generation' | 'audio_transcription' | 'audio_generation' | 'vision' | 'function_calling' | 'json_mode'} ModelCapability
 */
export type ModelCapability =
  | 'chat'
  | 'completion'
  | 'embedding'
  | 'image_generation'
  | 'audio_transcription'
  | 'audio_generation'
  | 'vision'
  | 'function_calling'
  | 'json_mode';

// ---------------------------------------------------------------------------
// Interfaces principales
// ---------------------------------------------------------------------------

/**
 * Informations complètes sur un modèle d'IA enregistré.
 * Contient les métadonnées, les capacités, la tarification et les limites.
 *
 * @interface ModelInfo
 * @property {string} id - Identifiant unique du modèle dans le registre
 * @property {ModelProvider} provider - Fournisseur du modèle
 * @property {string} name - Nom technique du modèle (ex: "gpt-4o")
 * @property {string} displayName - Nom d'affichage lisible par l'utilisateur
 * @property {ModelCapability[]} capabilities - Liste des capacités supportées
 * @property {number} contextWindow - Taille de la fenêtre de contexte en tokens
 * @property {number} maxOutputTokens - Nombre maximal de tokens en sortie
 * @property {number} inputCostPer1k - Coût d'entrée pour 1000 tokens en USD
 * @property {number} outputCostPer1k - Coût de sortie pour 1000 tokens en USD
 * @property {number} [latencyMs] - Latence moyenne mesurée en millisecondes
 * @property {boolean} available - Indique si le modèle est actuellement disponible
 * @property {number} priority - Priorité de sélection (plus élevé = préféré)
 */
export interface ModelInfo {
  id: string;
  provider: ModelProvider;
  name: string;
  displayName: string;
  capabilities: ModelCapability[];
  contextWindow: number;
  maxOutputTokens: number;
  inputCostPer1k: number;
  outputCostPer1k: number;
  latencyMs?: number;
  available: boolean;
  priority: number;
}

/**
 * Représentation d'un contenu multimédia dans un message.
 * @interface MessageContentPart
 * @property {string} type - Type du contenu (text, image_url, etc.)
 * @property {string} [text] - Texte du contenu (si type === 'text')
 * @property {{ url: string }} [image_url] - URL de l'image (si type === 'image_url')
 */
export interface MessageContentPart {
  type: string;
  text?: string;
  image_url?: { url: string };
}

/**
 * Représentation d'un appel d'outil dans la réponse du modèle.
 * @interface ToolCall
 * @property {string} id - Identifiant unique de l'appel d'outil
 * @property {'function'} type - Type de l'appel (toujours 'function')
 * @property {{ name: string; arguments: string }} function - Détails de la fonction appelée
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Définition d'un outil pour le function calling.
 * @interface ToolDefinitionRequest
 * @property {'function'} type - Type de l'outil
 * @property {{ name: string; description: string; parameters: Record<string, unknown> }} function - Description de la fonction
 */
export interface ToolDefinitionRequest {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Message individuel dans une conversation avec un modèle d'IA.
 * @interface Message
 * @property {'system' | 'user' | 'assistant' | 'tool'} role - Rôle de l'émetteur du message
 * @property {string | MessageContentPart[]} content - Contenu du message (texte ou multimédia)
 * @property {any} [tool_calls] - Appels d'outils demandés par l'assistant
 * @property {string} [tool_call_id] - Identifiant de l'appel d'outil (pour les messages de type 'tool')
 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | MessageContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/**
 * Format de réponse demandé pour le modèle.
 * @interface ResponseFormat
 * @property {'json_object' | 'text'} type - Type de format de réponse
 */
export interface ResponseFormat {
  type: 'json_object' | 'text';
}

/**
 * Requête complète pour l'exécution d'un modèle d'IA.
 * Contient tous les paramètres nécessaires pour une inférence.
 *
 * @interface ModelRequest
 * @property {string} model - Identifiant du modèle à utiliser
 * @property {Message[]} messages - Historique des messages de la conversation
 * @property {number} [temperature] - Température de génération (0.0 à 2.0)
 * @property {number} [maxTokens] - Nombre maximal de tokens en sortie
 * @property {ToolDefinitionRequest[]} [tools] - Liste des outils disponibles pour le function calling
 * @property {string | object} [toolChoice] - Contrôle du choix d'outils ('auto', 'none', ou objet spécifique)
 * @property {ResponseFormat} [responseFormat] - Format de réponse souhaité
 * @property {boolean} [stream] - Active le mode flux (streaming)
 * @property {string} [userId] - Identifiant de l'utilisateur pour le suivi d'usage
 * @property {Record<string, unknown>} [metadata] - Métadonnées supplémentaires
 */
export interface ModelRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinitionRequest[];
  toolChoice?: string | object;
  responseFormat?: ResponseFormat;
  stream?: boolean;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Statistiques d'utilisation des tokens pour une requête.
 * @interface TokenUsage
 * @property {number} promptTokens - Nombre de tokens utilisés dans le prompt
 * @property {number} completionTokens - Nombre de tokens générés en réponse
 * @property {number} totalTokens - Nombre total de tokens (prompt + complétion)
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Réponse normalisée d'un modèle d'IA.
 * Format uniforme indépendant du fournisseur.
 *
 * @interface ModelResponse
 * @property {string} id - Identifiant unique de la réponse
 * @property {string} model - Nom du modèle utilisé
 * @property {ModelProvider} provider - Fournisseur du modèle
 * @property {string} content - Contenu textuel de la réponse
 * @property {ToolCall[]} [toolCalls] - Appels d'outils demandés par le modèle
 * @property {TokenUsage} usage - Statistiques de consommation de tokens
 * @property {string} finishReason - Raison d'arrêt de la génération (stop, tool_calls, length, etc.)
 * @property {number} latencyMs - Latence totale de la requête en millisecondes
 */
export interface ModelResponse {
  id: string;
  model: string;
  provider: ModelProvider;
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  finishReason: string;
  latencyMs: number;
}

/**
 * Critères de sélection d'un modèle optimal.
 * Utilisé par le registre pour trouver le meilleur modèle correspondant.
 *
 * @interface ModelSelectionCriteria
 * @property {ModelCapability[]} [requiredCapabilities] - Capacités obligatoires que le modèle doit posséder
 * @property {number} [maxCostPer1kInput] - Coût maximal autorisé pour 1000 tokens d'entrée
 * @property {number} [maxLatencyMs] - Latence maximale acceptable en millisecondes
 * @property {ModelProvider} [preferredProvider] - Fournisseur préféré
 * @property {boolean} [preferLowCost] - Préférer les modèles les moins chers
 * @property {string} [userId] - Identifiant utilisateur pour personnaliser la sélection
 */
export interface ModelSelectionCriteria {
  requiredCapabilities?: ModelCapability[];
  maxCostPer1kInput?: number;
  maxLatencyMs?: number;
  preferredProvider?: ModelProvider;
  preferLowCost?: boolean;
  userId?: string;
}
