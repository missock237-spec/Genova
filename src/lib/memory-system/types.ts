// ============================================================
// Gen3ia — Système de mémoire : définitions de types
// ============================================================
//  Types centraux pour le système de mémoire multi-niveaux :
//    - Types de mémoire (working, conversation, episodic, etc.)
//    - Entrée de mémoire
//    - Message de conversation
// ============================================================

/**
 * Types de mémoire disponibles dans le système.
 * - `working`     : mémoire de travail à court terme (key-value volatile).
 * - `conversation`: historique des échanges entre l'utilisateur et l'agent.
 * - `episodic`    : souvenirs d'événements passés (ex: résumés de conversation).
 * - `semantic`    : connaissances factuelles à long terme.
 * - `procedural`  : procédures et workflows mémorisés.
 * - `persistent`  : mémoire persistante personnalisée.
 */
export type MemoryType =
  | 'working'
  | 'conversation'
  | 'episodic'
  | 'semantic'
  | 'procedural'
  | 'persistent';

/**
 * Entrée de mémoire dans le système.
 * Représente un fait, un souvenir ou une connaissance
 * stocké avec ses métadonnées de traçabilité.
 */
export interface MemoryEntry {
  /** Identifiant unique du document Firestore. */
  id: string;
  /** Identifiant de l'utilisateur propriétaire. */
  userId: string;
  /** Identifiant de l'agent associé (optionnel). */
  agentId?: string;
  /** Identifiant de la session de conversation. */
  sessionId?: string;
  /** Type de mémoire. */
  type: MemoryType;
  /** Clé d'identification (pour la mémoire de travail et la déduplication). */
  key: string;
  /** Valeur stockée (peut être de tout type sérialisable). */
  value: unknown;
  /** Métadonnées libres attachées à l'entrée. */
  metadata?: Record<string, unknown>;
  /** Vecteur d'embedding pour la recherche sémantique (optionnel). */
  embedding?: number[];
  /** Score de pertinence calculé lors d'une recherche. */
  relevanceScore?: number;
  /** Date d'expiration de l'entrée (mémoire temporaire). */
  expiresAt?: Date;
  /** Horodatage de création. */
  createdAt: Date;
  /** Horodatage de dernière mise à jour. */
  updatedAt: Date;
  /** Nombre d'accès à cette entrée (pour le LRU). */
  accessCount: number;
  /** Horodatage du dernier accès. */
  lastAccessedAt: Date;
}

/**
 * Message individuel dans une conversation.
 * Stocké séparément pour un accès efficace à l'historique.
 */
export interface ConversationMessage {
  /** Identifiant unique du document Firestore. */
  id: string;
  /** Identifiant de la session de conversation. */
  sessionId: string;
  /** Identifiant de l'utilisateur. */
  userId: string;
  /** Identifiant de l'agent (optionnel). */
  agentId?: string;
  /** Rôle de l'émetteur du message. */
  role: 'user' | 'assistant' | 'system' | 'tool';
  /** Contenu textuel du message. */
  content: string;
  /** Métadonnées libres attachées au message. */
  metadata?: Record<string, unknown>;
  /** Nombre de tokens du message (pour le suivi de consommation). */
  tokens?: number;
  /** Horodatage de création. */
  createdAt: Date;
}
