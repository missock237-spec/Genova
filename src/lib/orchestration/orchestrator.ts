// ============================================================
// Gen3ia — Orchestrateur central multi-agents
// ============================================================
//  Module principal de l'orchestration. Coordonne :
//    - La création de tâches et la planification
//    - La sélection d'agents (via le registre)
//    - L'exécution séquentielle des étapes
//    - La gestion des erreurs, tentatives et annulations
//    - La reprise et le suivi des tâches
//
//  Collection Firestore : `orchestration_tasks`
// ============================================================

import { randomUUID } from 'crypto';
import { FirestoreRepository } from '@/lib/firebase/firestore';

import type { OrchestrationTask, OrchestrationStep, TaskStatus } from './types';
import { createPlan } from './planner';
import { executeStep } from './step-executor';

// ----------------------------------------------------------------
// Référentiel Firestore
// ----------------------------------------------------------------

/** Référentiel pour les tâches d'orchestration. */
const taskRepo = new FirestoreRepository<OrchestrationTask>('orchestration_tasks');

// ----------------------------------------------------------------
// Constantes
// ----------------------------------------------------------------

/** Budget par défaut si non spécifié par l'appelant. */
const DEFAULT_BUDGET = {
  maxTokens: 100_000,
  maxCostUsd: 1.0,
  maxDurationMs: 5 * 60 * 1000, // 5 minutes
};

/** Nombre maximum de tentatives par étape. */
const DEFAULT_MAX_RETRIES = 3;

// ----------------------------------------------------------------
// Fonctions utilitaires
// ----------------------------------------------------------------

/**
 * Sérialise une date pour Firestore, en tolérant les valeurs
 * invalides (sentinelles historiques, chaînes, etc.).
 *
 * @param value - Valeur de date potentielle.
 * @returns Date valide ou la date courante en dernier recours.
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
 * Convertit un document Firestore brut en OrchestrationTask.
 * Gère la conversion des dates et les champs manquants.
 *
 * @param raw - Document Firestore désérialisé.
 * @returns Objet OrchestrationTask typé.
 */
function toOrchestrationTask(raw: Record<string, unknown>): OrchestrationTask {
  return {
    id: raw.id as string,
    userId: raw.userId as string,
    orgId: raw.orgId as string | undefined,
    objective: raw.objective as string,
    status: raw.status as TaskStatus,
    plan: (raw.plan as OrchestrationStep[]) ?? [],
    currentStepIndex: (raw.currentStepIndex as number) ?? 0,
    input: (raw.input as Record<string, unknown>) ?? {},
    output: (raw.output as Record<string, unknown>) ?? {},
    selectedAgentIds: (raw.selectedAgentIds as string[]) ?? [],
    selectedModel: (raw.selectedModel as string) ?? '',
    selectedTools: (raw.selectedTools as string[]) ?? [],
    error: raw.error as string | undefined,
    budget: (raw.budget as OrchestrationTask['budget']) ?? DEFAULT_BUDGET,
    tokensUsed: (raw.tokensUsed as number) ?? 0,
    costUsd: (raw.costUsd as number) ?? 0,
    startedAt: raw.startedAt ? safeDate(raw.startedAt) : undefined,
    completedAt: raw.completedAt ? safeDate(raw.completedAt) : undefined,
    correlationId: (raw.correlationId as string) ?? '',
    createdAt: safeDate(raw.createdAt),
    updatedAt: safeDate(raw.updatedAt),
  };
}

/**
 * Sélectionne le meilleur agent pour une étape donnée.
 * Utilise le registre d'agents pour découvrir les agents
 * correspondant à la description de l'étape.
 *
 * @param step        - Étape pour laquelle sélectionner un agent.
 * @param preferredIds - Identifiants d'agents préférés par l'utilisateur.
 * @returns Identifiant de l'agent sélectionné ou `undefined`.
 */
