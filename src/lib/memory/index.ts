// ============================================================
// @/lib/memory — Barrel vers memory-system
// ============================================================
// Historiquement les routes API importaient `@/lib/memory`.
// Ce barrel réexporte depuis `@/lib/memory-system` avec les
// noms attendus par les routes existantes.
// ============================================================

export {
  remember as storeMemory,
  recall as recallMemories,
  forget as forgetMemories,
  getAgentContext,
} from '@/lib/memory-system/manager';

export type {
  RememberParams,
  RecallParams,
  AgentContext,
  MemoryType,
  MemoryEntry,
} from '@/lib/memory-system';
