/**
 * @module tool-gateway
 * @description Point d'entrée principal de la passerelle d'outils Gen3ia.
 * Ce module ré-exporte tous les types, fonctions de registre,
 * fonctions de passerelle et connecteurs pour un accès unifié.
 */

// --- Types ---
export type {
  ToolDefinition,
  ToolExecutionRequest,
  ToolExecutionResult,
  ToolPermission,
} from './types';

// --- Registre ---
export { BUILT_IN_TOOLS, registerTool, getTool, listTools } from './registry';

// --- Passerelle ---
export { executeTool, checkToolPermission, validateInput } from './gateway';
export type { ValidationResult } from './gateway';

// --- Connecteurs ---
export { executeHttpRequest } from './connectors/http';
export { executeCode } from './connectors/code';
export { webSearch } from './connectors/web-search';