async function selectAgentForStep(
  step: OrchestrationStep,
  preferredIds: string[],
): Promise<string | undefined> {
  // Si l'utilisateur a spécifié des agents, essayer de les utiliser
  for (const agentId of preferredIds) {
    try {
      const { getAgent } = await import('@/lib/agent-registry');
      const agent = await getAgent(agentId);
      if (agent && agent.status === 'active') {
        return agentId;
      }
    } catch {
      // Agent introuvable, passer au suivant
    }
  }

  // Découverte automatique par capacité de planification
  try {
    const { discoverAgents } = await import('@/lib/agent-registry');
    const agents = await discoverAgents({ capability: 'task_planning' });
    if (agents.length > 0) {
      return agents[0]!.id;
    }

    // Repli : premier agent actif avec la capacité chat
    const chatAgents = await discoverAgents({ capability: 'chat' });
    if (chatAgents.length > 0) {
      return chatAgents[0]!.id;
    }
  } catch {
    // Registre indisponible
  }

  return undefined;
}

/**
 * Met à jour une étape spécifique dans le plan d'une tâche.
 * Lit le document, modifie l'étape ciblée et réécrit le tout.
 *
 * @param taskId - Identifiant de la tâche.
 * @param stepId - Identifiant de l'étape à mettre à jour.
 * @param patch  - Champs à modifier sur l'étape.
 */
async function updateStepInTask(
  taskId: string,
  stepId: string,
  patch: Partial<OrchestrationStep>,
): Promise<void> {
  const doc = await taskRepo.findUnique({ where: { id: taskId } });
  if (!doc) return;

  const raw = doc as Record<string, unknown>;
  const plan = (raw.plan as OrchestrationStep[]) ?? [];
  const updatedPlan = plan.map((s) => {
    if (s.id === stepId) {
      return { ...s, ...patch };
    }
    return s;
  });

  await taskRepo.update({
    where: { id: taskId },
    data: { plan: updatedPlan as unknown as Record<string, unknown>[] },
  });
}

// ----------------------------------------------------------------
// Exécution séquentielle des étapes
// ----------------------------------------------------------------

/**
 * Exécute les étapes d'une tâche séquentiellement, en respectant
 * les dépendances entre étapes.
 *
 * @param task - Tâche d'orchestration à exécuter.
 * @returns La tâche mise à jour après exécution.
 */
