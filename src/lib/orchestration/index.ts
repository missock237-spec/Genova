// ============================================================
// Gen3ia — Plan d'orchestration : point d'entrée
// ============================================================
//  Ré-exporte l'ensemble des types et fonctions du module
//  d'orchestration pour un accès unifié via `@/lib/orchestration`.
// ============================================================

// --- Types ---
export type {
  TaskStatus,
  StepStatus,
  TaskBudget,
  OrchestrationTask,
  OrchestrationStep,
} from './types';

// --- Planificateur ---
export { createPlan, PLANNING_SYSTEM_PROMPT } from './planner';

// --- Exécuteur d'étapes ---
export { executeStep } from './step-executor';
export type { StepExecutionResult } from './step-executor';

// --- Orchestrateur central ---
export {
  orchestrate,
  resumeOrchestration,
  cancelOrchestration,
  getOrchestrationStatus,
  listOrchestrations,
} from './orchestrator';

export type { OrchestrateParams } from './orchestrator';
