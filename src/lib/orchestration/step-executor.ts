// ============================================================
// Gen3ia — Exécuteur d'étapes d'orchestration
// ============================================================
//  Module responsable de l'exécution individuelle de chaque
//  étape d'un plan d'orchestration.
//
//  Stratégie d'exécution :
//    1. Tente d'utiliser le runtime d'agents (executeAgent)
//       pour une exécution complète avec mémoire et outils.
//    2. En cas d'indisponibilité, effectue un appel direct au
//       routeur de modèles (routeAndExecute) en fallback.
//
//  Suivi : chaque étape renvoie un résultat structuré avec
//  les métriques de consommation (tokens, coût, durée).
// ============================================================

import type { OrchestrationStep, OrchestrationTask } from './types';

// ----------------------------------------------------------------
// Types internes
// ----------------------------------------------------------------

/** Résultat de l'exécution d'une étape. */
export interface StepExecutionResult {
  /** Données de sortie produites par l'étape. */
  output: Record<string, unknown>;
  /** Nombre total de tokens consommés. */
  tokensUsed: number;
  /** Coût en USD de l'exécution. */
  costUsd: number;
  /** Durée réelle d'exécution en millisecondes. */
  durationMs: number;
}

/** Estimation grossière du coût par 1000 tokens en USD. */
const COST_PER_1K_TOKENS = 0.003;

// ----------------------------------------------------------------
// Exécution via le runtime d'agents
// ----------------------------------------------------------------

/**
 * Tente d'exécuter une étape via le runtime d'agents.
 * Charge l'agent depuis le registre, construit le contexte
 * d'exécution et appelle `executeAgent`.
 *
 * @param step              - Étape à exécuter.
 * @param task              - Tâche parente.
 * @param accumulatedContext - Contexte accumulé des étapes précédentes.
 * @returns Résultat de l'exécution ou `null` si indisponible.
 */
async function executeViaAgentRuntime(
  step: OrchestrationStep,
  task: OrchestrationTask,
  accumulatedContext: Record<string, unknown>,
): Promise<StepExecutionResult | null> {
  if (!step.agentId) return null;

  try {
    const { getAgent } = await import('@/lib/agent-registry');
    const { executeAgent } = await import('@/lib/agent-runtime');

    // Charger la définition de l'agent
    const agentDef = await getAgent(step.agentId);
    if (!agentDef) {
      console.warn(
        `[step-executor] Agent ${step.agentId} introuvable dans le registre. ` +
        `Basculement vers l'appel direct au modèle.`,
      );
      return null;
    }

    // Construire le contexte d'exécution
    const executionContext: Parameters<typeof executeAgent>[0] = {
      agentId: step.agentId,
      agent: agentDef,
      userId: task.userId,
      orgId: task.orgId,
      taskId: task.id,
      input: {
        ...accumulatedContext,
        ...step.input,
        __stepDescription: step.description,
        __objective: task.objective,
      },
      model: step.model ?? agentDef.defaultModel ?? task.selectedModel,
      tools: step.tools.length > 0 ? step.tools : task.selectedTools,
      budget: {
        maxTokens: Math.floor(task.budget.maxTokens / Math.max(task.plan.length, 1)),
        maxDurationMs: Math.floor(task.budget.maxDurationMs / Math.max(task.plan.length, 1)),
        maxCostUsd: task.budget.maxCostUsd / Math.max(task.plan.length, 1),
      },
      metadata: {
        stepId: step.id,
        stepIndex: step.index,
        correlationId: task.correlationId,
      },
      correlationId: task.correlationId,
    };

    const startTime = Date.now();
    const result = await executeAgent(executionContext);
    const durationMs = Date.now() - startTime;

    // Vérifier l'état du résultat
    if (result.state === 'failed' || result.state === 'timeout') {
      throw new Error(result.error ?? `Échec de l'exécution (état : ${result.state})`);
    }

    const totalTokens = result.tokensUsed.prompt + result.tokensUsed.completion;
    const costUsd = result.costUsd;

    return {
      output: result.output,
      tokensUsed: totalTokens,
      costUsd,
      durationMs,
    };
  } catch (error) {
    // Si l'erreur est liée à l'agent lui-même, on bascule en fallback
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes('agent introuvable') ||
      msg.includes('Agent')
    ) {
      console.warn(
        `[step-executor] Runtime d'agents indisponible pour l'étape ${step.id}. ` +
        `Basculement vers l'appel direct. Raison : ${msg}`,
      );
      return null;
    }
    throw error;
  }
}

