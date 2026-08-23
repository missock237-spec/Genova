// ============================================================
// Gen3ia — Gestionnaire de mémoire (Memory Manager)
// ============================================================
//  Couche haute du système de mémoire. Offre :
//    - Stockage avec déduplication (upsert sur userId+type+key)
//    - Rappel de mémoires pertinentes
//    - Oubli sélectif ou total
//    - Assemblage du contexte complet pour un agent
//    - Résumé et archivage des conversations
//
//  Dépend des collections Firestore :
//    - `memory_entries`
//    - `conversation_messages`
// ============================================================

import { FirestoreRepository } from '@/lib/firebase/firestore';

import type { MemoryEntry, MemoryType, ConversationMessage } from './types';
import {
  store,
  retrieve,
  retrieveWorkingMemory,
  deleteMemory,
  getConversationHistory,
} from './store';

// ----------------------------------------------------------------
// Référentiel Firestore
// ----------------------------------------------------------------

/** Référentiel pour les entrées de mémoire (accès direct pour upsert). */
const memoryRepo = new FirestoreRepository<MemoryEntry>('memory_entries');

// ----------------------------------------------------------------
// remember — Stockage avec déduplication
// ----------------------------------------------------------------

/**
 * Paramètres de la fonction `remember`.
 */
export interface RememberParams {
  /** Identifiant de l'utilisateur. */
  userId: string;
  /** Type de mémoire. */
  type: MemoryType;
  /** Clé d'identification (unique par userId+type). */
  key: string;
  /** Valeur à stocker. */
  value: unknown;
  /** Identifiant de l'agent associé (optionnel). */
  agentId?: string;
  /** Identifiant de session (optionnel). */
  sessionId?: string;
  /** Métadonnées libres (optionnel). */
  metadata?: Record<string, unknown>;
  /** Date d'expiration (optionnel). */
  expiresAt?: Date;
}

/**
 * Stocke une mémoire avec déduplication automatique.
 *
 * Si une entrée existe déjà avec le même `userId`, `type` et `key`,
 * elle est mise à jour (upsert). Sinon, une nouvelle entrée est créée.
 *
 * @param params - Paramètres de la mémoire à stocker.
 * @returns Identifiant du document créé ou mis à jour.
 */
export async function remember(params: RememberParams): Promise<string> {
  const { userId, type, key } = params;

  // Rechercher une entrée existante avec la même clé composite
  const existing = await memoryRepo.findFirst({
    where: [
      { field: 'userId', op: '==', value: userId },
      { field: 'type', op: '==', value: type },
      { field: 'key', op: '==', value: key },
    ],
  });

  if (existing) {
    const existingId = (existing as Record<string, unknown>).id as string;
    const updateData: Record<string, unknown> = {
      value: params.value,
      accessCount: { increment: 1 },
      lastAccessedAt: new Date(),
    };
    if (params.metadata !== undefined) updateData.metadata = params.metadata;
    if (params.expiresAt !== undefined) updateData.expiresAt = params.expiresAt;
    if (params.agentId !== undefined) updateData.agentId = params.agentId;
    if (params.sessionId !== undefined) updateData.sessionId = params.sessionId;

    await memoryRepo.update({ where: { id: existingId }, data: updateData });
    return existingId;
  }

  // Création d'une nouvelle entrée
  return store({
    userId,
    type,
    key,
    value: params.value,
    agentId: params.agentId,
    sessionId: params.sessionId,
    metadata: params.metadata,
    expiresAt: params.expiresAt,
  });
}

// ----------------------------------------------------------------
// recall — Récupération de mémoires pertinentes
// ----------------------------------------------------------------

/**
 * Paramètres de la fonction `recall`.
 */
export interface RecallParams {
  /** Identifiant de l'utilisateur. */
  userId: string;
  /** Requête textuelle pour la recherche (optionnel). */
  query?: string;
  /** Filtrer par type de mémoire (optionnel). */
  type?: MemoryType;
  /** Filtrer par agent (optionnel). */
  agentId?: string;
  /** Filtrer par session (optionnel). */
  sessionId?: string;
  /** Limiter le nombre de résultats (défaut : 10). */
  limit?: number;
}

/**
 * Récupère les mémoires pertinentes pour un utilisateur.
 *
 * Si une requête est fournie, effectue une recherche textuelle.
 * Sinon, récupère les mémoires les plus récentes selon les filtres.
 *
 * @param params - Paramètres de récupération.
 * @returns Liste des mémoires pertinentes.
 */
export async function recall(params: RecallParams): Promise<MemoryEntry[]> {
  const { userId, query, type, agentId, sessionId, limit = 10 } = params;

  if (query) {
    // Recherche textuelle via le store
    const { searchMemory } = await import('./store');
    return searchMemory(userId, query, { type, limit });
  }

  // Récupération directe par filtres
  return retrieve(userId, { type, agentId, sessionId, limit });
}

// ----------------------------------------------------------------
// forget — Suppression de mémoires
// ----------------------------------------------------------------

/**
 * Oublie des mémoires (suppression).
 *
 * Si `type` est précisé, supprime uniquement les mémoires
 * de ce type. Sinon, supprime toutes les mémoires de l'utilisateur.
 *
 * @param userId - Identifiant de l'utilisateur.
 * @param type   - Type de mémoire à supprimer (optionnel, tous si absent).
 * @returns Nombre d'entrées supprimées.
 */
