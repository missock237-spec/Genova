// ============================================================
// Gen3ia — Registre d'agents : définitions de types
// ============================================================
//  Types centraux pour le registre d'agents multi-capacités.
//  Utilisé par le module agent-registry et agent-runtime.
// ============================================================

/**
 * Ensemble des capacités reconnues par un agent.
 * Chaque littéral correspond à une compétence fonctionnelle
 * que l'agent peut exercer de manière autonome.
 */
export type AgentCapability =
  | 'chat'
  | 'code_generation'
  | 'code_review'
  | 'data_analysis'
  | 'image_generation'
  | 'audio_generation'
  | 'web_browsing'
  | 'file_processing'
  | 'rag_query'
  | 'email'
  | 'translation'
  | 'summarization'
  | 'task_planning'
  | 'api_integration'
  | 'database_query';

/**
 * État de publication d'un agent dans le registre.
 * - `active`    : agent prêt à être exécuté.
 * - `inactive`  : agent désactivé (désactivable par le propriétaire).
 * - `deprecated`: agent obsolète, conservé pour historique.
 * - `testing`   : agent en phase de test (accès restreint).
 */
export type AgentStatus = 'active' | 'inactive' | 'deprecated' | 'testing';

/**
 * Définition complète d'un agent dans le registre.
 * Contient toutes les métadonnées nécessaires au runtime
 * pour instancier, configurer et exécuter l'agent.
 */
export interface AgentDefinition {
  /** Identifiant unique du document Firestore. */
  id: string;
  /** Nom lisible de l'agent (ex: « Analyse de Code Senior »). */
  name: string;
  /** Description fonctionnelle de l'agent. */
  description: string;
  /** Numéro de version sémantique (ex: « 1.2.0 »). */
  version: string;
  /** État de publication de l'agent. */
  status: AgentStatus;
  /** Liste des capacités offertes par l'agent. */
  capabilities: AgentCapability[];
  /** Identifiants des modèles LLM compatibles. */
  compatibleModels: string[];
  /** Identifiants des outils autorisés pour cet agent. */
  compatibleTools: string[];
  /** Modèle par défaut utilisé si aucun n'est précisé à l'exécution. */
  defaultModel?: string;
  /** Instructions système (prompt système) de l'agent. */
  instructions: string;
  /** Température de sampling (0–2), par défaut 0.7. */
  temperature?: number;
  /** Nombre maximum de tokens en sortie par requête. */
  maxTokens?: number;
  /** Métadonnées libres attachées à l'agent. */
  metadata: Record<string, unknown>;
  /** Coût estimé en USD par tâche d'exécution. */
  estimatedCostPerTask: number;
  /** Liste des permissions requises pour utiliser cet agent. */
  permissions: string[];
  /** Limites d'exécution de l'agent. */
  limits: {
    /** Nombre maximum d'exécutions par heure. */
    maxExecutionsPerHour?: number;
    /** Nombre maximum de tokens consommables par tâche. */
    maxTokensPerTask?: number;
    /** Délai maximum en secondes avant expiration. */
    timeoutSeconds?: number;
    /** Sous-ensemble d'outils autorisés (restreint compatibleTools). */
    allowedTools?: string[];
  };
  /** Date de création du document. */
  createdAt: Date;
  /** Date de dernière mise à jour. */
  updatedAt: Date;
}

/**
 * Version publiée d'un agent.
 * Chaque publication crée un instantané immuable de la définition
 * de l'agent à ce moment précis.
 */
export interface AgentVersion {
  /** Identifiant unique de la version. */
  id: string;
  /** Référence vers l'agent parent. */
  agentId: string;
  /** Numéro de version sémantique. */
  version: string;
  /** Notes de version (changelog). */
  changelog: string;
  /** Instantané complet de la définition au moment de la publication. */
  definition: AgentDefinition;
  /** Date de publication. */
  publishedAt: Date;
  /** Indique si cette version est la plus récente. */
  isLatest: boolean;
}
