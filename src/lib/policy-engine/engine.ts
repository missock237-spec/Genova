/**
 * @module policy-engine/engine
 * @description Moteur d'évaluation des politiques Gen3ia.
 * Implémente l'évaluation contextuelle des règles, la gestion du cycle
 * de vie des politiques et les politiques par défaut intégrées.
 */

import { db } from '@/lib/db';
import type {
  PolicyRule,
  PolicyEffect,
  PolicyConditions,
  PolicyEvaluationResult,
  MatchedRule,
} from './types';

/**
 * Contexte d'évaluation transmis au moteur de politiques.
 * Décrit l'action demandée et son environnement.
 * @interface EvaluationContext
 */
export interface EvaluationContext {
  /** Identifiant de l'utilisateur */
  userId: string;
  /** Rôle de l'utilisateur */
  role: string;
  /** Action demandée */
  action: string;
  /** Type de ressource ciblée */
  resourceType?: string;
  /** Identifiant de l'agent */
  agentId?: string;
  /** Identifiant de l'outil */
  toolId?: string;
  /** Identifiant du modèle */
  modelId?: string;
  /** Coût estimé de l'opération en USD */
  costUsd?: number;
  /** Niveau de sensibilité des données */
  dataSensitivity?: string;
  /** Identifiant de l'organisation */
  orgId?: string;
}

/**
 * Politiques par défaut intégrées au moteur.
 * Ces politiques sont toujours présentes et ne peuvent pas être supprimées.
 * @constant
 */
export const DEFAULT_POLICIES: PolicyRule[] = [
  {
    id: 'default-block-prod-db',
    name: 'Blocage de l\'accès à la base de données de production',
    description:
      'Bloque tout accès en écriture à la base de données de production pour les rôles non-administrateurs.',
    effect: 'deny',
    conditions: {
      resourceType: 'production_database',
      action: 'write',
      role: '!admin',
    },
    priority: 100,
    enabled: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  },
  {
    id: 'default-require-deploy-approval',
    name: 'Approbation requise pour les déploiements',
    description:
      'Toute opération de déploiement nécessite une approbation humaine préalable.',
    effect: 'require_approval',
    conditions: {
      resourceType: 'deployment',
      action: 'deploy',
    },
    priority: 90,
    enabled: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  },
  {
    id: 'default-log-destructive-ops',
    name: 'Journalisation des opérations destructrices',
    description:
      'Enregistre toute utilisation d\'outils à effet destructeur (suppression, réécriture).',
    effect: 'log_only',
    conditions: {
      action: 'delete',
    },
    priority: 10,
    enabled: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  },
  {
    id: 'default-deny-cross-user-data',
    name: 'Interdiction d\'accès aux données d\'autres utilisateurs',
    description:
      'Empêche tout agent d\'accéder aux données appartenant à un autre utilisateur.',
    effect: 'deny',
    conditions: {
      resourceType: 'user_data',
      action: 'read',
      dataSensitivity: 'restricted',
    },
    priority: 95,
    enabled: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  },
  {
    id: 'default-require-high-cost-approval',
    name: 'Approbation requise pour les opérations coûteuses',
    description:
      'Toute opération dont le coût dépasse 100 crédits nécessite une approbation.',
    effect: 'require_approval',
    conditions: {
      costThreshold: 100,
    },
    priority: 80,
    enabled: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  },
  {
    id: 'default-allow-read',
    name: 'Autorisation par défaut des lectures',
    description:
      'Autorise les opérations de lecture par défaut, sauf si une règle plus prioritaire s\'y oppose.',
    effect: 'allow',
    conditions: {
      action: 'read',
    },
    priority: -1,
    enabled: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  },
];

/**
 * Vérifie si une condition de rôle correspond.
 * Supporte la négation avec le préfixe '!'.
 *
 * @param condition - Valeur de la condition (ex: 'admin', '!admin').
 * @param actual - Valeur réelle du contexte.
 * @returns Vrai si la condition correspond.
 * @internal
 */
function matchConditionValue(condition: string | undefined, actual: string | undefined): boolean {
  if (condition === undefined) return true;
  if (actual === undefined) return false;

  // Support de la négation : !admin correspond à tout sauf admin
  if (condition.startsWith('!')) {
    const negatedRole = condition.slice(1);
    return actual !== negatedRole;
  }

  // Support des valeurs multiples séparées par des virgules
  const allowedValues = condition.split(',').map((v) => v.trim().toLowerCase());
  return allowedValues.includes(actual.toLowerCase());
}

