/**
 * @module improvement-lab/types
 * @description Types et interfaces du laboratoire d'amélioration Gen3ia.
 * Définit les structures pour les expériences d'optimisation,
 * le benchmarking et la promotion en production.
 */

/**
 * Statuts possibles d'une expérience d'amélioration.
 * Le cycle de vie va de brouillon à promu ou annulé.
 * @typedef ExperimentStatus
 */
export type ExperimentStatus =
  | 'draft'
  | 'testing'
  | 'benchmarking'
  | 'approved'
  | 'rejected'
  | 'promoted'
  | 'rolled_back';

/**
 * Types d'expériences supportés.
 * Chaque type correspond à une catégorie d'amélioration.
 * @typedef ExperimentType
 */
export type ExperimentType =
  | 'prompt_optimization'
  | 'workflow_change'
  | 'skill_addition'
  | 'model_change'
  | 'tool_configuration';

/**
 * Expérience d'amélioration du système.
 * Représente une expérience A/B ou d'optimisation comparant
 * une configuration de référence à une configuration expérimentale.
 * @interface ImprovementExperiment
 */
export interface ImprovementExperiment {
  /** Identifiant unique de l'expérience */
  id: string;
  /** Nom lisible de l'expérience */
  name: string;
  /** Description détaillée de l'hypothèse testée */
  description: string;
  /** Type de l'expérience */
  type: ExperimentType;
  /** Identifiant de l'agent ciblé, si applicable */
  targetAgentId?: string;
  /** Nom de la métrique à optimiser (ex: 'accuracy', 'latency_ms') */
  targetMetric: string;
  /** Valeur de la métrique avec la configuration de référence */
  baselineValue: number;
  /** Valeur de la métrique avec la configuration expérimentale */
  experimentalValue?: number;
  /** Pourcentage d'amélioration mesuré */
  improvementPercent?: number;
  /** Statut actuel de l'expérience */
  status: ExperimentStatus;
  /** Configuration expérimentale testée */
  config: Record<string, unknown>;
  /** Configuration de référence (configuration actuelle) */
  baselineConfig: Record<string, unknown>;
  /** Résultats détaillés des itérations */
  results: Record<string, unknown>;
  /** Nombre d'itérations effectuées */
  iterations: number;
  /** Nombre maximal d'itérations à effectuer */
  maxIterations: number;
  /** Identifiant de l'utilisateur ayant créé l'expérience */
  createdBy: string;
  /** Identifiant de l'utilisateur ayant approuvé la promotion */
  approvedBy?: string;
  /** Date de promotion en production */
  promotedAt?: Date;
  /** Date de création */
  createdAt: Date;
  /** Date de dernière mise à jour */
  updatedAt: Date;
}