async function executePlan(task: OrchestrationTask): Promise<OrchestrationTask> {
  const { plan, budget, id: taskId } = task;
  const accumulatedContext: Record<string, unknown> = { ...task.input };
  let totalTokens = task.tokensUsed;
  let totalCost = task.costUsd;
  const startTime = task.startedAt?.getTime() ?? Date.now();

  // Construire un index des étapes par ID pour la résolution des dépendances
  const stepById = new Map<string, OrchestrationStep>();
  for (const step of plan) {
    stepById.set(step.id, step);
  }

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i]!;

    // Vérifier le budget restant
    const elapsed = Date.now() - startTime;
    if (totalTokens >= budget.maxTokens) {
      await failTask(taskId, 'Budget de tokens épuisé');
      return (await taskRepo.findUnique({ where: { id: taskId } }))! as unknown as OrchestrationTask;
    }
    if (totalCost >= budget.maxCostUsd) {
      await failTask(taskId, 'Budget de coût épuisé');
      return (await taskRepo.findUnique({ where: { id: taskId } }))! as unknown as OrchestrationTask;
    }
    if (elapsed >= budget.maxDurationMs) {
      await failTask(taskId, 'Délai d\'exécution dépassé');
      return (await taskRepo.findUnique({ where: { id: taskId } }))! as unknown as OrchestrationTask;
    }

    // Vérifier les dépendances
    if (step.dependsOn && step.dependsOn.length > 0) {
      const allDepsCompleted = step.dependsOn.every((depId) => {
        const dep = stepById.get(depId);
        return dep && (dep.status === 'completed' || dep.status === 'skipped');
      });

      if (!allDepsCompleted) {
        // Marquer l'étape comme ignorée si une dépendance a échoué
        const hasFailedDep = step.dependsOn.some((depId) => {
          const dep = stepById.get(depId);
          return dep && dep.status === 'failed';
        });

        if (hasFailedDep) {
          await updateStepInTask(taskId, step.id, { status: 'skipped' });
          continue;
        }
        // Sinon on attend (dans un vrai système on pourrait utiliser un mécanisme d'attente)
        // Ici on marque en attente et on arrête
        await updateStepInTask(taskId, step.id, { status: 'skipped' });
        continue;
      }
    }

    // Marquer l'étape comme en cours
    await updateStepInTask(taskId, step.id, { status: 'running' });
    await taskRepo.update({
      where: { id: taskId },
      data: { currentStepIndex: i },
    });

    // Exécuter l'étape avec gestion des tentatives
    let stepResult = null;
    let lastError = '';

    for (let attempt = 0; attempt <= step.maxRetries; attempt++) {
      try {
        // Recharger l'étape la plus à jour en cas de retry
        const currentDoc = await taskRepo.findUnique({ where: { id: taskId } });
        if (!currentDoc) break;
        const currentTask = toOrchestrationTask(currentDoc as Record<string, unknown>);
        const currentStep = currentTask.plan[i];
        if (!currentStep) break;

        stepResult = await executeStep(currentStep, currentTask, accumulatedContext);
        lastError = '';
        break; // Succès
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        await updateStepInTask(taskId, step.id, {
          retryCount: attempt + 1,
          error: attempt < step.maxRetries ? undefined : lastError,
        });
      }
    }

    if (!stepResult) {
      // Toutes les tentatives ont échoué
      await updateStepInTask(taskId, step.id, {
        status: 'failed',
        error: lastError || 'Échec inconnu',
      });
      await failTask(taskId, `L'étape ${i + 1} a échoué après ${step.maxRetries + 1} tentatives : ${lastError}`);
      return (await taskRepo.findUnique({ where: { id: taskId } }))! as unknown as OrchestrationTask;
    }

    // Succès : mettre à jour l'étape et accumuler le contexte
    await updateStepInTask(taskId, step.id, {
      status: 'completed',
      output: stepResult.output,
      tokensUsed: stepResult.tokensUsed,
      costUsd: stepResult.costUsd,
      durationMs: stepResult.durationMs,
      error: undefined,
    });

    totalTokens += stepResult.tokensUsed;
    totalCost += stepResult.costUsd;

    // Accumuler la sortie dans le contexte
    accumulatedContext[`step_${i}_output`] = stepResult.output;
    accumulatedContext[`step_${i}_description`] = step.description;
  }

  // Toutes les étapes sont terminées
  const completedDoc = await taskRepo.findUnique({ where: { id: taskId } });
  if (!completedDoc) {
    throw new Error(`Tâche ${taskId} introuvable après exécution`);
  }

  const completedTask = toOrchestrationTask(completedDoc as Record<string, unknown>);

  await taskRepo.update({
    where: { id: taskId },
    data: {
      status: 'completed',
      output: accumulatedContext,
      tokensUsed: totalTokens,
      costUsd: totalCost,
      completedAt: new Date(),
    },
  });

  const finalDoc = await taskRepo.findUnique({ where: { id: taskId } });
  return toOrchestrationTask(finalDoc as Record<string, unknown>);
}

/**
 * Marque une tâche comme échouée.
 *
 * @param taskId - Identifiant de la tâche.
 * @param error  - Message d'erreur.
 */
async function failTask(taskId: string, error: string): Promise<void> {
  await taskRepo.update({
    where: { id: taskId },
    data: {
      status: 'failed',
      error,
      completedAt: new Date(),
    },
  });
}

// ----------------------------------------------------------------
// API publique
// ----------------------------------------------------------------

/**
 * Paramètres de la fonction `orchestrate`.
 */
export interface OrchestrateParams {
  /** Identifiant de l'utilisateur demandeur. */
  userId: string;
  /** Description textuelle de l'objectif à atteindre. */
  objective: string;
  /** Données d'entrée optionnelles pour la tâche. */
  input?: Record<string, unknown>;
  /** Identifiant du modèle LLM à utiliser. */
  model?: string;
  /** Liste des outils à activer. */
  tools?: string[];
  /** Identifiants des agents préférés pour l'exécution. */
  agentIds?: string[];
  /** Budget alloué (valeurs partielles acceptées). */
  budget?: {
    maxTokens?: number;
    maxCostUsd?: number;
    maxDurationMs?: number;
  };
}

