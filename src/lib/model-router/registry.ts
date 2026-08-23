/**
 * @module model-router/registry
 * @description Registre central des modèles d'IA de la plateforme Gen3ia.
 * Ce module gère l'enregistrement, la recherche et la sélection
 * intelligente des modèles en fonction de critères multiples.
 */

import type {
  ModelInfo,
  ModelProvider,
  ModelCapability,
  ModelSelectionCriteria,
} from './types';

// ---------------------------------------------------------------------------
// Registre principal
// ---------------------------------------------------------------------------

/**
 * Registre de tous les modèles d'IA disponibles.
 * Clé = identifiant unique du modèle (ex: "openai:gpt-4o").
 * @type {Map<string, ModelInfo>}
 */
export const MODEL_REGISTRY: Map<string, ModelInfo> = new Map();

// ---------------------------------------------------------------------------
// Initialisation des modèles intégrés
// ---------------------------------------------------------------------------

/**
 * Initialise le registre avec les modèles intégrés de tous les fournisseurs.
 * Les tarifs et capacités sont basés sur les données officielles des fournisseurs
 * (mis à jour au 1er semestre 2025).
 */
function initializeBuiltInModels(): void {
  // ---- OpenAI ----
  registerModel({
    id: 'openai:gpt-4o',
    provider: 'openai',
    name: 'gpt-4o',
    displayName: 'GPT-4o',
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputCostPer1k: 0.0025,
    outputCostPer1k: 0.01,
    latencyMs: 450,
    available: true,
    priority: 90,
  });

  registerModel({
    id: 'openai:gpt-4o-mini',
    provider: 'openai',
    name: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.0006,
    latencyMs: 200,
    available: true,
    priority: 80,
  });

  registerModel({
    id: 'openai:gpt-4-turbo',
    provider: 'openai',
    name: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    inputCostPer1k: 0.01,
    outputCostPer1k: 0.03,
    latencyMs: 600,
    available: true,
    priority: 70,
  });

  registerModel({
    id: 'openai:o1-mini',
    provider: 'openai',
    name: 'o1-mini',
    displayName: 'O1 Mini',
    capabilities: ['chat', 'function_calling', 'json_mode'],
    contextWindow: 128_000,
    maxOutputTokens: 65_536,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.012,
    latencyMs: 1200,
    available: true,
    priority: 85,
  });

  registerModel({
    id: 'openai:o1-preview',
    provider: 'openai',
    name: 'o1-preview',
    displayName: 'O1 Preview',
    capabilities: ['chat', 'function_calling', 'json_mode'],
    contextWindow: 128_000,
    maxOutputTokens: 32_768,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.06,
    latencyMs: 2000,
    available: true,
    priority: 75,
  });

  registerModel({
    id: 'openai:gpt-3.5-turbo',
    provider: 'openai',
    name: 'gpt-3.5-turbo',
    displayName: 'GPT-3.5 Turbo',
    capabilities: ['chat', 'function_calling', 'json_mode'],
    contextWindow: 16_385,
    maxOutputTokens: 4_096,
    inputCostPer1k: 0.0005,
    outputCostPer1k: 0.0015,
    latencyMs: 150,
    available: true,
    priority: 50,
  });

  // ---- Anthropic ----
  registerModel({
    id: 'anthropic:claude-sonnet-4-20250514',
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet 4',
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 200_000,
    maxOutputTokens: 16_384,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    latencyMs: 500,
    available: true,
    priority: 92,
  });

  registerModel({
    id: 'anthropic:claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    name: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet',
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    latencyMs: 550,
    available: true,
    priority: 88,
  });

  registerModel({
    id: 'anthropic:claude-3-haiku-20240307',
    provider: 'anthropic',
    name: 'claude-3-haiku-20240307',
    displayName: 'Claude 3 Haiku',
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 200_000,
    maxOutputTokens: 4_096,
    inputCostPer1k: 0.00025,
    outputCostPer1k: 0.00125,
    latencyMs: 250,
    available: true,
    priority: 78,
  });

  // ---- Groq ----
  registerModel({
    id: 'groq:llama-3.3-70b-versatile',
    provider: 'groq',
    name: 'llama-3.3-70b-versatile',
    displayName: 'Llama 3.3 70B (Groq)',
    capabilities: ['chat', 'function_calling', 'json_mode'],
    contextWindow: 128_000,
    maxOutputTokens: 32_768,
    inputCostPer1k: 0.00059,
    outputCostPer1k: 0.00079,
    latencyMs: 80,
    available: true,
    priority: 85,
  });

  registerModel({
    id: 'groq:mixtral-8x7b-32768',
    provider: 'groq',
    name: 'mixtral-8x7b-32768',
    displayName: 'Mixtral 8x7B (Groq)',
    capabilities: ['chat', 'function_calling', 'json_mode'],
    contextWindow: 32_768,
    maxOutputTokens: 8_192,
    inputCostPer1k: 0.00024,
    outputCostPer1k: 0.00024,
    latencyMs: 60,
    available: true,
    priority: 72,
  });

  // ---- HuggingFace ----
  registerModel({
    id: 'huggingface:mistralai/Mistral-7B-Instruct-v0.3',
    provider: 'huggingface',
    name: 'mistralai/Mistral-7B-Instruct-v0.3',
    displayName: 'Mistral 7B Instruct v0.3',
    capabilities: ['chat'],
    contextWindow: 32_768,
    maxOutputTokens: 4_096,
    inputCostPer1k: 0.0,
    outputCostPer1k: 0.0,
    latencyMs: 300,
    available: true,
    priority: 40,
  });

  registerModel({
    id: 'huggingface:meta-llama/Meta-Llama-3.1-70B-Instruct',
    provider: 'huggingface',
    name: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
    displayName: 'Llama 3.1 70B Instruct',
    capabilities: ['chat', 'function_calling', 'json_mode'],
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    inputCostPer1k: 0.0,
    outputCostPer1k: 0.0,
    latencyMs: 400,
    available: true,
    priority: 45,
  });

  registerModel({
    id: 'huggingface:HuggingFaceH4/zephyr-7b-beta',
    provider: 'huggingface',
    name: 'HuggingFaceH4/zephyr-7b-beta',
    displayName: 'Zephyr 7B Beta',
    capabilities: ['chat'],
    contextWindow: 32_768,
    maxOutputTokens: 4_096,
    inputCostPer1k: 0.0,
    outputCostPer1k: 0.0,
    latencyMs: 250,
    available: true,
    priority: 35,
  });

  registerModel({
    id: 'huggingface:BAAI/bge-large-en-v1.5',
    provider: 'huggingface',
    name: 'BAAI/bge-large-en-v1.5',
    displayName: 'BGE Large EN v1.5',
    capabilities: ['embedding'],
    contextWindow: 512,
    maxOutputTokens: 0,
    inputCostPer1k: 0.0,
    outputCostPer1k: 0.0,
    latencyMs: 30,
    available: true,
    priority: 60,
  });

  // ---- OpenRouter ----
  registerModel({
    id: 'openrouter:google/gemini-2.0-flash-001',
    provider: 'openrouter',
    name: 'google/gemini-2.0-flash-001',
    displayName: 'Gemini 2.0 Flash (OpenRouter)',
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
    inputCostPer1k: 0.0001,
    outputCostPer1k: 0.0004,
    latencyMs: 350,
    available: true,
    priority: 82,
  });

  registerModel({
    id: 'openrouter:anthropic/claude-3.5-sonnet',
    provider: 'openrouter',
    name: 'anthropic/claude-3.5-sonnet',
    displayName: 'Claude 3.5 Sonnet (OpenRouter)',
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    latencyMs: 600,
    available: true,
    priority: 65,
  });

  // ---- Local ----
  registerModel({
    id: 'local:local-llm',
    provider: 'local',
    name: 'local-llm',
    displayName: 'LLM Local',
    capabilities: ['chat'],
    contextWindow: 8_192,
    maxOutputTokens: 2_048,
    inputCostPer1k: 0.0,
    outputCostPer1k: 0.0,
    latencyMs: 100,
    available: false,
    priority: 10,
  });
}

