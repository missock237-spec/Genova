/**
 * @module model-router
 * @description Point d'entrée principal du routeur de modèles Gen3ia.
 * Ce module ré-exporte tous les types, fonctions de registre et fonctions
 * de routage pour un accès unifié depuis n'importe quel composant de la plateforme.
 */

// --- Types ---
export type {
  ModelProvider,
  ModelCapability,
  ModelInfo,
  MessageContentPart,
  ToolCall,
  ToolDefinitionRequest,
  Message,
  ResponseFormat,
  ModelRequest,
  TokenUsage,
  ModelResponse,
  ModelSelectionCriteria,
} from './types';

// --- Registre ---
export { MODEL_REGISTRY, registerModel, getModel, listModels, selectBestModel } from './registry';

// --- Routeur ---
export { routeAndExecute, streamModel } from './router';