export async function forget(
  userId: string,
  type?: MemoryType,
): Promise<number> {
  const where: Array<{ field: string; op: string; value: unknown }> = [
    { field: 'userId', op: '==', value: userId },
  ];

  if (type) {
    where.push({ field: 'type', op: '==', value: type });
  }

  const toDelete = await memoryRepo.findMany({
    where,
    limit: 500,
  });

  for (const doc of toDelete) {
    const id = (doc as Record<string, unknown>).id as string;
    await deleteMemory(id);
  }

  return toDelete.length;
}

// ----------------------------------------------------------------
// getAgentContext — Assemblage du contexte complet
// ----------------------------------------------------------------

/**
 * Contexte complet assemblé pour un agent.
 * Contient la mémoire de travail, l'historique récent
 * et les mémoires pertinentes.
 */
export interface AgentContext {
  /** Mémoire de travail (key-value plat). */
  workingMemory: Record<string, unknown>;
  /** Derniers messages de conversation. */
  recentConversations: ConversationMessage[];
  /** Mémoires sémantiques ou épisodiques pertinentes. */
  relevantMemories: MemoryEntry[];
}

/**
 * Assemble le contexte complet pour un agent.
 *
 * Récupère et combine :
 * 1. La mémoire de travail de l'utilisateur/agent.
 * 2. Les 20 derniers messages de conversation de la session.
 * 3. Les 5 mémoires les plus pertinentes (sémantiques/épisodiques).
 *
 * @param userId    - Identifiant de l'utilisateur.
 * @param agentId   - Identifiant de l'agent.
 * @param sessionId - Identifiant de session (optionnel).
 * @returns Contexte complet assemblé.
 */
export async function getAgentContext(
  userId: string,
  agentId: string,
  sessionId?: string,
): Promise<AgentContext> {
 // Récupérer en parallèle les trois sources de contexte
  const [workingMemory, recentConversations, relevantMemories] = await Promise.all([
    // 1. Mémoire de travail
    retrieveWorkingMemory(userId, agentId),

    // 2. Derniers messages de conversation
    sessionId
      ? getConversationHistory(sessionId, 20)
      : Promise.resolve([]),

    // 3. Mémoires pertinentes (épisodiques et sémantiques)
    retrieve(userId, {
      type: undefined, // Tous les types pour le moment
      agentId,
      sessionId,
      limit: 5,
    }),
  ]);

  return {
    workingMemory,
    recentConversations,
    relevantMemories,
  };
}

// ----------------------------------------------------------------
// summarizeAndArchive — Archivage des conversations
// ----------------------------------------------------------------

/**
 * Résume et archive une conversation terminée.
 *
 * Étapes :
 * 1. Récupère tous les messages de la session.
 * 2. Si la conversation est suffisamment longue (≥ 6 messages),
 *    utilise le LLM pour générer un résumé.
 * 3. Stocke le résumé comme une mémoire épisodique.
 * 4. Supprime les messages archivés (optimisation du coût).
 *
 * @param sessionId - Identifiant de la session à archiver.
 * @param userId    - Identifiant de l'utilisateur (pour la propriété).
 */
export async function summarizeAndArchive(
  sessionId: string,
  userId: string,
): Promise<void> {
  // Récupérer tous les messages
  const messages = await getConversationHistory(sessionId, 500);

  if (messages.length < 6) {
    // Conversation trop courte pour mériter un résumé
    return;
  }

  // Construire le texte à résumer
  const conversationText = messages
    .map((m) => `[${m.role}] ${m.content}`)
    .join('\n');

  // Tenter de générer un résumé via le LLM
  let summary = '';
  try {
    const { routeAndExecute } = await import('@/lib/model-router');
    const response = await routeAndExecute({
      model: '', // Sélection automatique
      messages: [
        {
          role: 'system',
          content: `Tu es un assistant de mémorisation. Résume la conversation suivante ` +
            `en un paragraphe concis (max 200 mots). Conserve les faits importants, ` +
            `les décisions prises et les préférences exprimées par l'utilisateur. ` +
            `Réponds UNIQUEMENT avec le résumé, sans préfixe ni explication.`,
        },
        { role: 'user', content: conversationText },
      ],
      temperature: 0.3,
      maxTokens: 500,
    });
    summary = response.content.trim();
  } catch {
    // Si le LLM est indisponible, créer un résumé trivial
    const userMessages = messages.filter((m) => m.role === 'user').length;
    const agentMessages = messages.filter((m) => m.role === 'assistant').length;
    summary =
      `Conversation archivée : ${userMessages} messages utilisateur, ` +
      `${agentMessages} réponses d'assistant. ` +
      `Premier message : ${messages[0]?.content?.slice(0, 100) ?? '(vide)'}. ` +
      `Dernier message : ${messages[messages.length - 1]?.content?.slice(0, 100) ?? '(vide)'}.`;
  }

  // Stocker le résumé comme mémoire épisodique
  await remember({
    userId,
    type: 'episodic',
    key: `conversation_summary_${sessionId}`,
    value: { summary, messageCount: messages.length, sessionId },
    sessionId,
    metadata: {
      archivedAt: new Date().toISOString(),
      messageCount: messages.length,
    },
  });

  // Supprimer les messages archivés pour optimiser le stockage
  // On ne supprime que les messages plus anciens que 24h
  const archiveThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
  for (const msg of messages) {
    if (msg.createdAt < archiveThreshold) {
      const { FirestoreRepository: FR } = await import('@/lib/firebase/firestore');
      const msgRepo = new FR<ConversationMessage>('conversation_messages');
      await msgRepo.delete({ where: { id: msg.id } });
    }
  }
}
