/**
 * @module verification/types
 * @description Types et interfaces du moteur de vérification Gen3ia.
 * Définit les structures de données pour les résultats de vérification,
 * les politiques de vérification et les types de vérification supportés.
 */

/**
 * Types de vérification disponibles pour valider les sorties des agents.
 * Chaque type correspond à un axe de validation distinct.
 * @typedef {'functional' | 'output_quality' | 'security' | 'policy_compliance' | 'consistency'} VerificationType
 */
export type VerificationType =
  | 'functional'
  | 'output_quality'
  | 'security'
  | 'policy_compliance'
  | 'consistency';

/**
 * Représente un problème détecté lors de la vérification.
 * Chaque problème est caractérisé par sa sévérité et une description.
 * @interface VerificationIssue
 */
export interface VerificationIssue {
  /** Sévérité du problème */
  severity: 'critical' | 'warning' | 'info';
  /** Description détaillée du problème */
  description: string;
  /** Suggestion optionnelle pour résoudre le problème */
  suggestion?: string;
}

/**
 * Résultat d'une vérification individuelle.
 * Contient le score, les éventuels problèmes et les métadonnées de vérification.
 * @interface VerificationResult
 */
export interface VerificationResult {
  /** Identifiant unique du résultat */
  id: string;
  /** Identifiant de l'exécution vérifiée */
  executionId: string;
  /** Identifiant de l'agent ayant produit la sortie */
  agentId: string;
  /** Type de vérification effectué */
  type: VerificationType;
  /** Indique si la vérification est réussie */
  passed: boolean;
  /** Score de qualité entre 0 et 1 */
  score: number;
  /** Détails supplémentaires de la vérification */
  details: Record<string, unknown>;
  /** Liste des problèmes détectés */
  issues: VerificationIssue[];
  /** Durée de la vérification en millisecondes */
  durationMs: number;
  /** Date et heure de la vérification */
  verifiedAt: Date;
  /** Nom du vérificateur ayant effectué la vérification */
  verifier: string;
}

/**
 * Politique de vérification définissant les règles et seuils.
 * Utilisée pour déterminer si une auto-rémédiation est nécessaire.
 * @interface VerificationPolicy
 */
export interface VerificationPolicy {
  /** Identifiant unique de la politique */
  id: string;
  /** Nom de la politique */
  name: string;
  /** Description de la politique */
  description: string;
  /** Types de vérification couverts par cette politique */
  types: VerificationType[];
  /** Score minimum requis pour considérer la vérification comme réussie */
  minScore: number;
  /** Active ou non l'auto-rémédiation en cas d'échec */
  autoRemediate: boolean;
  /** Nombre maximal de tentatives de réessai */
  maxRetries: number;
  /** Règles spécifiques de la politique */
  rules: Record<string, unknown>;
}
