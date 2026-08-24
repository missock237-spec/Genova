// ============================================================
// Gen3ia — Runtime d'agents : définitions de types
// ============================================================
//  Types centraux pour le moteur d'exécution d'agents :
//    - États d'exécution
//    - Contexte d'exécution
//    - Résultat d'exécution
//    - Mémoire de travail
// ============================================================

import type { AgentDefinition } from '@/lib/agent-registry/types';

/**
 * États possibles d'une exécution d'agent.
 * - `pending`   : en attente de démarrage.
 * - `running`   : en cours d'exécution.
 * - `completed` : terminée avec succès.
 * - `failed`    : terminée en erreur.
 * - `cancelled` : annulée par l'utilisateur.
 * - `timeout`   : expirée (délai dépassé).
 */
export type ExecutionState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

/**
 * Contexte complet d'une exécution d'agent.
 * Contient toutes les informations nécessaires au moteur
 * pour instancier, exécuter et suivre l'exécution.
 */
export interface AgentExecutionContext {
  /** Identifiant de l'agent à exécuter. */
  agentId: string;
  /** Définition complète de l'agent (résolue depuis le registre). */
  agent: AgentDefinition;
  /** Identifiant de l'utilisateur demandeur. */
  userId: string;
  /** Identifiant de l'organisation (multi-tenant, optionnel). */
  orgId?: string;
  /** Identifiant de la tâche parente (si exécution orchestrée). */
  taskId?: string;
  /** Données d'entrée transmises à l'agent. */
  input: Record<string, unknown>;
  /** Identifiant du modèle LLM à utiliser. */
  model: string;
  /** Liste des outils activés pour cette exécution. */
  tools: string[];
  /** Budget alloué pour cette exécution. */
  budget: {
    /** Nombre maximum de tokens (prompt + completion). */
    maxTokens: number;
    /** Durée maximale en millisecondes. */
    maxDurationMs: number;
    /** Coût maximal autorisé en USD. */
    maxCostUsd: number;
  };
  /** Métadonnées libres attachées à l'exécution. */
  metadata: Record<string, unknown>;
  /** Identifiant de corrélation pour le traçage distribué. */
  correlationId: string;
}

/**
 * Artéfact produit par une exécution d'agent.
 * Peut représenter un fichier généré, un extrait de code, etc.
 */
export interface ExecutionArtifact {
  /** Type MIME ou catégorie de l'artéfact (ex: 'text/plain', 'code', 'image'). */
  type: string;
  /** Contenu textuel de l'artéfact. */
  content: string;
  /** Nom descriptif optionnel. */
  name?: string;
}

/**
 * Résultat complet d'une exécution d'agent.
 * Contient la sortie, les métriques de consommation et les artéfacts.
 */
export interface AgentExecutionResult {
  /** Identifiant unique de l'exécution. */
  executionId: string;
  /** Identifiant de l'agent exécuté. */
  agentId: string;
  /** Données de sortie de l'agent. */
  output: Record<string, unknown>;
  /** État final de l'exécution. */
  state: ExecutionState;
  /** Consommation de tokens ventilée. */
  tokensUsed: {
    /** Tokens de prompt (entrée). */
    prompt: number;
    /** Tokens de completion (sortie). */
    completion: number;
  };
  /** Coût réel en USD de l'exécution. */
  costUsd: number;
  /** Durée réelle de l'exécution en millisecondes. */
  durationMs: number;
  /** Artéfacts produits pendant l'exécution. */
  artifacts: ExecutionArtifact[];
  /** Message d'erreur en cas d'échec. */
  error?: string;
}

/**
 * Entrée d'historique de conversation (mémoire de travail).
 */
export interface ConversationEntry {
  /** Rôle de l'émetteur (ex: 'user', 'assistant', 'system'). */
  role: string;
  /** Contenu du message. */
  content: string;
  /** Horodatage du message. */
  timestamp: Date;
}

/**
 * Mémoire de travail d'un agent.
 * Contient la mémoire courte durée et le contexte de session.
 */
export interface AgentMemory {
  /** Espace de travail volatil (key-value). */
  workingMemory: Record<string, unknown>;
  /** Historique de conversation pour la session en cours. */
  conversationHistory: ConversationEntry[];
  /** Contexte additionnel (ex: RAG, paramètres de session). */
  context: Record<string, unknown>;
}
