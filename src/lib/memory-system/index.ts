// ============================================================
// Gen3ia — Système de mémoire : point d'entrée
// ============================================================
//  Ré-exporte l'ensemble des types et fonctions du module
//  memory-system pour un accès unifié via `@/lib/memory-system`.
// ============================================================

// --- Types ---
export type {
  MemoryType,
  MemoryEntry,
  ConversationMessage,
} from './types';

// --- Stockage (CRUD bas niveau) ---
export {
  store,
  retrieve,
  retrieveWorkingMemory,
  updateMemory,
  deleteMemory,
  deleteExpiredMemories,
  searchMemory,
  addConversationMessage,
  getConversationHistory,
} from './store';

export type { RetrieveOptions, SearchMemoryOptions } from './store';

// --- Gestionnaire (couche haute) ---
export {
  remember,
  recall,
  forget,
  getAgentContext,
  summarizeAndArchive,
} from './manager';

export type { RememberParams, RecallParams, AgentContext } from './manager';
