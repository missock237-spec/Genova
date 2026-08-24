/**
 * @module policy-engine/types
 * @description Types et interfaces du moteur de politiques Gen3ia.
 * Définit les structures de données pour les règles, les effets
 * et les résultats d'évaluation des politiques.
 */

/**
 * Effet possible d'une règle de politique.
 * Détermine l'action à entreprendre quand la règle correspond.
 * @typedef {'allow' | 'deny' | 'require_approval' | 'log_only'} PolicyEffect
 */
export type PolicyEffect = 'allow' | 'deny' | 'require_approval' | 'log_only';

/**
 * Conditions de correspondance pour une règle de politique.
 * Toutes les conditions sont optionnelles ; celles définies doivent
 * correspondre pour que la règle s'applique.
 * @interface PolicyConditions
 */
export interface PolicyConditions {
  /** Type de ressource ciblée (ex: 'database', 'deployment') */
  resourceType?: string;
  /** Action demandée (ex: 'write', 'delete', 'deploy') */
  action?: string;
  /** Rôle de l'utilisateur (ex: 'admin', 'user', 'viewer') */
  role?: string;
  /** Identifiant de l'agent concerné */
  agentId?: string;
  /** Identifiant de l'outil concerné */
  toolId?: string;
  /** Identifiant du modèle concerné */
  modelId?: string;
  /** Seuil de coût en dollars USD */
  costThreshold?: number;
  /** Niveau de sensibilité des données */
  dataSensitivity?: 'public' | 'internal' | 'confidential' | 'restricted';
}

/**
 * Règle de politique contrôlant l'accès et le comportement des agents.
 * @interface PolicyRule
 */
export interface PolicyRule {
  /** Identifiant unique de la règle */
  id: string;
  /** Nom lisible de la règle */
  name: string;
  /** Description détaillée de la règle */
  description: string;
  /** Effet à appliquer quand la règle correspond */
  effect: PolicyEffect;
  /** Conditions de correspondance */
  conditions: PolicyConditions;
  /** Priorité de la règle (plus élevé = plus prioritaire, -1 pour défaut) */
  priority: number;
  /** Indique si la règle est active */
  enabled: boolean;
  /** Date de création */
  createdAt: Date;
  /** Date de dernière mise à jour */
  updatedAt: Date;
}

/**
 * Règle correspondante dans un résultat d'évaluation.
 * @interface MatchedRule
 */
export interface MatchedRule {
  /** Identifiant de la règle */
  ruleId: string;
  /** Nom de la règle */
  ruleName: string;
  /** Effet de la règle */
  effect: PolicyEffect;
}

/**
 * Résultat de l'évaluation d'un ensemble de politiques.
 * @interface PolicyEvaluationResult
 */
export interface PolicyEvaluationResult {
  /** Indique si l'action est autorisée */
  allowed: boolean;
  /** Effet final retenu (règle de plus haute priorité) */
  effect: PolicyEffect;
  /** Liste des règles qui ont correspondu */
  matchedRules: MatchedRule[];
  /** Indique si une approbation humaine est requise */
  requiresApproval: boolean;
  /** Raison de la décision, en cas de refus ou d'approbation requise */
  reason?: string;
}
