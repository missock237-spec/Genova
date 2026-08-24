/**
 * @module policy-engine
 * @description Point d'entrée du moteur de politiques Gen3ia.
 * Réexporte les types, le moteur d'évaluation et les fonctions de gestion.
 */

export type {
  PolicyEffect,
  PolicyRule,
  PolicyConditions,
  PolicyEvaluationResult,
  MatchedRule,
} from './types';

export {
  evaluate,
  createPolicy,
  updatePolicy,
  deletePolicy,
  listPolicies,
  DEFAULT_POLICIES,
} from './engine';

export type { EvaluationContext } from './engine';