/**
 * Orchestre l'exécution complète d'un objectif multi-agents.
 *
 * Étapes :
 * 1. Crée la tâche en base (statut `'planning'`).
 * 2. Génère le plan via le planificateur LLM.
 * 3. Pour chaque étape, sélectionne le meilleur agent et le modèle.
 * 4. Sauvegarde le plan (statut `'in_progress'`).
 * 5. Exécute les étapes séquentiellement en respectant les dépendances.
 * 6. Met à jour la tâche en `'completed'` ou `'failed'`.
 *
 * @param params - Paramètres d'orchestration.
 * @returns La tâche d'orchestration terminée (ou échouée).
 */
export async function orchestrate(params: OrchestrateParams): Promise<OrchestrationTask> {
  const {
    userId,
    objective,
    input = {},
    model = '',
    tools = [],
    agentIds = [],
    budget: budgetOverrides,
  } = params;

  const correlationId = randomUUID();
  const budget = {
    maxTokens: budgetOverrides?.maxTokens ?? DEFAULT_BUDGET.maxTokens,
    maxCostUsd: budgetOverrides?.maxCostUsd ?? DEFAULT_BUDGET.maxCostUsd,
    maxDurationMs: budgetOverrides?.maxDurationMs ?? DEFAULT_BUDGET.maxDurationMs,
  };

  // Étape 1 : créer la tâche en statut 'planning'
  const createdTask = await taskRepo.create({
    data: {
      userId,
      objective,
      status: 'planning',
      plan: [],
      currentStepIndex: 0,
      input,
      output: {},
      selectedAgentIds: agentIds,
      selectedModel: model,
      selectedTools: tools,
      budget,
      tokensUsed: 0,
      costUsd: 0,
      correlationId,
    },
  });

  const taskId = (createdTask as Record<string, unknown>).id as string;

  try {
    // Étape 2 : générer le plan
    const plan = await createPlan(objective, input);

    // Étape 3 : assigner un agent et un modèle à chaque étape
    for (const step of plan) {
      step.taskId = taskId;
      const agentId = await selectAgentForStep(step, agentIds);
      if (agentId) {
        step.agentId = agentId;
        // Charger le modèle par défaut de l'agent si disponible
        try {
          const { getAgent } = await import('@/lib/agent-registry');
          const agent = await getAgent(agentId);
          if (agent?.defaultModel) {
            step.model = agent.defaultModel;
          }
        } catch {
          // Utiliser le modèle sélectionné pour la tâche
        }
      }
      if (!step.model && model) {
        step.model = model;
      }
    }

    // Étape 4 : sauvegarder le plan et passer en in_progress
    await taskRepo.update({
      where: { id: taskId },
      data: {
        plan: plan as unknown as Record<string, unknown>[],
        status: 'in_progress',
        startedAt: new Date(),
      },
    });

    // Recharger la tâche complète
    const taskDoc = await taskRepo.findUnique({ where: { id: taskId } });
    if (!taskDoc) {
      throw new Error(`Tâche ${taskId} introuvable après création du plan`);
    }
    const task = toOrchestrationTask(taskDoc as Record<string, unknown>);

    // Étape 5 : exécuter le plan
    return executePlan(task);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await failTask(taskId, `Erreur d'orchestration : ${errorMsg}`);

    const failedDoc = await taskRepo.findUnique({ where: { id: taskId } });
    if (!failedDoc) {
      throw new Error(`Tâche ${taskId} introuvable après échec`);
    }
    return toOrchestrationTask(failedDoc as Record<string, unknown>);
  }
}

