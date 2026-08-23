// ============================================================
// Gen3ia — Couche de stockage du système de mémoire
// ============================================================
//  Opérations CRUD sur les entrées de mémoire et les messages
//  de conversation, avec persistance Firestore.
//
//  Collections Firestore :
//    - `memory_entries`       (mémoires)
//    - `conversation_messages` (messages de conversation)
// ============================================================

import { FirestoreRepository } from '@/lib/firebase/firestore';

import type { MemoryEntry, MemoryType, ConversationMessage } from './types';

// ----------------------------------------------------------------
// Référentiels Firestore
// ----------------------------------------------------------------

/** Référentiel pour les entrées de mémoire. */
const memoryRepo = new FirestoreRepository<MemoryEntry>('memory_entries');

/** Référentiel pour les messages de conversation. */
const messageRepo = new FirestoreRepository<ConversationMessage>('conversation_messages');

// ----------------------------------------------------------------
// Fonctions utilitaires
// ----------------------------------------------------------------

/**
 * Convertit un document Firestore brut en MemoryEntry.
 * Gère les dates potentiellement invalides.
 *
 * @param raw - Document Firestore désérialisé.
 * @returns Objet MemoryEntry typé.
 */
function toMemoryEntry(raw: Record<string, unknown>): MemoryEntry {
  function safeDate(value: unknown): Date {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    if (typeof value === 'number' && value > 0) return new Date(value);
    return new Date();
  }

  return {
    id: raw.id as string,
    userId: raw.userId as string,
    agentId: raw.agentId as string | undefined,
    sessionId: raw.sessionId as string | undefined,
    type: raw.type as MemoryType,
    key: raw.key as string,
    value: raw.value,
    metadata: (raw.metadata as Record<string, unknown>) ?? undefined,
    embedding: raw.embedding as number[] | undefined,
    relevanceScore: raw.relevanceScore as number | undefined,
    expiresAt: raw.expiresAt ? safeDate(raw.expiresAt) : undefined,
    createdAt: safeDate(raw.createdAt),
    updatedAt: safeDate(raw.updatedAt),
    accessCount: (raw.accessCount as number) ?? 0,
    lastAccessedAt: safeDate(raw.lastAccessedAt),
  };
}

/**
 * Convertit un document Firestore brut en ConversationMessage.
 *
 * @param raw - Document Firestore désérialisé.
 * @returns Objet ConversationMessage typé.
 */
function toConversationMessage(raw: Record<string, unknown>): ConversationMessage {
  function safeDate(value: unknown): Date {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    if (typeof value === 'number' && value > 0) return new Date(value);
    return new Date();
  }

  return {
    id: raw.id as string,
    sessionId: raw.sessionId as string,
    userId: raw.userId as string,
    agentId: raw.agentId as string | undefined,
    role: raw.role as ConversationMessage['role'],
    content: raw.content as string,
    metadata: (raw.metadata as Record<string, unknown>) ?? undefined,
    tokens: raw.tokens as number | undefined,
    createdAt: safeDate(raw.createdAt),
  };
}

// ----------------------------------------------------------------
// API — Mémoire (CRUD)
// ----------------------------------------------------------------

/**
 * Stocke une nouvelle entrée de mémoire.
 *
 * @param entry - Entrée sans id, createdAt, updatedAt, accessCount, lastAccessedAt.
 * @returns Identifiant du document créé.
 */
export async function store(
  entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>,
): Promise<string> {
  const now = new Date();
  const created = await memoryRepo.create({
    data: {
      ...entry,
      accessCount: 0,
      lastAccessedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });
  return (created as Record<string, unknown>).id as string;
}

/**
 * Options de récupération des mémoires.
 */
export interface RetrieveOptions {
  /** Filtrer par type de mémoire. */
  type?: MemoryType;
  /** Filtrer par agent. */
  agentId?: string;
  /** Filtrer par session. */
  sessionId?: string;
  /** Filtrer par clé exacte. */
  key?: string;
  /** Limiter le nombre de résultats. */
  limit?: number;
}

/**
 * Récupère des entrées de mémoire avec filtres.
 *
 * @param userId  - Identifiant de l'utilisateur.
 * @param options - Filtres optionnels.
 * @returns Liste des entrées correspondantes.
 */
export async function retrieve(
  userId: string,
  options?: RetrieveOptions,
): Promise<MemoryEntry[]> {
  const where: Array<{ field: string; op: string; value: unknown }> = [
    { field: 'userId', op: '==', value: userId },
  ];

  if (options?.type) {
    where.push({ field: 'type', op: '==', value: options.type });
  }
  if (options?.agentId) {
    where.push({ field: 'agentId', op: '==', value: options.agentId });
  }
  if (options?.sessionId) {
    where.push({ field: 'sessionId', op: '==', value: options.sessionId });
  }
  if (options?.key) {
    where.push({ field: 'key', op: '==', value: options.key });
  }

  const docs = await memoryRepo.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    limit: options?.limit ?? 100,
  });

  return docs.map((d) => toMemoryEntry(d as Record<string, unknown>));
}

/**
 * Récupère la mémoire de travail d'un utilisateur/agent.
 * Retourne un objet plat key→value pour un accès direct.
 *
 * Filtre les entrées de type `'working'` et les retourne
 * sous forme d'enregistrement simple (sans les métadonnées).
 *
 * @param userId  - Identifiant de l'utilisateur.
 * @param agentId - Identifiant de l'agent (optionnel).
 * @returns Objet plat clé→valeur de la mémoire de travail.
 */
