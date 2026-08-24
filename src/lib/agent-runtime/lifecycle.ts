// ============================================================
// Gen3ia — Cycle de vie des exécutions d'agents
// ============================================================
//  Gestion CRUD des enregistrements d'exécution :
//    - Création (pending → running)
//    - Mise à jour d'état
//    - Lecture
//    - Annulation
//    - Liste avec filtres
// ============================================================

import { db } from '@/lib/db';

import type { ExecutionState } from './types';

/**
 * Crée un enregistrement d'exécution en base et retourne son identifiant.
 * L'état initial est `'pending'` — l'appelant doit le passer à `'running'`
 * une fois l'exécution effectivement démarrée.
 *
 * @param data - Données initiales de l'exécution.
 * @returns Identifiant unique de l'exécution créée.
 * @throws {Error} Si la création en base échoue.
 */
export async function createExecution(
  data: Record<string, unknown>,
): Promise<string> {
  const created = await db.execution.create({
    data: {
      ...data,
      state: 'pending',
      tokensUsed: { prompt: 0, completion: 0 },
      costUsd: 0,
      durationMs: 0,
      artifacts: [],
    },
  });

  return (created as Record<string, unknown>).id as string;
}

/**
 * Met à jour l'état et éventuellement les données de résultat
 * d'une exécution existante.
 *
 * @param executionId - Identifiant de l'exécution.
 * @param state       - Nouvel état.
 * @param result      - Données partielles de résultat à fusionner (optionnel).
 */
export async function updateExecutionState(
  executionId: string,
  state: ExecutionState,
  result?: Partial<{
    output: Record<string, unknown>;
    tokensUsed: { prompt: number; completion: number };
    costUsd: number;
    durationMs: number;
    artifacts: Array<{ type: string; content: string; name?: string }>;
    error: string | null;
  }>,
): Promise<void> {
  const updateData: Record<string, unknown> = { state };

  if (result) {
    if (result.output !== undefined) updateData.output = result.output;
    if (result.tokensUsed !== undefined) updateData.tokensUsed = result.tokensUsed;
    if (result.costUsd !== undefined) updateData.costUsd = result.costUsd;
    if (result.durationMs !== undefined) updateData.durationMs = result.durationMs;
    if (result.artifacts !== undefined) updateData.artifacts = result.artifacts;
    if (result.error !== undefined) updateData.error = result.error;
  }

  await db.execution.update({
    where: { id: executionId },
    data: updateData,
  });
}

/**
 * Récupère un enregistrement d'exécution par son identifiant.
 *
 * @param executionId - Identifiant de l'exécution.
 * @returns L'enregistrement complet ou `null` si introuvable.
 */
export async function getExecution(
  executionId: string,
): Promise<Record<string, unknown> | null> {
  const doc = await db.execution.findUnique({
    where: { id: executionId },
  });
  return doc as Record<string, unknown> | null;
}

/**
 * Annule une exécution en cours.
 * Seules les exécutions à l'état `'running'` ou `'pending'`
 * appartenant à l'utilisateur spécifié peuvent être annulées.
 *
 * @param executionId - Identifiant de l'exécution.
 * @param userId      - Identifiant du propriétaire.
 * @returns `true` si l'annulation a réussi, `false` sinon.
 */
export async function cancelExecution(
  executionId: string,
  userId: string,
): Promise<boolean> {
  const existing = await db.execution.findUnique({
    where: { id: executionId },
  });

  if (!existing) return false;

  const raw = existing as Record<string, unknown>;

  // Vérification de propriété.
  if (raw.userId !== userId) return false;

  // Vérification de l'état — seuls 'pending' et 'running' sont annulables.
  const currentState = raw.state as ExecutionState;
  if (currentState !== 'pending' && currentState !== 'running') {
    return false;
  }

  await db.execution.update({
    where: { id: executionId },
    data: { state: 'cancelled' },
  });

  return true;
}

/**
 * Liste les exécutions d'un utilisateur avec filtres optionnels.
 *
 * @param userId  - Identifiant du propriétaire.
 * @param filters - Filtres optionnels (agentId, état, limite).
 * @returns Liste des enregistrements d'exécution.
 */
export async function listExecutions(
  userId: string,
  filters?: {
    agentId?: string;
    state?: ExecutionState;
    limit?: number;
  },
): Promise<Record<string, unknown>[]> {
  const whereArray: Array<{ field: string; op: string; value: unknown }> = [
    { field: 'userId', op: '==', value: userId },
  ];

  if (filters?.agentId) {
    whereArray.push({
      field: 'agentId',
      op: '==',
      value: filters.agentId,
    });
  }

  if (filters?.state) {
    whereArray.push({ field: 'state', op: '==', value: filters.state });
  }

  const results = await db.execution.findMany({
    where: whereArray,
    orderBy: { createdAt: 'desc' },
    limit: filters?.limit ?? 50,
  });

  return results.map((r) => r as Record<string, unknown>);
}