// Exécuter l'initialisation au chargement du module
initializeBuiltInModels();

// ---------------------------------------------------------------------------
// Fonctions publiques
// ---------------------------------------------------------------------------

/**
 * Enregistre un nouveau modèle dans le registre.
 * Si un modèle avec le même identifiant existe déjà, il est remplacé.
 *
 * @param {ModelInfo} model - Informations complètes du modèle à enregistrer
 * @returns {void}
 *
 * @example
 * ```ts
 * registerModel({
 *   id: 'openai:gpt-5',
 *   provider: 'openai',
 *   name: 'gpt-5',
 *   displayName: 'GPT-5',
 *   capabilities: ['chat', 'vision', 'function_calling'],
 *   contextWindow: 256_000,
 *   maxOutputTokens: 32_768,
 *   inputCostPer1k: 0.01,
 *   outputCostPer1k: 0.03,
 *   available: true,
 *   priority: 100,
 * });
 * ```
 */
export function registerModel(model: ModelInfo): void {
  MODEL_REGISTRY.set(model.id, model);
}

/**
 * Récupère un modèle par son identifiant.
 *
 * @param {string} modelId - Identifiant unique du modèle (ex: "openai:gpt-4o")
 * @returns {ModelInfo | undefined} Informations du modèle, ou undefined si introuvable
 */
export function getModel(modelId: string): ModelInfo | undefined {
  return MODEL_REGISTRY.get(modelId);
}

/**
 * Filtres applicables lors de la liste des modèles.
 * @interface ModelFilters
 * @property {ModelProvider} [provider] - Filtrer par fournisseur
 * @property {ModelCapability} [capability] - Filtrer par capacité requise
 * @property {boolean} [available] - Filtrer par disponibilité
 */
