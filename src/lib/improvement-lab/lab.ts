/**
 * @module improvement-lab/lab
 * @description Laboratoire d'amélioration Gen3ia.
 * Gère le cycle de vie complet des expériences d'optimisation :
 * création, exécution, approbation, promotion et retour arrière.
 */

import { db } from '@/lib/db';
import { benchmark } from './benchmarker';
import type { ImprovementExperiment, ExperimentStatus } from './types';

/**
 * Génère un identifiant unique pour une expérience.
 * @returns Identifiant au format UUID.
 * @internal
 */
function generateExperimentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `exp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Crée une nouvelle expérience d'amélioration.
 * L'expérience est créée en statut 'draft' avec zéro itération.
 *
 * @param data - Données de l'expérience (sans id, createdAt, updatedAt, status, iterations).
 * @returns L'expérience créée.
 *
 * @example
 * ```typescript
 * const exp = await createExperiment({
 *   name: 'Optimisation du prompt de résumé',
 *   description: 'Tester un prompt plus concis pour le résumé automatique.',
 *   type: 'prompt_optimization',
 *   targetAgentId: 'agent-summarizer',
 *   targetMetric: 'accuracy',
 *   baselineValue: 0.72,
 *   config: { prompt: 'Nouveau prompt concis...' },
 *   baselineConfig: { prompt: 'Ancien prompt...' },
 *   maxIterations: 10,
 *   createdBy: 'user-123',
 * });
 * ```
 */
export async function createExperiment(
  data: Omit<ImprovementExperiment, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'iterations'>,
): Promise<ImprovementExperiment> {
  const now = new Date();

  const experiment: ImprovementExperiment = {
    ...data,
    id: generateExperimentId(),
    status: 'draft',
    iterations: 0,
    results: {},
    createdAt: now,
    updatedAt: now,
  };

  await db.improvement_experiments.create({
    data: {
      id: experiment.id,
      name: experiment.name,
      description: experiment.description,
      type: experiment.type,
      targetAgentId: experiment.targetAgentId ?? null,
      targetMetric: experiment.targetMetric,
      baselineValue: experiment.baselineValue,
      experimentalValue: experiment.experimentalValue ?? null,
      improvementPercent: experiment.improvementPercent ?? null,
      status: experiment.status,
      config: experiment.config,
      baselineConfig: experiment.baselineConfig,
      results: experiment.results,
      iterations: experiment.iterations,
      maxIterations: experiment.maxIterations,
      createdBy: experiment.createdBy,
      approvedBy: experiment.approvedBy ?? null,
      promotedAt: experiment.promotedAt ?? null,
      createdAt: experiment.createdAt,
      updatedAt: experiment.updatedAt,
    },
  });

  return experiment;
}

/**
 * Convertit un enregistrement Firestore en objet Experience typé.
 * Gère la conversion des dates et des valeurs null.
 *
 * @param record - Enregistrement brut depuis Firestore.
 * @returns Objet ImprovementExperiment correctement typé.
 * @internal
 */
function toExperiment(record: Record<string, unknown>): ImprovementExperiment {
  return {
    ...record,
    createdAt: record.createdAt instanceof Date
      ? record.createdAt
      : new Date(record.createdAt as string),
    updatedAt: record.updatedAt instanceof Date
      ? record.updatedAt
      : new Date(record.updatedAt as string),
    promotedAt: record.promotedAt
      ? record.promotedAt instanceof Date
        ? record.promotedAt
        : new Date(record.promotedAt as string)
      : undefined,
  } as ImprovementExperiment;
}

/**
 * Exécute une expérience d'amélioration.
 *
 * Le processus :
 * 1. Passe le statut à 'testing'.
 * 2. Exécute N itérations (défaut 5) de la tâche cible avec les deux configurations.
 * 3. Compare les résultats selon la métrique cible.
 * 4. Calcule le pourcentage d'amélioration.
 * 5. Détermine le statut final :
 *    - > 10% d'amélioration → 'approved'
 *    - > 0% d'amélioration → 'benchmarking' (plus de tests nécessaires)
 *    - ≤ 0% d'amélioration → 'rejected'
 *
 * @param experimentId - Identifiant de l'expérience à exécuter.
 * @returns L'expérience mise à jour avec les résultats.
 * @throws {Error} Si l'expérience n'existe pas ou n'est pas en statut 'draft'.
 */
export async function runExperiment(
  experimentId: string,
): Promise<ImprovementExperiment> {
  // Récupérer l'expérience
  const record = await db.improvement_experiments.findUnique({
    where: { id: experimentId },
  });

  if (!record) {
    throw new Error(`Expérience introuvable : ${experimentId}`);
  }

  const experiment = toExperiment(record);

  // Vérifier le statut
  if (experiment.status !== 'draft' && experiment.status !== 'benchmarking') {
    throw new Error(
      `L'expérience ${experimentId} est en statut '${experiment.status}'. Seuls les statuts 'draft' et 'benchmarking' permettent l'exécution.`,
    );
  }

  // Passer en statut testing
  await db.improvement_experiments.update({
    where: { id: experimentId },
    data: { status: 'testing', updatedAt: new Date() },
  });

  // Préparer les cas de test
  // En l'absence de cas de test explicites, on génère des itérations génériques
  const maxIterations = experiment.maxIterations || 5;
  const testCases = (experiment.results.testCases as Array<{
    input: Record<string, unknown>;
    expectedOutput?: Record<string, unknown>;
  }>) || [];

  // Si pas de cas de test, on crée des itérations génériques
  const iterations = testCases.length > 0
    ? testCases
    : Array.from({ length: maxIterations }, (_, i) => ({
        input: { iteration: i + 1, query: `test_query_${i + 1}` },
      }));

  const effectiveIterations = Math.min(iterations.length, maxIterations);
  const iterationResults: Array<{
    iteration: number;
    baselineScore: number;
    experimentalScore: number;
  }> = [];

  let totalBaselineScore = 0;
  let totalExperimentalScore = 0;

  // Exécuter les itérations
  for (let i = 0; i < effectiveIterations; i++) {
    const testCase = iterations[i];

    try {
      // Benchmark de la configuration de référence
      const baselineResult = await benchmark(
        experiment.baselineConfig,
        [testCase],
        experiment.targetMetric,
      );

      // Benchmark de la configuration expérimentale
      const experimentalResult = await benchmark(
        experiment.config,
        [testCase],
        experiment.targetMetric,
      );

      const baselineScore = baselineResult.score;
      const experimentalScore = experimentalResult.score;

      iterationResults.push({
        iteration: i + 1,
        baselineScore,
        experimentalScore,
      });

      totalBaselineScore += baselineScore;
      totalExperimentalScore += experimentalScore;
    } catch (err) {
      // Journaliser l'erreur mais continuer les autres itérations
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          event: 'experiment_iteration_failed',
          experimentId,
          iteration: i + 1,
          error: err instanceof Error ? err.message : String(err),
        }),
      );

      iterationResults.push({
        iteration: i + 1,
        baselineScore: 0,
        experimentalScore: 0,
      });
    }
  }

  // Calculer les moyennes
  const completedIterations = iterationResults.filter(
    (r) => r.baselineScore > 0 || r.experimentalScore > 0,
  );

  const avgBaseline =
    completedIterations.length > 0
      ? totalBaselineScore / completedIterations.length
      : experiment.baselineValue;

  const avgExperimental =
    completedIterations.length > 0
      ? totalExperimentalScore / completedIterations.length
      : 0;

  // Calculer le pourcentage d'amélioration
  const improvementPercent =
    avgBaseline > 0
      ? ((avgExperimental - avgBaseline) / avgBaseline) * 100
      : 0;

  // Déterminer le statut final
  let finalStatus: ExperimentStatus;
  if (improvementPercent > 10) {
    finalStatus = 'approved';
  } else if (improvementPercent > 0) {
    finalStatus = 'benchmarking';
  } else {
    finalStatus = 'rejected';
  }

  const results: Record<string, unknown> = {
    ...experiment.results,
    iterationResults,
    totalIterations: effectiveIterations,
    completedIterations: completedIterations.length,
    avgBaseline: Math.round(avgBaseline * 1000) / 1000,
    avgExperimental: Math.round(avgExperimental * 1000) / 1000,
    improvementPercent: Math.round(improvementPercent * 100) / 100,
    executedAt: new Date().toISOString(),
  };

  // Mettre à jour l'expérience
  const updateData: Record<string, unknown> = {
    status: finalStatus,
    experimentalValue: Math.round(avgExperimental * 1000) / 1000,
    improvementPercent: Math.round(improvementPercent * 100) / 100,
    iterations: experiment.iterations + effectiveIterations,
    results,
    updatedAt: new Date(),
  };

  await db.improvement_experiments.update({
    where: { id: experimentId },
    data: updateData,
  });

  // Récupérer l'expérience mise à jour
  const updated = await db.improvement_experiments.findUnique({
    where: { id: experimentId },
  });

  return toExperiment(updated);
}

/**
 * Promeut une expérience approuvée en production.
 * Met à jour la configuration de l'agent cible avec la configuration expérimentale.
 *
 * @param experimentId - Identifiant de l'expérience à promouvoir.
 * @param approvedBy - Identifiant de l'utilisateur approuvant la promotion.
 * @returns L'expérience mise à jour avec le statut 'promoted'.
 * @throws {Error} Si l'expérience n'est pas en statut 'approved'.
 */
export async function promoteExperiment(
  experimentId: string,
  approvedBy: string,
): Promise<ImprovementExperiment> {
  const record = await db.improvement_experiments.findUnique({
    where: { id: experimentId },
  });

  if (!record) {
    throw new Error(`Expérience introuvable : ${experimentId}`);
  }

  const experiment = toExperiment(record);

  if (experiment.status !== 'approved') {
    throw new Error(
      `L'expérience ${experimentId} est en statut '${experiment.status}'. Seul le statut 'approved' permet la promotion.`,
    );
  }

  const now = new Date();

  // Si un agent cible est défini, mettre à jour sa configuration
  if (experiment.targetAgentId) {
    try {
      await db.agents.update({
        where: { id: experiment.targetAgentId },
        data: {
          config: experiment.config,
          updatedAt: now,
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          event: 'experiment_promote_agent_update_failed',
          experimentId,
          agentId: experiment.targetAgentId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      throw new Error(
        `Impossible de mettre à jour la configuration de l'agent ${experiment.targetAgentId}.`,
      );
    }
  }

  // Mettre à jour l'expérience
  await db.improvement_experiments.update({
    where: { id: experimentId },
    data: {
      status: 'promoted',
      approvedBy,
      promotedAt: now,
      updatedAt: now,
    },
  });

  const updated = await db.improvement_experiments.findUnique({
    where: { id: experimentId },
  });

  return toExperiment(updated);
}

/**
 * Annule une expérience promue et revient à la configuration de référence.
 *
 * @param experimentId - Identifiant de l'expérience à annuler.
 * @throws {Error} Si l'expérience n'est pas en statut 'promoted'.
 */
export async function rollbackExperiment(
  experimentId: string,
): Promise<void> {
  const record = await db.improvement_experiments.findUnique({
    where: { id: experimentId },
  });

  if (!record) {
    throw new Error(`Expérience introuvable : ${experimentId}`);
  }

  const experiment = toExperiment(record);

  if (experiment.status !== 'promoted') {
    throw new Error(
      `L'expérience ${experimentId} est en statut '${experiment.status}'. Seul le statut 'promoted' permet le retour arrière.`,
    );
  }

  const now = new Date();

  // Si un agent cible est défini, restaurer la configuration de référence
  if (experiment.targetAgentId) {
    try {
      await db.agents.update({
        where: { id: experiment.targetAgentId },
        data: {
          config: experiment.baselineConfig,
          updatedAt: now,
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          event: 'experiment_rollback_agent_update_failed',
          experimentId,
          agentId: experiment.targetAgentId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      throw new Error(
        `Impossible de restaurer la configuration de l'agent ${experiment.targetAgentId}.`,
      );
    }
  }

  // Mettre à jour l'expérience
  await db.improvement_experiments.update({
    where: { id: experimentId },
    data: {
      status: 'rolled_back',
      updatedAt: now,
    },
  });
}

/**
 * Liste les expériences avec filtrage optionnel.
 *
 * @param filters - Filtres optionnels (status, targetAgentId).
 * @returns Tableau d'expériences triées par date de création décroissante.
 */
export async function listExperiments(
  filters?: { status?: ExperimentStatus; targetAgentId?: string },
): Promise<ImprovementExperiment[]> {
  const where: Record<string, unknown> = {};
  if (filters?.status !== undefined) {
    where.status = filters.status;
  }
  if (filters?.targetAgentId !== undefined) {
    where.targetAgentId = filters.targetAgentId;
  }

  try {
    const records = await db.improvement_experiments.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return records.map(toExperiment);
  } catch {
    return [];
  }
}

/**
 * Récupère une expérience par son identifiant.
 *
 * @param id - Identifiant de l'expérience.
 * @returns L'expérience, ou null si introuvable.
 */
export async function getExperiment(
  id: string,
): Promise<ImprovementExperiment | null> {
  try {
    const record = await db.improvement_experiments.findUnique({
      where: { id },
    });

    if (!record) return null;

    return toExperiment(record);
  } catch {
    return null;
  }
}