// ----------------------------------------------------------------
// Exécution directe via le routeur de modèles (fallback)
// ----------------------------------------------------------------

/**
 * Exécute une étape via un appel direct au routeur de modèles.
 * Utilisé en fallback lorsque le runtime d'agents est indisponible
 * ou lorsque l'étape n'a pas d'agent assigné.
 *
 * @param step              - Étape à exécuter.
 * @param task              - Tâche parente.
 * @param accumulatedContext - Contexte accumulé des étapes précédentes.
 * @returns Résultat de l'exécution.
 */
async function executeViaModelRouter(
  step: OrchestrationStep,
  task: OrchestrationTask,
  accumulatedContext: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const { routeAndExecute } = await import('@/lib/model-router');

  // Construire le prompt utilisateur
  const contextStr = Object.keys(accumulatedContext).length > 0
    ? `\n\nContexte des étapes précédentes :\n${JSON.stringify(accumulatedContext, null, 2)}`
    : '';

  const inputStr = Object.keys(step.input).length > 0
    ? `\n\nDonnées d'entrée de cette étape :\n${JSON.stringify(step.input, null, 2)}`
    : '';

  const userMessage =
    `Objectif global : ${task.objective}\n\n` +
    `Étape courante : ${step.description}${contextStr}${inputStr}\n\n` +
    `Réponds de manière concise et structurée. Si tu produis des données, ` +
    `fournis-les au format JSON.`;

  const startTime = Date.now();

  const response = await routeAndExecute({
    model: step.model ?? task.selectedModel,
    messages: [
      {
        role: 'system',
        content: `Tu es un assistant d'orchestration. Tu exécutes l'étape décrite. ` +
          `Fournis un résultat clair et exploitable par les étapes suivantes.`,
      },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.4,
    maxTokens: Math.floor(task.budget.maxTokens / Math.max(task.plan.length, 1)),
  });

  const durationMs = Date.now() - startTime;
  const totalTokens = response.usage.promptTokens + response.usage.completionTokens;

  // Estimer le coût à partir des tokens
  const costUsd = (totalTokens / 1000) * COST_PER_1K_TOKENS;

  // Construire la sortie structurée
  const output: Record<string, unknown> = {
    text: response.content,
    model: response.model,
    provider: response.provider,
  };

  // Tenter de parser le contenu en JSON pour des données structurées
  try {
    const trimmed = response.content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const parsed = JSON.parse(trimmed);
      output.structured = parsed;
    }
  } catch {
    // Le contenu n'est pas du JSON — on garde le texte brut
  }

  return { output, tokensUsed: totalTokens, costUsd, durationMs };
}

// ----------------------------------------------------------------
// Fonction principale
// ----------------------------------------------------------------

/**
 * Exécute une étape individuelle d'orchestration.
 *
 * La stratégie d'exécution est :
 * 1. Si un agent est assigné à l'étape, tente l'exécution via
 *    le runtime d'agents (`executeAgent`).
 * 2. En cas d'échec ou d'indisponibilité, bascule vers un
 *    appel direct au routeur de modèles (`routeAndExecute`).
 *
 * Le résultat inclut les données de sortie, les tokens consommés,
 * le coût estimé et la durée d'exécution.
 *
 * @param step              - Étape à exécuter.
 * @param task              - Tâche parente (pour le contexte et le budget).
 * @param accumulatedContext - Contexte accumulé des étapes précédentes.
 * @returns Résultat structuré de l'exécution.
 * @throws {Error} Si l'exécution échoue après toutes les stratégies.
 */
export async function executeStep(
  step: OrchestrationStep,
  task: OrchestrationTask,
  accumulatedContext: Record<string, unknown>,
): Promise<StepExecutionResult> {
  // Stratégie 1 : exécution via le runtime d'agents
  if (step.agentId) {
    const agentResult = await executeViaAgentRuntime(step, task, accumulatedContext);
    if (agentResult) {
      return agentResult;
    }
  }

  // Stratégie 2 : appel direct au routeur de modèles
  return executeViaModelRouter(step, task, accumulatedContext);
}