interface ModelFilters {
  provider?: ModelProvider;
  capability?: ModelCapability;
  available?: boolean;
}

/**
 * Liste tous les modèles correspondant aux filtres optionnels.
 * Si aucun filtre n'est fourni, tous les modèles sont retournés.
 *
 * @param {ModelFilters} [filters] - Critères de filtrage optionnels
 * @returns {ModelInfo[]} Liste des modèles correspondant aux filtres, triés par priorité décroissante
 *
 * @example
 * ```ts
 * // Tous les modèles OpenAI disponibles
 * const openaiModels = listModels({ provider: 'openai', available: true });
 *
 * // Tous les modèles supportant la vision
 * const visionModels = listModels({ capability: 'vision' });
 * ```
 */
export function listModels(filters?: ModelFilters): ModelInfo[] {
  let models = Array.from(MODEL_REGISTRY.values());

  if (filters?.provider) {
    models = models.filter((m) => m.provider === filters.provider);
  }

  if (filters?.capability) {
    models = models.filter((m) => m.capabilities.includes(filters.capability!));
  }

  if (filters?.available !== undefined) {
    models = models.filter((m) => m.available === filters.available);
  }

  // Trier par priorité décroissante
  models.sort((a, b) => b.priority - a.priority);

  return models;
}

/**
 * Calcule un score de correspondance pour un modèle par rapport aux critères donnés.
 * Plus le score est élevé, meilleur est le modèle pour les critères.
 *
 * @param {ModelInfo} model - Modèle à évaluer
 * @param {ModelSelectionCriteria} criteria - Critères de sélection
 * @returns {number} Score de correspondance (-1 si le modèle ne respecte pas les contraintes strictes)
 */
function scoreModel(model: ModelInfo, criteria: ModelSelectionCriteria): number {
  // Vérification stricte : toutes les capacités requises doivent être présentes
  if (criteria.requiredCapabilities && criteria.requiredCapabilities.length > 0) {
    const hasAll = criteria.requiredCapabilities.every((cap) =>
      model.capabilities.includes(cap),
    );
    if (!hasAll) return -1;
  }

  // Vérification de disponibilité
  if (!model.available) return -1;

  // Vérification du coût maximal
  if (criteria.maxCostPer1kInput !== undefined) {
    if (model.inputCostPer1k > criteria.maxCostPer1kInput) return -1;
  }

  // Vérification de la latence maximale
  if (criteria.maxLatencyMs !== undefined && model.latencyMs !== undefined) {
    if (model.latencyMs > criteria.maxLatencyMs) return -1;
  }

  // Calcul du score composite
  let score = 0;

  // Bonus de priorité (0-100)
  score += model.priority * 1.0;

  // Bonus de fournisseur préféré
  if (criteria.preferredProvider && model.provider === criteria.preferredProvider) {
    score += 50;
  }

  // Bonus pour le coût faible (inversement proportionnel au coût)
  if (criteria.preferLowCost) {
    const totalCost = model.inputCostPer1k + model.outputCostPer1k;
    // Plus le coût est bas, plus le bonus est élevé (max 30)
    score += Math.max(0, 30 - totalCost * 1000);
  }

  // Bonus de latence (plus rapide = meilleur)
  if (model.latencyMs !== undefined) {
    // Plus la latence est basse, plus le bonus est élevé (max 20)
    score += Math.max(0, 20 - model.latencyMs * 0.02);
  }

  return score;
}

/**
 * Sélectionne le meilleur modèle correspondant aux critères spécifiés.
 * Le classement est basé sur : correspondance des capacités (toutes obligatoires),
 * disponibilité, coût, latence et priorité.
 *
 * @param {ModelSelectionCriteria} criteria - Critères de sélection
 * @returns {ModelInfo | null} Le meilleur modèle correspondant, ou null si aucun ne convient
 *
 * @example
 * ```ts
 * // Trouver le meilleur modèle pour le chat avec function calling
 * const model = selectBestModel({
 *   requiredCapabilities: ['chat', 'function_calling'],
 *   preferLowCost: true,
 * });
 *
 * // Trouver un modèle rapide pour la vision
 * const visionModel = selectBestModel({
 *   requiredCapabilities: ['vision', 'chat'],
 *   maxLatencyMs: 500,
 *   maxCostPer1kInput: 0.005,
 * });
 * ```
 */
export function selectBestModel(criteria: ModelSelectionCriteria): ModelInfo | null {
  const allModels = Array.from(MODEL_REGISTRY.values());

  let bestModel: ModelInfo | null = null;
  let bestScore = -1;

  for (const model of allModels) {
    const score = scoreModel(model, criteria);
    if (score > bestScore) {
      bestScore = score;
      bestModel = model;
    }
  }

  return bestModel;
}
