/**
 * @module improvement-lab
 * @description Point d'entrée du laboratoire d'amélioration Gen3ia.
 * Réexporte les types, les fonctions de gestion des expériences
 * et le module de benchmarking.
 */

export type {
  ExperimentStatus,
  ExperimentType,
  ImprovementExperiment,
} from './types';

export {
  createExperiment,
  runExperiment,
  promoteExperiment,
  rollbackExperiment,
  listExperiments,
  getExperiment,
} from './lab';

export { benchmark } from './benchmarker';
export type { BenchmarkResult } from './benchmarker';
