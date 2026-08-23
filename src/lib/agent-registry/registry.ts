// ============================================================
// Gen3ia — Registre d'agents (CRUD + découverte)
// ============================================================
//  Module central de gestion des définitions d'agents :
//    - Enregistrement, mise à jour, désactivation
//    - Découverte par capacité / modèle / outil
//    - Gestion des versions publiées
//
//  Collection Firestore : `agents` (existante)
//  Collection versions  : `agent_versions` (nouvelle)
// ============================================================

import { db } from '@/lib/db';
import { FirestoreRepository } from '@/lib/firebase/firestore';

import type {
  AgentCapability,
  AgentDefinition,
  AgentStatus,
  AgentVersion,
} from './types';

/** Référentiel pour les versions d'agents (collection `agent_versions`). */
const agentVersionRepo = new FirestoreRepository<AgentVersion>('agent_versions');

/**
 * Convertit un objet Date potentiellement invalide (ex. sentinelles
 * historiques `_methodName`) en Date exploitable ou en date actuelle.
 */
function safeDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (typeof value === 'number' && value > 0) return new Date(value);
  return new Date();
}

/**
 * Convertit un enregistrement brut Firestore en `AgentDefinition` typé.
 * Gère les dates potentiellement mal sérialisées.
 */
function toAgentDefinition(raw: Record<string, unknown>): AgentDefinition {
  return {
    id: raw.id as string,
    name: (raw.name as string) ?? '',
    description: (raw.description as string) ?? '',
    version: (raw.version as string) ?? '0.1.0',
    status: (raw.status as AgentStatus) ?? 'active',
    capabilities: (raw.capabilities as AgentCapability[]) ?? [],
    compatibleModels: (raw.compatibleModels as string[]) ?? [],
    compatibleTools: (raw.compatibleTools as string[]) ?? [],
    defaultModel: raw.defaultModel as string | undefined,
    instructions: (raw.instructions as string) ?? '',
    temperature: raw.temperature as number | undefined,
    maxTokens: raw.maxTokens as number | undefined,
    metadata: (raw.metadata as Record<string, unknown>) ?? {},
    estimatedCostPerTask: (raw.estimatedCostPerTask as number) ?? 0,
    permissions: (raw.permissions as string[]) ?? [],
    limits: (raw.limits as AgentDefinition['limits']) ?? {},
    createdAt: safeDate(raw.createdAt),
    updatedAt: safeDate(raw.updatedAt),
  };
}

/**
 * Enregistre un nouvel agent dans le registre.
 *
 * @param data - Données de définition (sans `id`, `createdAt`, `updatedAt`).
 * @returns La définition complète de l'agent créé, avec l'ID généré.
 * @throws {Error} Si les champs obligatoires sont manquants.
 */