export async function retrieveWorkingMemory(
  userId: string,
  agentId?: string,
): Promise<Record<string, unknown>> {
  const where: Array<{ field: string; op: string; value: unknown }> = [
    { field: 'userId', op: '==', value: userId },
    { field: 'type', op: '==', value: 'working' },
  ];

  if (agentId) {
    where.push({ field: 'agentId', op: '==', value: agentId });
  }

  const docs = await memoryRepo.findMany({ where });

  const result: Record<string, unknown> = {};
  for (const d of docs) {
    const entry = toMemoryEntry(d as Record<string, unknown>);
    // Ignorer les entrées expirées
    if (entry.expiresAt && entry.expiresAt < new Date()) continue;
    result[entry.key] = entry.value;
  }

  return result;
}

/**
 * Met à jour la valeur d'une entrée de mémoire.
 * Incrémente automatiquement le compteur d'accès et
 * met à jour l'horodatage du dernier accès.
 *
 * @param id    - Identifiant de l'entrée.
 * @param value - Nouvelle valeur.
 */
export async function updateMemory(
  id: string,
  value: unknown,
): Promise<void> {
  await memoryRepo.update({
    where: { id },
    data: {
      value,
      accessCount: { increment: 1 },
      lastAccessedAt: new Date(),
    },
  });
}

/**
 * Supprime une entrée de mémoire.
 *
 * @param id - Identifiant de l'entrée à supprimer.
 */
export async function deleteMemory(id: string): Promise<void> {
  await memoryRepo.delete({ where: { id } });
}

/**
 * Supprime toutes les entrées de mémoire expirées d'un utilisateur.
 *
 * Parcourt les entrées dont `expiresAt` est antérieur à
 * la date actuelle et les supprime.
 *
 * @param userId - Identifiant de l'utilisateur.
 * @returns Nombre d'entrées supprimées.
 */
export async function deleteExpiredMemories(userId: string): Promise<number> {
  const now = new Date();

  // Firestore ne permet pas de filtrer sur un champ optionnel
  // avec une valeur non nulle. On récupère les mémoires working
  // et conversation qui sont les plus susceptibles d'expirer.
  const docs = await memoryRepo.findMany({
    where: [
      { field: 'userId', op: '==', value: userId },
    ],
    limit: 500,
  });

  const toDelete: string[] = [];
  for (const d of docs) {
    const entry = toMemoryEntry(d as Record<string, unknown>);
    if (entry.expiresAt && entry.expiresAt <= now) {
      toDelete.push(entry.id);
    }
  }

  for (const id of toDelete) {
    await memoryRepo.delete({ where: { id } });
  }

  return toDelete.length;
}

/**
 * Options de recherche mémoire.
 */
export interface SearchMemoryOptions {
  /** Filtrer par type de mémoire. */
  type?: MemoryType;
  /** Limiter le nombre de résultats. */
  limit?: number;
}

/**
 * Recherche approximative dans les mémoires d'un utilisateur.
 *
 * ⚠️ **Approximation** : Firestore ne dispose pas de recherche
 * plein texte native. Cette fonction filtre sur le champ `key`
 * avec l'opérateur `==` (approximation grossière). Pour une
 * recherche sémantique complète, utiliser les embeddings
 * et une recherche vectorielle.
 *
 * La recherche porte sur les clés contenant la chaîne de recherche.
 *
 * @param userId - Identifiant de l'utilisateur.
 * @param query  - Chaîne de recherche.
 * @param options - Options de filtrage.
 * @returns Liste des entrées correspondantes.
 */
export async function searchMemory(
  userId: string,
  query: string,
  options?: SearchMemoryOptions,
): Promise<MemoryEntry[]> {
  const where: Array<{ field: string; op: string; value: unknown }> = [
    { field: 'userId', op: '==', value: userId },
  ];

  if (options?.type) {
    where.push({ field: 'type', op: '==', value: options.type });
  }

  const docs = await memoryRepo.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    limit: options?.limit ?? 20,
  });

  // Filtrage en mémoire par pertinence textuelle (approximation)
  const queryLower = query.toLowerCase();
  const results = docs
    .map((d) => toMemoryEntry(d as Record<string, unknown>))
    .filter((entry) => {
      // Recherche dans la clé
      if (entry.key.toLowerCase().includes(queryLower)) return true;
      // Recherche dans les métadonnées (valeurs string)
      if (entry.metadata) {
        for (const v of Object.values(entry.metadata)) {
          if (typeof v === 'string' && v.toLowerCase().includes(queryLower)) return true;
        }
      }
      return false;
    });

  return results;
}

// ----------------------------------------------------------------
// API — Messages de conversation
// ----------------------------------------------------------------

/**
 * Ajoute un message à l'historique de conversation.
 *
 * @param msg - Message sans id ni createdAt.
 * @returns Identifiant du message créé.
 */
export async function addConversationMessage(
  msg: Omit<ConversationMessage, 'id' | 'createdAt'>,
): Promise<string> {
  const created = await messageRepo.create({
    data: {
      sessionId: msg.sessionId,
      userId: msg.userId,
      agentId: msg.agentId,
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata,
      tokens: msg.tokens,
    },
  });
  return (created as Record<string, unknown>).id as string;
}

/**
 * Récupère l'historique d'une session de conversation.
 *
 * @param sessionId - Identifiant de la session.
 * @param limit     - Nombre maximum de messages (défaut : 100).
 * @returns Liste des messages triés par date croissante.
 */
export async function getConversationHistory(
  sessionId: string,
  limit?: number,
): Promise<ConversationMessage[]> {
  const docs = await messageRepo.findMany({
    where: [{ field: 'sessionId', op: '==', value: sessionId }],
    orderBy: { createdAt: 'asc' },
    limit: limit ?? 100,
  });

  return docs.map((d) => toConversationMessage(d as Record<string, unknown>));
}