/**
 * Vérifie si toutes les conditions d'une règle correspondent au contexte.
 *
 * @param conditions - Conditions de la règle.
 * @param context - Contexte d'évaluation.
 * @returns Vrai si toutes les conditions définies correspondent.
 * @internal
 */
function conditionsMatch(conditions: PolicyConditions, context: EvaluationContext): boolean {
  if (conditions.resourceType !== undefined && conditions.resourceType !== context.resourceType) {
    return false;
  }

  if (conditions.action !== undefined && !matchConditionValue(conditions.action, context.action)) {
    return false;
  }

  if (conditions.role !== undefined && !matchConditionValue(conditions.role, context.role)) {
    return false;
  }

  if (conditions.agentId !== undefined && conditions.agentId !== context.agentId) {
    return false;
  }

  if (conditions.toolId !== undefined && conditions.toolId !== context.toolId) {
    return false;
  }

  if (conditions.modelId !== undefined && conditions.modelId !== context.modelId) {
    return false;
  }

  if (conditions.dataSensitivity !== undefined && conditions.dataSensitivity !== context.dataSensitivity) {
    return false;
  }

  // Condition de seuil de coût
  if (conditions.costThreshold !== undefined) {
    const actualCost = context.costUsd ?? 0;
    if (actualCost <= conditions.costThreshold) {
      return false;
    }
  }

  return true;
}

/**
 * Génère un identifiant unique pour une nouvelle politique.
 * @returns Identifiant au format UUID.
 * @internal
 */
function generatePolicyId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `policy-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Convertit un effet de politique en résultat d'autorisation.
 * @param effect - Effet de la politique.
 * @returns Vrai si l'action est autorisée.
 * @internal
 */
function effectToAllowed(effect: PolicyEffect): boolean {
  return effect === 'allow' || effect === 'log_only';
}

/**
 * Évalue toutes les politiques actives contre un contexte donné.
 * Retourne l'effet de la règle de plus haute priorité qui correspond.
 * Si aucune règle ne correspond, l'action est autorisée par défaut.
 *
 * @param context - Contexte d'évaluation décrivant l'action et l'environnement.
 * @returns Résultat de l'évaluation avec la décision et les règles correspondantes.
 *
 * @example
 * ```typescript
 * const résultat = await evaluate({
 *   userId: 'user-123',
 *   role: 'user',
 *   action: 'write',
 *   resourceType: 'production_database',
 * });
 * console.log(résultat.allowed); // false
 * ```
 */
export async function evaluate(context: EvaluationContext): Promise<PolicyEvaluationResult> {
  // Récupérer les politiques personnalisées depuis Firestore
  let customPolicies: PolicyRule[] = [];
  try {
    const records = await db.policies.findMany({
      where: { enabled: true },
    });
    customPolicies = records.map(
      (r: Record<string, unknown>) =>
        ({
          ...r,
          createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt as string),
          updatedAt: r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt as string),
        }) as PolicyRule,
    );
  } catch {
    // En cas d'erreur de lecture, on utilise uniquement les politiques par défaut
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          event: 'policy_engine_db_read_failed',
          fallback: 'default_policies_only',
        }),
      );
    }
  }

  // Fusionner les politiques par défaut avec les politiques personnalisées
  const allPolicies = [...DEFAULT_POLICIES, ...customPolicies];

  // Trouver toutes les règles correspondantes
  const matchedRules: MatchedRule[] = [];

  for (const rule of allPolicies) {
    if (!rule.enabled) continue;
    if (conditionsMatch(rule.conditions, context)) {
      matchedRules.push({
        ruleId: rule.id,
        ruleName: rule.name,
        effect: rule.effect,
      });
    }
  }

  // Si aucune règle ne correspond, autoriser par défaut
  if (matchedRules.length === 0) {
    return {
      allowed: true,
      effect: 'allow',
      matchedRules: [],
      requiresApproval: false,
      reason: undefined,
    };
  }

  // Trouver la règle de plus haute priorité
  // On doit trier selon la priorité des règles originales
  const policyMap = new Map<string, number>();
  for (const rule of allPolicies) {
    policyMap.set(rule.id, rule.priority);
  }

  matchedRules.sort((a, b) => {
    const priorityA = policyMap.get(a.ruleId) ?? 0;
    const priorityB = policyMap.get(b.ruleId) ?? 0;
    return priorityB - priorityA;
  });

  const topRule = matchedRules[0];
  const allowed = effectToAllowed(topRule.effect);
  const requiresApproval = topRule.effect === 'require_approval';

  // Construire la raison
  let reason: string | undefined;
  if (!allowed || requiresApproval) {
    const rule = allPolicies.find((r) => r.id === topRule.ruleId);
    reason = rule?.description;
  }

  // Journaliser l'évaluation si log_only
  if (topRule.effect === 'log_only' && process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        event: 'policy_evaluation_log_only',
        context: {
          userId: context.userId,
          role: context.role,
          action: context.action,
          resourceType: context.resourceType,
          agentId: context.agentId,
          orgId: context.orgId,
        },
        matchedRule: topRule,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  return {
    allowed,
    effect: topRule.effect,
    matchedRules,
    requiresApproval,
    reason,
  };
}

/**
 * Crée une nouvelle politique personnalisée.
 *
 * @param data - Données de la politique (sans id, createdAt, updatedAt).
 * @returns La politique créée avec ses identifiants et dates.
 */
export async function createPolicy(
  data: Omit<PolicyRule, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<PolicyRule> {
  const now = new Date();
  const policy: PolicyRule = {
    ...data,
    id: generatePolicyId(),
    createdAt: now,
    updatedAt: now,
  };

  await db.policies.create({
    data: {
      id: policy.id,
      name: policy.name,
      description: policy.description,
      effect: policy.effect,
      conditions: policy.conditions as Record<string, unknown>,
      priority: policy.priority,
      enabled: policy.enabled,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    },
  });

  return policy;
}

/**
 * Met à jour une politique existante.
 *
 * @param id - Identifiant de la politique à modifier.
 * @param patch - Champs à mettre à jour.
 * @returns La politique mise à jour.
 * @throws {Error} Si la politique n'existe pas.
 */
export async function updatePolicy(
  id: string,
  patch: Partial<PolicyRule>,
): Promise<PolicyRule> {
  // Vérifier l'existence
  const existing = await db.policies.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Politique introuvable : ${id}`);
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.name !== undefined) updateData.name = patch.name;
  if (patch.description !== undefined) updateData.description = patch.description;
  if (patch.effect !== undefined) updateData.effect = patch.effect;
  if (patch.conditions !== undefined) updateData.conditions = patch.conditions as Record<string, unknown>;
  if (patch.priority !== undefined) updateData.priority = patch.priority;
  if (patch.enabled !== undefined) updateData.enabled = patch.enabled;

  await db.policies.update({
    where: { id },
    data: updateData,
  });

  const updated = await db.policies.findUnique({ where: { id } });
  return {
    ...updated,
    createdAt: updated.createdAt instanceof Date
      ? updated.createdAt
      : new Date(updated.createdAt as string),
    updatedAt: updated.updatedAt instanceof Date
      ? updated.updatedAt
      : new Date(updated.updatedAt as string),
  } as PolicyRule;
}