export async function registerAgent(
  data: Omit<AgentDefinition, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<AgentDefinition> {
  if (!data.name?.trim()) {
    throw new Error('registerAgent — le nom de l\'agent est obligatoire');
  }
  if (!data.instructions?.trim()) {
    throw new Error('registerAgent — les instructions de l\'agent sont obligatoires');
  }
  if (!data.capabilities || data.capabilities.length === 0) {
    throw new Error('registerAgent — au moins une capacité est requise');
  }

  const created = await db.agent.create({
    data: {
      name: data.name,
      description: data.description ?? '',
      version: data.version ?? '0.1.0',
      status: data.status ?? 'active',
      capabilities: data.capabilities,
      compatibleModels: data.compatibleModels ?? [],
      compatibleTools: data.compatibleTools ?? [],
      defaultModel: data.defaultModel ?? null,
      instructions: data.instructions,
      temperature: data.temperature ?? null,
      maxTokens: data.maxTokens ?? null,
      metadata: data.metadata ?? {},
      estimatedCostPerTask: data.estimatedCostPerTask ?? 0,
      permissions: data.permissions ?? [],
      limits: data.limits ?? {},
      // Le propriétaire (userId) est stocké dans le champ `userId`
      // pour permettre le filtrage par utilisateur.
    },
  });

  return toAgentDefinition(created as Record<string, unknown>);
}

/**
 * Met à jour un agent existant après vérification de propriété.
 *
 * @param id     - Identifiant de l'agent.
 * @param userId - Identifiant du propriétaire (vérifié avant mise à jour).
 * @param patch  - Champs à mettre à jour (fusion partielle).
 * @returns La définition mise à jour.
 * @throws {Error} Si l'agent n'existe pas ou n'appartient pas à l'utilisateur.
 */
export async function updateAgent(
  id: string,
  userId: string,
  patch: Partial<AgentDefinition>,
): Promise<AgentDefinition> {
  const existing = await db.agent.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`updateAgent — agent introuvable : ${id}`);
  }

  const raw = existing as Record<string, unknown>;
  if (raw.userId !== userId) {
    throw new Error(
      `updateAgent — accès refusé : l'agent ${id} n'appartient pas à l'utilisateur ${userId}`,
    );
  }

  // Construction du payload de mise à jour (seuls les champs fournis).
  const updatePayload: Record<string, unknown> = {};
  if (patch.name !== undefined) updatePayload.name = patch.name;
  if (patch.description !== undefined) updatePayload.description = patch.description;
  if (patch.version !== undefined) updatePayload.version = patch.version;
  if (patch.status !== undefined) updatePayload.status = patch.status;
  if (patch.capabilities !== undefined) updatePayload.capabilities = patch.capabilities;
  if (patch.compatibleModels !== undefined) updatePayload.compatibleModels = patch.compatibleModels;
  if (patch.compatibleTools !== undefined) updatePayload.compatibleTools = patch.compatibleTools;
  if (patch.defaultModel !== undefined) updatePayload.defaultModel = patch.defaultModel;
  if (patch.instructions !== undefined) updatePayload.instructions = patch.instructions;
  if (patch.temperature !== undefined) updatePayload.temperature = patch.temperature;
  if (patch.maxTokens !== undefined) updatePayload.maxTokens = patch.maxTokens;
  if (patch.metadata !== undefined) updatePayload.metadata = patch.metadata;
  if (patch.estimatedCostPerTask !== undefined) updatePayload.estimatedCostPerTask = patch.estimatedCostPerTask;
  if (patch.permissions !== undefined) updatePayload.permissions = patch.permissions;
  if (patch.limits !== undefined) updatePayload.limits = patch.limits;

  const updated = await db.agent.update({
    where: { id },
    data: updatePayload,
  });

  return toAgentDefinition(updated as Record<string, unknown>);
}

/**
 * Désactive un agent en passant son statut à `'inactive'`.
 *
 * @param id     - Identifiant de l'agent.
 * @param userId - Identifiant du propriétaire.
 * @throws {Error} Si l'agent n'existe pas ou n'appartient pas à l'utilisateur.
 */
export async function deactivateAgent(id: string, userId: string): Promise<void> {
  const existing = await db.agent.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`deactivateAgent — agent introuvable : ${id}`);
  }

  const raw = existing as Record<string, unknown>;
  if (raw.userId !== userId) {
    throw new Error(
      `deactivateAgent — accès refusé : l'agent ${id} n'appartient pas à l'utilisateur ${userId}`,
    );
  }

  await db.agent.update({
    where: { id },
    data: { status: 'inactive' },
  });
}

/**
 * Récupère un agent par son identifiant.
 *
 * @param id - Identifiant de l'agent.
 * @returns La définition complète ou `null` si introuvable.
 */
export async function getAgent(id: string): Promise<AgentDefinition | null> {
  const doc = await db.agent.findUnique({ where: { id } });
  if (!doc) return null;
  return toAgentDefinition(doc as Record<string, unknown>);
}

/**
 * Liste les agents d'un utilisateur avec filtres optionnels.
 *
 * @param userId  - Identifiant du propriétaire.
 * @param filters - Filtres optionnels (statut, capacité).
 * @returns Liste des définitions correspondantes.
 */
export async function listAgents(
  userId: string,
  filters?: { status?: AgentStatus; capability?: AgentCapability },
): Promise<AgentDefinition[]> {
  const where: Record<string, unknown> = { userId };

  if (filters?.status) {
    where.status = filters.status;
  }

  // Firestore ne supporte pas les filtres sur les éléments de tableau
  // avec array-contains dans la syntaxe objet. On utilise la forme tableau.
  // Pour simplifier, si un filtre de capacité est demandé, on le passe
  // en `has` pour que le normalisateur le convertisse en `array-contains`.
  const whereArray = [{ field: 'userId', op: '==' as const, value: userId }];

  if (filters?.status) {
    whereArray.push({ field: 'status', op: '==' as const, value: filters.status });
  }

  if (filters?.capability) {
    whereArray.push({
      field: 'capabilities',
      op: 'array-contains' as const,
      value: filters.capability,
    });
  }

  const results = await db.agent.findMany({
    where: whereArray,
    orderBy: { createdAt: 'desc' },
  });

  return results.map((r) => toAgentDefinition(r as Record<string, unknown>));
}

