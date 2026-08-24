// ============================================================
// Gen3ia — Planificateur d'orchestration
// ============================================================
//  Module responsable de la décomposition d'un objectif
//  utilisateur en étapes séquentielles exécutables par des agents.
//  Utilise le routeur de modèles (LLM) pour générer un plan
//  structuré en JSON.
//
//  Collection Firestore : aucune (le plan est embarqué dans
//  le document de tâche `orchestration_tasks`).
// ============================================================

import { randomUUID } from 'crypto';

import type { OrchestrationStep } from './types';

// ----------------------------------------------------------------
// Prompt système pour la planification (en français)
// ----------------------------------------------------------------

/**
 * Prompt système détaillé qui instruit le LLM de décomposer
 * un objectif utilisateur en étapes numérotées et structurées.
 * Le modèle doit répondre UNIQUEMENT en JSON valide.
 */
export const PLANNING_SYSTEM_PROMPT = `
Tu es un planificateur d'orchestration pour une plateforme multi-agents IA.
Ton rôle est d'analyser un objectif fourni par l'utilisateur et de le décomposer
en étapes séquentielles claires et réalisables.

RÈGLES :
1. Chaque étape doit être une action concrète, vérifiable et autonome.
2. Les étapes doivent être ordonnées logiquement (dépendances implicites respectées).
3. Évite les étapes trop génériques (ex: « analyser les données » sans préciser quoi).
4. Limite le nombre d'étapes à ce qui est nécessaire (entre 1 et 10 étapes).
5. Chaque étape doit pouvoir être exécutée par un agent IA avec des outils.

FORMAT DE RÉPONSE :
Tu DOIS répondre UNIQUEMENT avec un tableau JSON valide, sans texte avant ou après.
Chaque élément du tableau est un objet avec les champs suivants :

[
  {
    "description": "Description claire et détaillée de l'étape",
    "dependsOn": []  // indices des étapes précédentes dont dépend cette étape (tableau vide si aucune)
  }
]

EXEMPLE pour l'objectif « Créer un tableau de ventes mensuelles et l'envoyer par email » :
[
  {
    "description": "Collecter les données de ventes brutes depuis la base de données pour les 12 derniers mois",
    "dependsOn": []
  },
  {
    "description": "Agréger les ventes par mois et calculer les totaux et sous-totaux",
    "dependsOn": [0]
  },
  {
    "description": "Générer le tableau formaté avec les colonnes Mois, Ventes, Variation %",
    "dependsOn": [1]
  },
  {
    "description": "Rédiger un résumé des tendances observées et envoyer le tableau par email",
    "dependsOn": [2]
  }
]

REPONDS UNIQUEMENT EN JSON. PAS DE MARKDOWN. PAS DE TEXTE AUTOUR DU JSON.
`.trim();

// ----------------------------------------------------------------
// Interface interne pour la sortie brute du LLM
// ----------------------------------------------------------------

/** Structure attendue dans la réponse JSON du modèle. */
interface RawPlanStep {
  /** Description de l'étape générée par le modèle. */
  description: string;
  /** Indices des étapes dont dépend cette étape. */
  dependsOn?: number[];
}

// ----------------------------------------------------------------
// Fonctions utilitaires
// ----------------------------------------------------------------

/**
 * Extrait un tableau JSON depuis une chaîne de caractères.
 * Tente plusieurs stratégies d'extraction pour tolérer les
 * réponses qui incluent du markdown ou du texte parasite.
 *
 * @param raw - Chaîne brute renvoyée par le modèle.
 * @returns Tableau d'objets parsé, ou `null` en cas d'échec.
 */
function extractJsonArray(raw: string): RawPlanStep[] | null {
  // Stratégie 1 :解析直接 JSON
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as RawPlanStep[];
  } catch {
    // Passe à la stratégie suivante
  }

  // Stratégie 2 : extraire depuis un bloc ```json ... ```
  const jsonBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch?.[1]) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]!.trim());
      if (Array.isArray(parsed)) return parsed as RawPlanStep[];
    } catch {
      // Passe à la stratégie suivante
    }
  }

  // Stratégie 3 : trouver le premier '[' et le dernier ']'
  const firstBracket = raw.indexOf('[');
  const lastBracket = raw.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      const extracted = raw.slice(firstBracket, lastBracket + 1);
      const parsed = JSON.parse(extracted);
      if (Array.isArray(parsed)) return parsed as RawPlanStep[];
    } catch {
      // Échec final
    }
  }

  return null;
}

/**
 * Valide et nettoie une étape brute du modèle.
 * Garantit que la description est non vide et que les dépendances
 * sont des indices valides.
 *
 * @param step       - Étape brute à valider.
 * @param index      - Index de l'étape dans le plan.
 * @param maxIndex   - Index maximum valide pour les dépendances.
 * @returns Étape validée ou `null` si invalide.
 */