/**
 * Supprime une politique personnalisée.
 * Les politiques par défaut (id commençant par 'default-') ne peuvent pas être supprimées.
 *
 * @param id - Identifiant de la politique à supprimer.
 * @throws {Error} Si la politique est une politique par défaut ou introuvable.
 */
export async function deletePolicy(id: string): Promise<void> {
  if (id.startsWith('default-')) {
    throw new Error('Impossible de supprimer une politique par défaut intégrée.');
  }

  const existing = await db.policies.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Politique introuvable : ${id}`);
  }

  await db.policies.delete({ where: { id } });
}

/**
 * Liste les politiques avec filtrage optionnel.
 * Retourne les politiques par défaut et les politiques personnalisées.
 *
 * @param filters - Filtres optionnels (enabled).
 * @returns Tableau de politiques triées par priorité décroissante.
 */
export async function listPolicies(
  filters?: { enabled?: boolean },
): Promise<PolicyRule[]> {
  const where: Record<string, unknown> = {};
  if (filters?.enabled !== undefined) {
    where.enabled = filters.enabled;
  }

  let customPolicies: PolicyRule[] = [];
  try {
    const records = await db.policies.findMany({
      where,
      orderBy: { priority: 'desc' },
    });
    customPolicies = records.map(
      (r: Record<string, unknown>) =>
        ({
          ...r,
          createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt as string),
          updatedAt: r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt as string),
        }) as PolicyRule,
    );
  } catch {
    // Retourner uniquement les politiques par défaut en cas d'erreur
  }

  // Filtrer les politiques par défaut selon le filtre
  let defaultFiltered = DEFAULT_POLICIES;
  if (filters?.enabled !== undefined) {
    defaultFiltered = DEFAULT_POLICIES.filter((p) => p.enabled === filters.enabled);
  }

  // Fusionner et trier par priorité
  const allPolicies = [...defaultFiltered, ...customPolicies];
  allPolicies.sort((a, b) => b.priority - a.priority);

  return allPolicies;
}
