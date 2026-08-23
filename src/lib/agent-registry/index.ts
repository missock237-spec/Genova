// ============================================================
// Gen3ia — Registre d'agents : point d'entrée
// ============================================================
//  Ré-exporte l'ensemble des types et fonctions du module
//  agent-registry pour un accès unifié via `@/lib/agent-registry`.
// ============================================================

export type {
  AgentCapability,
  AgentDefinition,
  AgentStatus,
  AgentVersion,
} from './types';

export {
  registerAgent,
  updateAgent,
  deactivateAgent,
  getAgent,
  listAgents,
  discoverAgents,
  publishVersion,
  getAgentVersions,
} from './registry';