function validateStep(
  step: RawPlanStep,
  index: number,
  maxIndex: number,
): RawPlanStep | null {
  if (!step || typeof step.description !== 'string' || step.description.trim().length === 0) {
    return null;
  }

  const dependsOn = Array.isArray(step.dependsOn)
    ? step.dependsOn.filter((d) => typeof d === 'number' && d >= 0 && d < maxIndex && d !== index)
    : [];

  return { description: step.description.trim(), dependsOn };
}

// ----------------------------------------------------------------
// Fonction principale
// ----------------------------------------------------------------

/**
 * Crée un plan d'orchestration en décomposant un objectif
 * en étapes exécutables via le routeur de modèles LLM.
 *
 * Le modèle analyse l'objectif et produit un tableau JSON
 * d'étapes. Chaque étape reçoit un identifiant unique, un
 * statut initial `'pending'` et les paramètres par défaut.
 *
 * Si le routeur de modèles est indisponible ou renvoie une
 * réponse invalide, un plan à étape unique est généré en
 * repli (fallback).
 *
 * @param objective - Description textuelle de l'objectif à atteindre.
 * @param context   - Contexte additionnel optionnel (données utilisateur, contraintes).
 * @returns Tableau d'étapes d'orchestration prêtes à l'exécution.
 */
export async function createPlan(
  objective: string,
  context?: Record<string, unknown>,
): Promise<OrchestrationStep[]> {
  // Construction du message utilisateur avec contexte éventuel
  let userMessage = `Objectif : ${objective}`;
  if (context && Object.keys(context).length > 0) {
    userMessage += `\n\nContexte additionnel :\n${JSON.stringify(context, null, 2)}`;
  }

  try {
    // Import dynamique pour éviter les dépendances circulaires
    const { routeAndExecute } = await import('@/lib/model-router');

    const response = await routeAndExecute({
      model: '', // Laisser le routeur sélectionner le meilleur modèle
      messages: [
        { role: 'system', content: PLANNING_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3, // Température basse pour des résultats déterministes
      maxTokens: 2000,
      responseFormat: { type: 'json_object' },
    });

    // Extraction du JSON depuis la réponse
    const rawSteps = extractJsonArray(response.content);

    if (rawSteps && rawSteps.length > 0) {
      // Le modèle peut renvoyer un objet avec une clé, essayons les deux
      const stepsArray = Array.isArray(rawSteps)
        ? rawSteps
        : (rawSteps as unknown as Record<string, unknown>).steps;

      const steps: OrchestrationStep[] = [];
      const taskId = 'plan-preview'; // Sera remplacé par le vrai taskId lors de la création

      for (let i = 0; i < (Array.isArray(stepsArray) ? stepsArray.length : 0); i++) {
        const validated = validateStep(
          (stepsArray as RawPlanStep[])[i]!,
          i,
          (stepsArray as RawPlanStep[]).length,
        );

        if (validated) {
          // Résoudre les dépendances par index en identifiants d'étape
          const dependsOnIds = validated.dependsOn?.map((depIdx) => steps[depIdx]!.id) ?? [];

          steps.push({
            id: randomUUID(),
            taskId,
            index: i,
            description: validated.description,
            agentId: undefined, // Sera assigné par l'orchestrateur
            model: undefined,
            tools: [],
            input: {},
            output: undefined,
            status: 'pending',
            error: undefined,
            tokensUsed: 0,
            costUsd: 0,
            durationMs: 0,
            retryCount: 0,
            maxRetries: 3,
            dependsOn: dependsOnIds.length > 0 ? dependsOnIds : undefined,
          });
        }
      }

      // Vérifier qu'au moins une étape a été générée
      if (steps.length > 0) {
        return steps;
      }
    }
  } catch (error) {
    // Le routeur est indisponible ou la réponse est invalide
    // On tombe dans le repli ci-dessous
    console.warn(
      `[orchestration/planner] Le routeur de modèles est indisponible ou a échoué. ` +
      `Utilisation du plan de repli. Erreur : ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Repli : plan à étape unique
  return [createSingleStepPlan(objective)];
}

/**
 * Crée un plan de repli à étape unique.
 * Utilisé lorsque le routeur de modèles est indisponible.
 *
 * @param objective - Description de l'objectif.
 * @returns Tableau contenant une seule étape.
 */
function createSingleStepPlan(objective: string): OrchestrationStep[] {
  return [
    {
      id: randomUUID(),
      taskId: 'plan-preview',
      index: 0,
      description: objective,
      agentId: undefined,
      model: undefined,
      tools: [],
      input: {},
      output: undefined,
      status: 'pending',
      error: undefined,
      tokensUsed: 0,
      costUsd: 0,
      durationMs: 0,
      retryCount: 0,
      maxRetries: 3,
      dependsOn: undefined,
    },
  ];
}