/**
 * Reprend une orchestration interrompue (échouée ou en attente)
 * à partir de l'étape où elle s'est arrêtée.
 *
 * Relance les étapes en échec (si leurs tentatives ne sont pas
 * épuisées) et poursuit l'exécution séquentielle.
 *
 * @param taskId - Identifiant de la tâche à reprendre.
 * @param userId - Identifiant de l'utilisateur (vérification de propriété).
 * @returns La tâche mise à jour.
 * @throws {Error} Si la tâche n'existe pas ou n'appartient pas à l'utilisateur.
 */
export async function resumeOrchestration(
  taskId: string,
  userId: string,
): Promise<OrchestrationTask> {
  const doc = await taskRepo.findUnique({ where: { id: taskId } });
  if (!doc) {
    throw new Error(`resumeOrchestration — tâche introuvable : ${taskId}`);
  }

  const task = toOrchestrationTask(doc as Record<string, unknown>);

  if (task.userId !== userId) {
    throw new Error(
      `resumeOrchestration — accès refusé : la tâche ${taskId} n'appartient pas à l'utilisateur ${userId}`,
    );
  }

  if (task.status !== 'failed' && task.status !== 'waiting') {
    throw new Error(
      `resumeOrchestration — impossible de reprendre une tâche en état '${task.status}'`,
    );
  }

  // Réinitialiser les étapes échouées pour relance
  const resetPlan = task.plan.map((step) => {
    if (step.status === 'failed' && step.retryCount < step.maxRetries) {
      return {
        ...step,
        status: 'pending' as const,
        error: undefined,
      };
    }
    return step;
  });

  await taskRepo.update({
    where: { id: taskId },
    data: {
      plan: resetPlan as unknown as Record<string, unknown>[],
      status: 'in_progress',
      error: undefined,
    },
  });

  // Recharger et exécuter
  const reloadedDoc = await taskRepo.findUnique({ where: { id: taskId } });
  if (!reloadedDoc) {
    throw new Error(`Tâche ${taskId} introuvable après réinitialisation`);
  }

  return executePlan(toOrchestrationTask(reloadedDoc as Record<string, unknown>));
}

/**
 * Annule une orchestration en cours.
 *
 * @param taskId - Identifiant de la tâche à annuler.
 * @param userId - Identifiant de l'utilisateur (vérification de propriété).
 * @returns `true` si l'annulation a réussi, `false` sinon.
 */
export async function cancelOrchestration(
  taskId: string,
  userId: string,
): Promise<boolean> {
  const doc = await taskRepo.findUnique({ where: { id: taskId } });
  if (!doc) return false;

  const task = toOrchestrationTask(doc as Record<string, unknown>);

  if (task.userId !== userId) return false;

  // Seules les tâches actives peuvent être annulées
  const cancellableStatuses: TaskStatus[] = ['pending', 'planning', 'in_progress', 'waiting'];
  if (!cancellableStatuses.includes(task.status)) return false;

  await taskRepo.update({
    where: { id: taskId },
    data: {
      status: 'cancelled',
      completedAt: new Date(),
    },
  });

  return true;
}

/**
 * Récupère le statut actuel d'une tâche d'orchestration.
 *
 * @param taskId - Identifiant de la tâche.
 * @returns La tâche complète ou `null` si introuvable.
 */
export async function getOrchestrationStatus(
  taskId: string,
): Promise<OrchestrationTask | null> {
  const doc = await taskRepo.findUnique({ where: { id: taskId } });
  if (!doc) return null;
  return toOrchestrationTask(doc as Record<string, unknown>);
}

/**
 * Liste les orchestrations d'un utilisateur avec filtre optionnel par statut.
 *
 * @param userId - Identifiant de l'utilisateur.
 * @param status - Filtre optionnel sur le statut.
 * @returns Liste des tâches d'orchestration, triées par date de création décroissante.
 */
export async function listOrchestrations(
  userId: string,
  status?: TaskStatus,
): Promise<OrchestrationTask[]> {
  const where: Array<{ field: string; op: string; value: unknown }> = [
    { field: 'userId', op: '==', value: userId },
  ];

  if (status) {
    where.push({ field: 'status', op: '==', value: status });
  }

  const docs = await taskRepo.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    limit: 100,
  });

  return docs.map((d) => toOrchestrationTask(d as Record<string, unknown>));
}