/**
 * Découvre des agents correspondant à des critères de recherche.
 * Recherche à l'échelle du système, agents actifs uniquement.
 *
 * @param query - Critères de recherche (capacité, modèle, outil).
 * @returns Liste des agents actifs correspondants, triés par coût estimé croissant.
 */
export async function discoverAgents(query: {
  capability?: AgentCapability;
  model?: string;
  tool?: string;
}): Promise<AgentDefinition[]> {
  const whereArray: Array<{ field: string; op: string; value: unknown }> = [
    { field: 'status', op: '==', value: 'active' },
  ];

  if (query.capability) {
    whereArray.push({
      field: 'capabilities',
      op: 'array-contains',
      value: query.capability,
    });
  }

  if (query.model) {
    whereArray.push({
      field: 'compatibleModels',
      op: 'array-contains',
      value: query.model,
    });
  }

  if (query.tool) {
    whereArray.push({
      field: 'compatibleTools',
      op: 'array-contains',
      value: query.tool,
    });
  }

  const results = await db.agent.findMany({
    where: whereArray,
    orderBy: { estimatedCostPerTask: 'asc' },
    limit: 50,
  });

  return results.map((r) => toAgentDefinition(r as Record<string, unknown>));
}

/**
 * Publie une nouvelle version d'un agent.
 * Crée un instantané immuable de l'état actuel de l'agent
 * et marque les versions précédentes comme non-latest.
 *
 * @param agentId  - Identifiant de l'agent.
 * @param userId   - Identifiant du propriétaire (vérifié).
 * @param changelog - Description des modifications apportées.
 * @returns La version publiée.
 * @throws {Error} Si l'agent n'existe pas ou n'appartient pas à l'utilisateur.
 */
export async function publishVersion(
  agentId: string,
  userId: string,
  changelog: string,
): Promise<AgentVersion> {
 // Récupération de l'état actuel de l'agent.
  const existing = await db.agent.findUnique({ where: { id: agentId } });
  if (!existing) {
    throw new Error(`publishVersion — agent introuvable : ${agentId}`);
  }

  const raw = existing as Record<string, unknown>;
  if (raw.userId !== userId) {
    throw new Error(
      `publishVersion — accès refusé : l'agent ${agentId} n'appartient pas à l'utilisateur ${userId}`,
    );
  }

  const agentDef = toAgentDefinition(raw);

  // Marquer toutes les versions existantes comme non-latest.
  const previousVersions = await agentVersionRepo.findMany({
    where: [
      { field: 'agentId', op: '==', value: agentId },
      { field: 'isLatest', op: '==', value: true },
    ],
  });

  for (const prev of previousVersions) {
    const prevId = (prev as Record<string, unknown>).id as string;
    await agentVersionRepo.update({
      where: { id: prevId },
      data: { isLatest: false },
    });
  }

  // Créer la nouvelle version avec l'instantané.
  const version = await agentVersionRepo.create({
    data: {
      agentId,
      version: agentDef.version,
      changelog,
      definition: agentDef as unknown as Record<string, unknown>,
      isLatest: true,
    },
  });

  const versionRaw = version as Record<string, unknown>;
  return {
    id: versionRaw.id as string,
    agentId,
    version: agentDef.version,
    changelog,
    definition: agentDef,
    publishedAt: safeDate(versionRaw.publishedAt),
    isLatest: true,
  };
}

/**
 * Récupère toutes les versions publiées d'un agent.
 *
 * @param agentId - Identifiant de l'agent parent.
 * @returns Liste des versions, triées de la plus récente à la plus ancienne.
 */
export async function getAgentVersions(agentId: string): Promise<AgentVersion[]> {
  const results = await agentVersionRepo.findMany({
    where: [{ field: 'agentId', op: '==', value: agentId }],
    orderBy: { publishedAt: 'desc' },
  });

  return results.map((r) => {
    const raw = r as Record<string, unknown>;
    const def = raw.definition as Record<string, unknown>;
    return {
      id: raw.id as string,
      agentId: raw.agentId as string,
      version: raw.version as string,
      changelog: (raw.changelog as string) ?? '',
      definition: toAgentDefinition(def),
      publishedAt: safeDate(raw.publishedAt),
      isLatest: (raw.isLatest as boolean) ?? false,
    };
  });
}
