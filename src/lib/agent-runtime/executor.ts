// ============================================================
// Gen3ia — Moteur d'exécution d'agents
// ============================================================
//  Exécuteur principal qui orchestre le cycle de vie complet :
//    1. Création de l'enregistrement d'exécution
//    2. Chargement de la mémoire de l'agent
//    3. Préparation du prompt
//    4. Appel au modèle LLM (router ou OpenAI direct)
//    5. Exécution des outils si nécessaire
//    6. Mise à jour de l'enregistrement d'exécution
//    7. Retour du résultat
// ============================================================

import { db } from '@/lib/db';

import type {
  AgentExecutionContext,
  AgentExecutionResult,
  AgentMemory,
  ExecutionState,
} from './types';

// ---------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------

/** URL de base de l'API OpenAI. */
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/** Nombre de tokens par dollar (estimation grossière pour GPT-4). */
const TOKENS_PER_USD = 125_000;

/** Nombre maximum de tours d'outils (anti-boucle infinie). */
const MAX_TOOL_ROUNDS = 10;

// ---------------------------------------------------------------
// Appel OpenAI direct (fallback si pas de model-router)
// ---------------------------------------------------------------

/**
 * Réponse brute de l'API OpenAI.
 */
interface OpenAIResponse {
  id?: string;
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Appelle l'API OpenAI directement via `fetch`.
 * Utilisé comme fallback si le routeur de modèles n'est pas disponible.
 *
 * @param model       - Identifiant du modèle (ex: 'gpt-4o').
 * @param messages    - Messages de la conversation au format OpenAI.
 * @param temperature - Température de sampling.
 * @param maxTokens   - Nombre maximum de tokens en sortie.
 * @returns La réponse brute de l'API OpenAI.
 */
async function callOpenAI(
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens?: number,
): Promise<OpenAIResponse> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    // Environnement sans clé API — retourne une réponse vide.
    // eslint-disable-next-line no-console
    console.warn(
      '[agent-runtime] OPENAI_API_KEY non configuré — réponse vide retournée.',
    );
    return {
      choices: [
        {
          message: {
            role: 'assistant',
            content:
              "(Aucune réponse générée : clé API OpenAI non configurée.)",
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
  };

  if (maxTokens && maxTokens > 0) {
    body.max_tokens = maxTokens;
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `callOpenAI — erreur ${response.status} : ${errorText}`,
    );
  }

  return response.json() as Promise<OpenAIResponse>;
}

/**
 * Tente de charger et d'utiliser le routeur de modèles externe.
 * Si le module `@/lib/model-router` n'existe pas, retourne `null`.
 */
async function tryModelRouter(
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens?: number,
): Promise<OpenAIResponse | null> {
  try {
    // Importation dynamique pour éviter les erreurs si le module n'existe pas.
    const router = await import('@/lib/model-router');
    if (typeof router?.route !== 'function') return null;

    const result = await router.route({
      model,
      messages,
      temperature,
      maxTokens,
    });

    // Adapter le format de sortie du routeur vers OpenAIResponse.
    return result as unknown as OpenAIResponse;
  } catch {
    // Module introuvable — fallback vers OpenAI direct.
    return null;
  }
}

/**
 * Tente de charger et d'utiliser la passerelle d'outils externe.
 * Si le module `@/lib/tool-gateway` n'existe pas, retourne `null`.
 */
async function tryToolGateway(
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  try {
    const gateway = await import('@/lib/tool-gateway');
    if (typeof gateway?.execute !== 'function') return null;
    return gateway.execute(toolName, toolInput);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------
// Chargement de la mémoire
// ---------------------------------------------------------------

/**
 * Charge la mémoire de travail d'un agent.
 * Tente de lire depuis `db.agentMemory`, sinon retourne une mémoire vide.
 *
 * @param agentId - Identifiant de l'agent.
 * @param userId  - Identifiant de l'utilisateur.
 * @returns La mémoire chargée ou une mémoire vide par défaut.
 */
async function loadAgentMemory(
  agentId: string,
  userId: string,
): Promise<AgentMemory> {
  try {
    const mem = await db.agentMemory.findFirst({
      where: [
        { field: 'agentId', op: '==', value: agentId },
        { field: 'userId', op: '==', value: userId },
      ],
    });

    if (mem) {
      const raw = mem as Record<string, unknown>;
      return {
        workingMemory: (raw.workingMemory as Record<string, unknown>) ?? {},
        conversationHistory:
          (raw.conversationHistory as AgentMemory['conversationHistory']) ?? [],
        context: (raw.context as Record<string, unknown>) ?? {},
      };
    }
  } catch {
    // En cas d'erreur de lecture, on continue avec une mémoire vide.
  }

  return {
    workingMemory: {},
    conversationHistory: [],
    context: {},
  };
}

// ---------------------------------------------------------------
// Sauvegarde de la mémoire
// ---------------------------------------------------------------

/**
 * Sauvegarde la mémoire de travail d'un agent après exécution.
 *
 * @param agentId - Identifiant de l'agent.
 * @param userId  - Identifiant de l'utilisateur.
 * @param memory  - État de la mémoire à sauvegarder.
 */
async function saveAgentMemory(
  agentId: string,
  userId: string,
  memory: AgentMemory,
): Promise<void> {
  try {
    // Vérifier s'il existe déjà un enregistrement de mémoire.
    const existing = await db.agentMemory.findFirst({
      where: [
        { field: 'agentId', op: '==', value: agentId },
        { field: 'userId', op: '==', value: userId },
      ],
    });

    const memoryData = {
      agentId,
      userId,
      workingMemory: memory.workingMemory,
      conversationHistory: memory.conversationHistory,
      context: memory.context,
    };

    if (existing) {
      const existingId = (existing as Record<string, unknown>).id as string;
      await db.agentMemory.update({
        where: { id: existingId },
        data: memoryData,
      });
    } else {
      await db.agentMemory.create({ data: memoryData });
    }
  } catch (err) {
    // La sauvegarde de mémoire ne doit pas faire échouer l'exécution.
    // eslint-disable-next-line no-console
    console.warn('[agent-runtime] erreur de sauvegarde mémoire :', err);
  }
}

// ---------------------------------------------------------------
// Exécution d'un outil
// ---------------------------------------------------------------

/**
 * Exécute un outil demandé par le modèle LLM.
 * Tente d'abord la passerelle d'outils externe, puis l'exécution
 * locale basique.
 *
 * @param toolName - Nom de l'outil.
 * @param args     - Arguments JSON de l'outil.
 * @returns Le résultat de l'exécution de l'outil.
 */
async function executeTool(
  toolName: string,
  args: string,
): Promise<string> {
  // Essayer la passerelle externe en premier.
  const gatewayResult = await tryToolGateway(
    toolName,
    JSON.parse(args),
  );
  if (gatewayResult) {
    return JSON.stringify(gatewayResult);
  }

  // Fallback : retourner un message indiquant que l'outil n'est pas disponible.
  return JSON.stringify({
    error: `Outil "${toolName}" non disponible via la passerelle d'outils.`,
    requestedTool: toolName,
    status: 'unavailable',
  });
}

// ---------------------------------------------------------------
// Exécution principale
// ---------------------------------------------------------------

/**
 * Exécute un agent à partir de son contexte d'exécution.
 *
 * Cette fonction orchestre le cycle de vie complet :
 *  1. Création de l'enregistrement d'exécution (état 'running').
 *  2. Chargement de la mémoire de l'agent.
 *  3. Préparation du prompt (instructions + entrée + historique).
 *  4. Appel au modèle LLM (routeur si disponible, sinon OpenAI direct).
 *  5. Boucle d'appels d'outils si le modèle en demande.
 *  6. Mise à jour de l'enregistrement (état 'completed' ou 'failed').
 *  7. Sauvegarde de la mémoire mise à jour.
 *  8. Retour du résultat structuré.
 *
 * @param context - Contexte d'exécution complet de l'agent.
 * @returns Le résultat complet de l'exécution.
 */
export async function executeAgent(
  context: AgentExecutionContext,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  let executionId = '';

  // --- 1. Création de l'enregistrement d'exécution ---
  try {
    const created = await db.execution.create({
      data: {
        agentId: context.agentId,
        userId: context.userId,
        orgId: context.orgId ?? null,
        taskId: context.taskId ?? null,
        model: context.model,
        state: 'running',
        input: context.input,
        tools: context.tools,
        budget: context.budget,
        correlationId: context.correlationId,
        metadata: context.metadata,
        tokensUsed: { prompt: 0, completion: 0 },
        costUsd: 0,
        durationMs: 0,
        artifacts: [],
      },
    });
    executionId = (created as Record<string, unknown>).id as string;
  } catch (err) {
    return {
      executionId: 'error',
      agentId: context.agentId,
      output: {},
      state: 'failed',
      tokensUsed: { prompt: 0, completion: 0 },
      costUsd: 0,
      durationMs: Date.now() - startTime,
      artifacts: [],
      error: `Impossible de créer l'enregistrement d'exécution : ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // --- 2. Chargement de la mémoire ---
  const memory = await loadAgentMemory(context.agentId, context.userId);

  // --- 3. Préparation du prompt ---
  const systemPrompt = context.agent.instructions;

  // Construction du message utilisateur à partir de l'entrée.
  const userMessage =
    typeof context.input.message === 'string'
      ? (context.input.message as string)
      : JSON.stringify(context.input);

  // Assemblage des messages : système + historique + utilisateur.
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // Ajout des entrées de l'historique de conversation (limité aux 20 dernières).
  const historySlice = memory.conversationHistory.slice(-20);
  for (const entry of historySlice) {
    messages.push({ role: entry.role, content: entry.content });
  }

  // Ajout du contexte de travail en tant que message système supplémentaire.
  if (Object.keys(memory.context).length > 0) {
    messages.push({
      role: 'system',
      content: `Contexte additionnel :\n${JSON.stringify(memory.context, null, 2)}`,
    });
  }

  messages.push({ role: 'user', content: userMessage });

  // --- Variables de suivi ---
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let finalOutput: string = '';
  let toolCallsRemaining = MAX_TOOL_ROUNDS;
  const artifacts: Array<{ type: string; content: string; name?: string }> = [];
  let currentState: ExecutionState = 'completed';
  let errorMessage: string | undefined;

  // --- 4–5. Appel modèle + boucle d'outils avec timeout ---
  const timeoutMs = context.budget.maxDurationMs;
  const temperature = context.agent.temperature ?? 0.7;
  const maxTokens =
    context.agent.limits.maxTokensPerTask ?? context.budget.maxTokens;

  try {
    // Exécution avec timeout via AbortController.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let currentMessages = [...messages];

      while (toolCallsRemaining > 0) {
        // Tentative avec le routeur de modèles, fallback sur OpenAI direct.
        let llmResponse = await tryModelRouter(
          context.model,
          currentMessages,
          temperature,
          maxTokens,
        );

        if (!llmResponse) {
          llmResponse = await callOpenAI(
            context.model,
            currentMessages,
            temperature,
            maxTokens,
          );
        }

        // Extraction des tokens utilisés.
        totalPromptTokens += llmResponse.usage?.prompt_tokens ?? 0;
        totalCompletionTokens += llmResponse.usage?.completion_tokens ?? 0;

        // Extraction du contenu de la réponse.
        const choice = llmResponse.choices?.[0];
        if (!choice?.message) {
          finalOutput =
            '(Aucune réponse générée par le modèle.)';
          break;
        }

        const assistantContent = choice.message.content ?? '';
        const toolCalls = choice.message.tool_calls;

        // Si pas d'appels d'outils, on termine.
        if (!toolCalls || toolCalls.length === 0) {
          finalOutput = assistantContent;
          break;
        }

        // Ajouter la réponse de l'assistant aux messages.
        currentMessages.push({
          role: 'assistant',
          content: assistantContent || null as unknown as string,
        });

        // Exécuter chaque appel d'outil.
        for (const tc of toolCalls) {
          const toolName = tc?.function?.name ?? 'unknown';
          const toolArgs = tc?.function?.arguments ?? '{}';
          const toolCallId = tc?.id ?? `call_${Date.now()}`;

          const toolResult = await executeTool(toolName, toolArgs);

          // Enregistrer l'appel d'outil dans les artéfacts.
          artifacts.push({
            type: 'tool_call',
            content: JSON.stringify({
              tool: toolName,
              args: JSON.parse(toolArgs),
              result: JSON.parse(toolResult),
            }),
            name: toolName,
          });

          currentMessages.push({
            role: 'tool',
            content: toolResult,
          });
        }

        toolCallsRemaining--;
      }

      // Si on a épuisé les tours d'outils.
      if (toolCallsRemaining <= 0 && !finalOutput) {
        finalOutput =
          '(Limite d\'appels d\'outils atteinte. Dernière réponse incomplète.)';
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      currentState = 'timeout';
      errorMessage = `L'exécution a expiré après ${timeoutMs}ms`;
    } else {
      currentState = 'failed';
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    // eslint-disable-next-line no-console
    console.error(
      `[agent-runtime] exécution ${executionId} en erreur (${currentState}) :`,
      errorMessage,
    );
  }

  // --- Calcul du coût ---
  const totalTokens = totalPromptTokens + totalCompletionTokens;
  const costUsd = totalTokens > 0 ? totalTokens / TOKENS_PER_USD : 0;

  // --- Extraction artéfacts de texte ---
  if (finalOutput) {
    artifacts.push({
      type: 'text',
      content: finalOutput,
      name: 'response',
    });
  }

  // --- Construction du résultat ---
  const durationMs = Date.now() - startTime;
  const result: AgentExecutionResult = {
    executionId,
    agentId: context.agentId,
    output: {
      text: finalOutput,
      ...context.input,
    },
    state: currentState,
    tokensUsed: {
      prompt: totalPromptTokens,
      completion: totalCompletionTokens,
    },
    costUsd,
    durationMs,
    artifacts,
    error: errorMessage,
  };

  // --- 6. Mise à jour de l'enregistrement d'exécution ---
  try {
    await db.execution.update({
      where: { id: executionId },
      data: {
        state: currentState,
        output: result.output,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
        artifacts: result.artifacts,
        error: errorMessage ?? null,
      },
    });
  } catch (err) {
    // La mise à jour de l'enregistrement ne doit pas faire échouer le retour.
    // eslint-disable-next-line no-console
    console.warn(
      '[agent-runtime] erreur de mise à jour de l\'exécution :',
      err,
    );
  }

  // --- 7. Mise à jour de la mémoire ---
  if (currentState === 'completed' && finalOutput) {
    memory.conversationHistory.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    });
    memory.conversationHistory.push({
      role: 'assistant',
      content: finalOutput,
      timestamp: new Date(),
    });

    // Limiter l'historique à 50 entrées pour éviter la croissance infinie.
    if (memory.conversationHistory.length > 50) {
      memory.conversationHistory = memory.conversationHistory.slice(-50);
    }

    await saveAgentMemory(context.agentId, context.userId, memory);
  }

  return result;
}
