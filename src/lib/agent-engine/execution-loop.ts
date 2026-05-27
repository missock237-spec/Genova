// Agent Execution Loop — True Autonomous ReAct Loop
// Agent follows: Think → Act → Observe → Reflect → Retry (if needed)
// With recursive reflection, self-correction, adaptive planning, and persistent state
//
// Integration with StateGraph:
// This execution loop is the original agent execution mode.
// The LangGraph-style StateGraph (state-graph.ts) provides an alternative execution mode
// with explicit state transitions, conditional edges, and cycle detection.
// Both modes share the same ExecutionContext, ExecutionStep types, and ExecutionPlan.
// Use executeAgentLoop() for the classic loop, or executeWithStateGraph() for the graph-based mode.

import { chatCompletion } from '@/lib/ai-router';
import { ToolRegistry } from '@/lib/tools/registry';
import { ShortTermMemory } from '@/lib/memory/short-term';
import { LongTermMemory } from '@/lib/memory/long-term';
import { db } from '@/lib/db';
import { Tracer } from '@/lib/observability/tracer';

export interface ExecutionStep {
  id: string;
  type: 'thought' | 'action' | 'observation' | 'reflection' | 'plan' | 'error' | 'result' | 'retry' | 'correction';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  timestamp: string;
  duration?: number;
  confidence?: number;       // Agent's confidence in this step (0-1)
  reflectionScore?: number;  // Quality score from reflection (0-1)
  needsRetry?: boolean;      // Whether this step needs a retry
  retryCount?: number;       // How many times we've retried this
  alternativeApproach?: string; // Suggested alternative if retry needed
}

export interface ExecutionPlan {
  steps: PlanStep[];
  currentStepIndex: number;
  adaptiveHistory: PlanAdaptation[];
}

export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: string;
  dependsOn?: string[];
  toolHint?: string;
}

export interface PlanAdaptation {
  stepIndex: number;
  reason: string;
  originalPlan: string;
  adaptedPlan: string;
  timestamp: string;
}

export interface ExecutionContext {
  agentId: string;
  agentName: string;
  agentType: string;
  agentConfig: Record<string, unknown>;
  task: string;
  conversationId?: string;
  userId: string;
  maxSteps: number;
  maxRetries: number;
  steps: ExecutionStep[];
  status: 'running' | 'completed' | 'failed' | 'paused' | 'awaiting_approval' | 'reflecting' | 'retrying';
  memory: {
    shortTerm: Array<{ role: string; content: string }>;
    longTermContext: string;
  };
  tools: string[];
  guardrailsActive: boolean;
  plan?: ExecutionPlan;
  // Persistent execution state for resume capability
  executionId?: string;
  startedAt: string;
  lastUpdatedAt: string;
  totalTokensUsed: number;
  totalCost: number;
}

let stepCounter = 0;

function generateStepId(): string {
  return `step_${Date.now()}_${++stepCounter}`;
}

// ============================================================
// STEP 1: THINK — Agent reasons about the current state
// ============================================================

async function thinkStep(
  context: ExecutionContext,
  toolRegistry: ToolRegistry
): Promise<ExecutionStep> {
  const startTime = Date.now();

  try {
    const systemPrompt = buildThinkPrompt(context, toolRegistry);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...context.memory.shortTerm.slice(-8),
      { role: 'user' as const, content: 'Analyse la situation actuelle. Quelle est ta prochaine action ? Réponds en JSON.' },
    ];

    const result = await chatCompletion(messages, 'reasoning');
    const duration = Date.now() - startTime;

    let parsed: {
      thought: string;
      action: string;
      actionInput: Record<string, unknown>;
      isFinal: boolean;
      confidence: number;
    };

    try {
      let content = result.content.trim();
      content = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(content);
    } catch {
      parsed = {
        thought: result.content,
        action: 'respond',
        actionInput: { message: result.content },
        isFinal: true,
        confidence: 0.5,
      };
    }

    const step: ExecutionStep = {
      id: generateStepId(),
      type: 'thought',
      content: parsed.thought || 'Analyse en cours...',
      timestamp: new Date().toISOString(),
      duration,
      confidence: parsed.confidence || 0.5,
    };

    context.steps.push(step);
    context.memory.shortTerm.push({ role: 'assistant', content: parsed.thought });

    // Update token tracking
    context.totalTokensUsed += Math.ceil(result.content.length / 4);
    context.lastUpdatedAt = new Date().toISOString();

    // If final response, return it
    if (parsed.isFinal || parsed.action === 'respond') {
      const resultStep: ExecutionStep = {
        id: generateStepId(),
        type: 'result',
        content: (parsed.actionInput?.message as string) || parsed.thought || 'Tâche terminée',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        confidence: parsed.confidence,
      };
      context.steps.push(resultStep);
      context.status = 'completed';
      return resultStep;
    }

    // If an action is specified, proceed to act
    if (parsed.action && parsed.action !== 'respond') {
      const actResult = await actStep(parsed.action, parsed.actionInput || {}, context, toolRegistry);
      return actResult;
    }

    return step;
  } catch (error) {
    const errorStep: ExecutionStep = {
      id: generateStepId(),
      type: 'error',
      content: `Erreur de raisonnement: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      confidence: 0,
    };
    context.steps.push(errorStep);
    return errorStep;
  }
}

// ============================================================
// STEP 2: ACT — Execute a tool action
// ============================================================

async function actStep(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: ExecutionContext,
  toolRegistry: ToolRegistry
): Promise<ExecutionStep> {
  const startTime = Date.now();

  // Record the action step
  const actionStep: ExecutionStep = {
    id: generateStepId(),
    type: 'action',
    content: `Exécution de l'outil ${toolName}`,
    toolName,
    toolInput,
    timestamp: new Date().toISOString(),
  };
  context.steps.push(actionStep);

  // Execute the tool
  const tool = toolRegistry.get(toolName);
  if (!tool) {
    const errorStep: ExecutionStep = {
      id: generateStepId(),
      type: 'error',
      content: `Outil "${toolName}" non trouvé. Outils disponibles: ${context.tools.join(', ')}`,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      confidence: 0,
      needsRetry: true,
      alternativeApproach: 'Essayer un outil différent ou reformuler la demande',
    };
    context.steps.push(errorStep);
    return errorStep;
  }

  // Check guardrails for dangerous tools
  if (tool.isDangerous && context.guardrailsActive) {
    const guardrails = await db.guardrail.findMany({
      where: { userId: context.userId, isActive: true },
    });

    if (guardrails.length > 0) {
      const blockingGuardrail = guardrails.find(g => {
        try {
          const rules = JSON.parse(g.rules);
          return rules.blockDangerousTools === true || rules.blockTools?.includes(toolName);
        } catch {
          return false;
        }
      });

      if (blockingGuardrail) {
        const obsStep: ExecutionStep = {
          id: generateStepId(),
          type: 'observation',
          content: `Action bloquée par le garde-fou "${blockingGuardrail.name}". Approbation requise.`,
          toolName,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          confidence: 0.3,
          needsRetry: true,
          alternativeApproach: 'Demander l\'approbation de l\'utilisateur ou utiliser un outil alternatif non dangereux',
        };
        context.steps.push(obsStep);
        context.status = 'awaiting_approval';
        return obsStep;
      }
    }
  }

  // Execute the tool
  const result = await toolRegistry.execute(toolName, toolInput, {
    userId: context.userId,
    agentId: context.agentId,
    conversationId: context.conversationId,
    sandbox: true,
  });

  const duration = Date.now() - startTime;

  if (result.success) {
    const outputStr = typeof result.result === 'string'
      ? result.result
      : JSON.stringify(result.result, null, 2);

    const obsStep: ExecutionStep = {
      id: generateStepId(),
      type: 'observation',
      content: outputStr.length > 2000 ? outputStr.substring(0, 2000) + '... [tronqué]' : outputStr,
      toolName,
      toolOutput: result.result,
      timestamp: new Date().toISOString(),
      duration,
      confidence: 0.8,
    };
    context.steps.push(obsStep);
    context.memory.shortTerm.push({
      role: 'user',
      content: `Résultat de ${toolName}: ${obsStep.content}`,
    });

    // Now REFLECT on the result before continuing
    const reflectionStep = await reflectStep(context, toolRegistry, obsStep);
    return reflectionStep;
  } else {
    const errorStep: ExecutionStep = {
      id: generateStepId(),
      type: 'error',
      content: `Erreur de l'outil ${toolName}: ${result.error}`,
      toolName,
      timestamp: new Date().toISOString(),
      duration,
      confidence: 0.1,
      needsRetry: true,
      alternativeApproach: `L'outil ${toolName} a échoué. Essayer une approche différente.`,
    };
    context.steps.push(errorStep);
    return errorStep;
  }
}

// ============================================================
// STEP 3: OBSERVE — Already integrated into actStep above
// Results are captured as 'observation' type steps
// ============================================================

// ============================================================
// STEP 4: REFLECT — Agent evaluates its own progress and quality
// This is the key differentiator from a simple ReAct loop
// ============================================================

async function reflectStep(
  context: ExecutionContext,
  toolRegistry: ToolRegistry,
  lastObservation: ExecutionStep
): Promise<ExecutionStep> {
  const startTime = Date.now();

  try {
    const recentSteps = context.steps.slice(-5);
    const stepSummary = recentSteps.map(s => {
      switch (s.type) {
        case 'thought': return `💭 Pensée: ${s.content}`;
        case 'action': return `🔧 Action: ${s.toolName}(${JSON.stringify(s.toolInput || {})})`;
        case 'observation': return `👁️ Observation: ${s.content.substring(0, 500)}`;
        case 'error': return `❌ Erreur: ${s.content}`;
        case 'reflection': return `🪞 Réflexion: ${s.content}`;
        case 'correction': return `🔄 Correction: ${s.content}`;
        default: return s.content;
      }
    }).join('\n');

    const reflectPrompt = `Tu es le système de réflexion de ${context.agentName}. Évalue la progression de l'agent vers son objectif.

## Objectif
${context.task}

## Dernière observation
${lastObservation.content.substring(0, 1000)}

## Étapes récentes
${stepSummary}

## Évalue ce qui suit
1. La progression vers l'objectif (0-1)
2. La qualité du résultat de la dernière action
3. S'il faut réessayer différemment
4. S'il faut adapter le plan
5. S'il faut changer d'approche

Réponds UNIQUEMENT en JSON:
{
  "progressScore": 0.0 à 1.0,
  "qualityScore": 0.0 à 1.0,
  "needsRetry": true/false,
  "needsAdaptation": true/false,
  "reflection": "Analyse de la progression et recommandation",
  "recommendation": "continuer | retry | adapt | stop | respond",
  "alternativeApproach": "Description d'une approche alternative si retry ou adapt",
  "confidenceInResult": 0.0 à 1.0
}`;

    const result = await chatCompletion([
      { role: 'system', content: reflectPrompt },
      { role: 'user', content: 'Évalue la progression actuelle.' },
    ], 'reasoning');

    let parsed: {
      progressScore: number;
      qualityScore: number;
      needsRetry: boolean;
      needsAdaptation: boolean;
      reflection: string;
      recommendation: string;
      alternativeApproach?: string;
      confidenceInResult: number;
    };

    try {
      let content = result.content.trim();
      content = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(content);
    } catch {
      // If parsing fails, make a simple assessment
      const hasErrors = recentSteps.some(s => s.type === 'error');
      parsed = {
        progressScore: 0.5,
        qualityScore: hasErrors ? 0.3 : 0.7,
        needsRetry: hasErrors,
        needsAdaptation: false,
        reflection: 'Évaluation impossible à parser, progression estimée modérée.',
        recommendation: hasErrors ? 'retry' : 'continuer',
        confidenceInResult: 0.5,
      };
    }

    const reflectionStep: ExecutionStep = {
      id: generateStepId(),
      type: 'reflection',
      content: parsed.reflection,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      reflectionScore: parsed.progressScore,
      confidence: parsed.confidenceInResult,
      needsRetry: parsed.needsRetry,
      alternativeApproach: parsed.alternativeApproach,
      retryCount: 0,
    };
    context.steps.push(reflectionStep);

    // Handle the reflection recommendations
    switch (parsed.recommendation) {
      case 'retry': {
        // If the agent thinks we should retry, attempt self-correction
        const retryStep = await retryWithCorrection(context, toolRegistry, parsed.alternativeApproach);
        return retryStep;
      }

      case 'adapt': {
        // Adapt the plan if needed
        await adaptPlan(context, parsed.alternativeApproach || '');
        break;
      }

      case 'respond': {
        // Agent is confident enough to provide final answer
        const resultStep: ExecutionStep = {
          id: generateStepId(),
          type: 'result',
          content: lastObservation.content,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          confidence: parsed.confidenceInResult,
        };
        context.steps.push(resultStep);
        context.status = 'completed';
        return resultStep;
      }

      case 'stop': {
        context.status = 'failed';
        const failStep: ExecutionStep = {
          id: generateStepId(),
          type: 'error',
          content: `L'agent a décidé d'arrêter: ${parsed.reflection}`,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          confidence: parsed.confidenceInResult,
        };
        context.steps.push(failStep);
        return failStep;
      }

      // 'continuer' — just continue the loop
      default:
        break;
    }

    return reflectionStep;
  } catch (error) {
    // If reflection fails, just continue — don't break the loop
    const errorStep: ExecutionStep = {
      id: generateStepId(),
      type: 'error',
      content: `Erreur de réflexion: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
    };
    context.steps.push(errorStep);
    return errorStep;
  }
}

// ============================================================
// STEP 5: RETRY WITH CORRECTION — Self-correction mechanism
// ============================================================

async function retryWithCorrection(
  context: ExecutionContext,
  toolRegistry: ToolRegistry,
  alternativeApproach?: string
): Promise<ExecutionStep> {
  const startTime = Date.now();

  // Find the last failed/error step to retry
  const lastError = [...context.steps].reverse().find(s => s.type === 'error' || s.needsRetry);
  const lastAction = [...context.steps].reverse().find(s => s.type === 'action');

  // Check retry limits
  const retryCount = context.steps.filter(s => s.type === 'retry').length;
  if (retryCount >= context.maxRetries) {
    const failStep: ExecutionStep = {
      id: generateStepId(),
      type: 'error',
      content: `Limite de tentatives atteinte (${context.maxRetries}). Dernière erreur: ${lastError?.content || 'Inconnue'}`,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
    };
    context.steps.push(failStep);
    context.status = 'failed';
    return failStep;
  }

  // Build correction prompt
  const correctionPrompt = `Tu es ${context.agentName}. Ta dernière action a échoué et tu dois corriger ton approche.

## Objectif
${context.task}

## Dernière action tentée
${lastAction ? `Outil: ${lastAction.toolName}\nParamètres: ${JSON.stringify(lastAction.toolInput || {})}` : 'Aucune action précédente'}

## Erreur rencontrée
${lastError?.content || 'Erreur inconnue'}

## Approche alternative suggérée
${alternativeApproach || 'Aucune suggestion, trouve une alternative toi-même'}

## Instructions
Analyse l'erreur et propose une action corrigée. Réponds en JSON:
{
  "analysis": "Analyse de pourquoi l'action a échoué",
  "correctedAction": "nom_de_l_outil_ou_respond",
  "correctedInput": { "param": "valeur" },
  "isFinal": false,
  "confidence": 0.0 à 1.0
}`;

  try {
    const result = await chatCompletion([
      { role: 'system', content: correctionPrompt },
      { role: 'user', content: 'Propose une action corrigée.' },
    ], 'reasoning');

    let parsed: {
      analysis: string;
      correctedAction: string;
      correctedInput: Record<string, unknown>;
      isFinal: boolean;
      confidence: number;
    };

    try {
      let content = result.content.trim();
      content = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(content);
    } catch {
      // If parsing fails, try responding directly
      parsed = {
        analysis: result.content,
        correctedAction: 'respond',
        correctedInput: { message: result.content },
        isFinal: true,
        confidence: 0.3,
      };
    }

    const correctionStep: ExecutionStep = {
      id: generateStepId(),
      type: 'correction',
      content: parsed.analysis,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      confidence: parsed.confidence,
      retryCount: retryCount + 1,
      alternativeApproach,
    };
    context.steps.push(correctionStep);

    const retryStep: ExecutionStep = {
      id: generateStepId(),
      type: 'retry',
      content: `Tentative ${retryCount + 1}/${context.maxRetries}: ${parsed.analysis}`,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      retryCount: retryCount + 1,
    };
    context.steps.push(retryStep);

    // Execute the corrected action
    if (parsed.isFinal || parsed.correctedAction === 'respond') {
      const resultStep: ExecutionStep = {
        id: generateStepId(),
        type: 'result',
        content: (parsed.correctedInput?.message as string) || parsed.analysis,
        timestamp: new Date().toISOString(),
        confidence: parsed.confidence,
      };
      context.steps.push(resultStep);
      context.status = 'completed';
      return resultStep;
    }

    if (parsed.correctedAction) {
      return await actStep(parsed.correctedAction, parsed.correctedInput || {}, context, toolRegistry);
    }

    return correctionStep;
  } catch (error) {
    const errorStep: ExecutionStep = {
      id: generateStepId(),
      type: 'error',
      content: `Erreur lors de la correction: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
    };
    context.steps.push(errorStep);
    return errorStep;
  }
}

// ============================================================
// ADAPTIVE PLANNING — Adjust plan based on reflection
// ============================================================

async function adaptPlan(
  context: ExecutionContext,
  reason: string
): Promise<void> {
  if (!context.plan) return;

  const currentStep = context.plan.steps[context.plan.currentStepIndex];
  if (!currentStep) return;

  // Record the adaptation
  context.plan.adaptiveHistory.push({
    stepIndex: context.plan.currentStepIndex,
    reason,
    originalPlan: currentStep.description,
    adaptedPlan: `Adapté: ${reason}`,
    timestamp: new Date().toISOString(),
  });

  // Mark current step as needing adaptation
  currentStep.status = 'failed';
}

// ============================================================
// BUILD THE THINK PROMPT
// ============================================================

function buildThinkPrompt(context: ExecutionContext, toolRegistry: ToolRegistry): string {
  const availableTools = context.tools
    .map(name => toolRegistry.get(name))
    .filter(Boolean);

  const toolDescriptions = availableTools.length > 0
    ? availableTools.map(t => `- ${t!.name}: ${t!.description}${t!.isDangerous ? ' [DANGEREUX]' : ''}`).join('\n')
    : 'Aucun outil disponible.';

  const stepHistory = context.steps
    .slice(-12) // Keep last 12 steps for context
    .map(step => {
      switch (step.type) {
        case 'thought': return `💭 Pensée: ${step.content}`;
        case 'action': return `🔧 Action: ${step.toolName}(${JSON.stringify(step.toolInput || {})})`;
        case 'observation': return `👁️ Observation: ${step.content.substring(0, 500)}`;
        case 'reflection': return `🪞 Réflexion (score: ${step.reflectionScore?.toFixed(2) || 'N/A'}): ${step.content}`;
        case 'correction': return `🔄 Correction: ${step.content}`;
        case 'retry': return `🔁 ${step.content}`;
        case 'error': return `❌ Erreur: ${step.content}`;
        case 'result': return `✅ Résultat: ${step.content}`;
        default: return step.content;
      }
    })
    .join('\n');

  const planContext = context.plan
    ? `## Plan actuel\nÉtape ${context.plan.currentStepIndex + 1}/${context.plan.steps.length}: ${context.plan.steps[context.plan.currentStepIndex]?.description || 'Terminé'}\nAdaptations: ${context.plan.adaptiveHistory.length}`
    : '';

  return `Tu es ${context.agentName}, un agent IA de type ${context.agentType} avec une architecture autonome Think→Act→Observe→Reflect→Retry.

## Ta mission
${context.task}

## Configuration de l'agent
${JSON.stringify(context.agentConfig, null, 2)}

## Mémoire à long terme
${context.memory.longTermContext || 'Aucune mémoire à long terme pertinente.'}

## Outils disponibles
${toolDescriptions}

${planContext}

## Historique d'exécution
${stepHistory || 'Aucune étape précédente.'}

## Cycle d'exécution autonome
Tu suis le cycle: THINK → ACT → OBSERVE → REFLECT → (RETRY si nécessaire)
- THINK: Raisonne sur la situation, analyse les options
- ACT: Choisis et exécute un outil
- OBSERVE: Observe le résultat de l'action
- REFLECT: Évalue ta progression, décide si tu dois réessayer ou adapter
- RETRY: Si une action échoue, corrige et réessaie avec une approche différente

Tu as au maximum ${context.maxSteps} étapes et ${context.maxRetries} tentatives de correction.

## Format de réponse OBLIGATOIRE
Réponds UNIQUEMENT en JSON valide:
{
  "thought": "Ton raisonnement détaillé sur la situation et ta décision",
  "action": "nom_de_l_outil_ou_respond",
  "actionInput": { "param": "valeur" },
  "isFinal": false,
  "confidence": 0.0 à 1.0
}

Si "action" est "respond", c'est ta réponse finale et "isFinal" doit être true.
Si "action" est un nom d'outil, "actionInput" contient les paramètres.
"confidence" indique ton niveau de confiance dans cette action.

Réponds TOUJOURS en français.`;
}

// ============================================================
// MAIN EXECUTION LOOP
// ============================================================

export async function executeAgentLoop(
  context: ExecutionContext,
  toolRegistry: ToolRegistry,
  onStep?: (step: ExecutionStep) => void
): Promise<ExecutionStep[]> {
  stepCounter = 0;

  // Set defaults
  context.maxRetries = context.maxRetries || 3;
  context.startedAt = context.startedAt || new Date().toISOString();
  context.lastUpdatedAt = new Date().toISOString();
  context.totalTokensUsed = context.totalTokensUsed || 0;
  context.totalCost = context.totalCost || 0;

  // Load agent config from database if needed
  if (!context.agentConfig || Object.keys(context.agentConfig).length === 0) {
    const agent = await db.agent.findUnique({
      where: { id: context.agentId },
    });
    if (agent) {
      context.agentName = agent.name;
      context.agentType = agent.type;
      try {
        context.agentConfig = JSON.parse(agent.config);
      } catch {
        context.agentConfig = {};
      }
    }
  }

  // Load long-term memory context
  const longTermMemory = new LongTermMemory();
  const knowledgeContext = await longTermMemory.getContextForQuery(context.task, context.userId);
  context.memory.longTermContext = knowledgeContext;

  // Load short-term memory from conversation if available
  if (context.conversationId) {
    const shortTermMemory = new ShortTermMemory();
    const conversationContext = await shortTermMemory.getContext(context.conversationId, 10);
    context.memory.shortTerm = conversationContext;
  }

  // Create initial plan if no plan exists
  if (!context.plan) {
    context.plan = await createExecutionPlan(context);
  }

  // Start the execution loop
  let currentStep = 0;
  context.status = 'running';
  const tracer = new Tracer();
  const traceId = tracer.startTrace(context.agentId, context.task);

  while (currentStep < context.maxSteps && context.status === 'running') {
    currentStep++;

    try {
      const step = await thinkStep(context, toolRegistry);

      // Track in tracer
      tracer.addStep(traceId, {
        type: step.type,
        content: step.content.substring(0, 200),
        duration: step.duration || 0,
        tokensUsed: Math.ceil(step.content.length / 4),
        model: 'auto-routed',
        provider: 'groq/openrouter',
        toolName: step.toolName,
        toolDuration: step.duration,
      });

      // Notify callback
      if (onStep) {
        onStep(step);
      }

      // Check terminal states
      if (['completed', 'awaiting_approval', 'paused', 'failed'].includes(context.status)) {
        break;
      }

      // If we got a result, we're done
      if (step.type === 'result') {
        context.status = 'completed';
        break;
      }

      // If too many consecutive errors, stop
      const recentErrors = context.steps.slice(-3).filter(s => s.type === 'error').length;
      if (recentErrors >= 3) {
        context.status = 'failed';
        const failStep: ExecutionStep = {
          id: generateStepId(),
          type: 'error',
          content: 'Trop d\'erreurs consécutives. Arrêt de l\'exécution.',
          timestamp: new Date().toISOString(),
        };
        context.steps.push(failStep);
        if (onStep) onStep(failStep);
        break;
      }

      // Adaptive: if we've been running for many steps without progress, trigger reflection
      if (currentStep > context.maxSteps * 0.7) {
        const progressSteps = context.steps.filter(s => s.type === 'observation' || s.type === 'result');
        if (progressSteps.length === 0) {
          // Force a reflection to check if we should stop or change approach
          const forcedReflection: ExecutionStep = {
            id: generateStepId(),
            type: 'reflection',
            content: 'Auto-réflexion déclenchée: progression insuffisante après de nombreuses étapes.',
            timestamp: new Date().toISOString(),
            reflectionScore: 0.2,
            needsRetry: true,
          };
          context.steps.push(forcedReflection);
        }
      }
    } catch (error) {
      const errorStep: ExecutionStep = {
        id: generateStepId(),
        type: 'error',
        content: `Erreur d'exécution: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
        timestamp: new Date().toISOString(),
      };
      context.steps.push(errorStep);
      if (onStep) onStep(errorStep);
      context.status = 'failed';
      break;
    }
  }

  // If we ran out of steps without completing
  if (currentStep >= context.maxSteps && context.status === 'running') {
    context.status = 'completed';
    const finalStep: ExecutionStep = {
      id: generateStepId(),
      type: 'result',
      content: 'Limite d\'étapes atteinte. Résumé des résultats partiels:\n' +
        context.steps.filter(s => s.type === 'observation').map(s => s.content).join('\n'),
      timestamp: new Date().toISOString(),
    };
    context.steps.push(finalStep);
    if (onStep) onStep(finalStep);
  }

  // End trace
  tracer.endTrace(traceId, context.status === 'completed' ? 'completed' : 'failed');

  // Save execution to database
  await saveExecution(context);

  return context.steps;
}

// ============================================================
// EXECUTION PLAN CREATION
// ============================================================

async function createExecutionPlan(context: ExecutionContext): Promise<ExecutionPlan> {
  try {
    const planPrompt = `Tu es le planificateur de ${context.agentName}. Crée un plan d'exécution pour la tâche suivante.

## Tâche
${context.task}

## Outils disponibles
${context.tools.join(', ') || 'Aucun'}

Crée un plan simple avec 3-5 étapes maximum. Réponds en JSON:
{
  "steps": [
    { "description": "Description de l'étape", "toolHint": "outil_suggéré", "dependsOn": [] }
  ]
}

Réponds en français.`;

    const result = await chatCompletion([
      { role: 'system', content: planPrompt },
      { role: 'user', content: 'Crée le plan d\'exécution.' },
    ], 'orchestration');

    let parsed: { steps: Array<{ description: string; toolHint?: string; dependsOn?: string[] }> };
    try {
      let content = result.content.trim();
      content = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(content);
    } catch {
      // Create a simple default plan
      parsed = {
        steps: [
          { description: 'Analyser la demande', toolHint: undefined },
          { description: 'Exécuter les actions nécessaires', toolHint: undefined },
          { description: 'Vérifier et présenter les résultats', toolHint: 'respond' },
        ],
      };
    }

    return {
      steps: parsed.steps.map((step, i) => ({
        id: `plan_step_${i}`,
        description: step.description,
        status: 'pending' as const,
        dependsOn: step.dependsOn,
        toolHint: step.toolHint,
      })),
      currentStepIndex: 0,
      adaptiveHistory: [],
    };
  } catch {
    return {
      steps: [{ id: 'plan_step_0', description: 'Exécuter la tâche', status: 'pending' }],
      currentStepIndex: 0,
      adaptiveHistory: [],
    };
  }
}

// ============================================================
// PERSISTENT EXECUTION STATE
// ============================================================

export async function saveExecutionState(context: ExecutionContext): Promise<string> {
  const stateId = context.executionId || `exec_${Date.now()}`;

  // Save to database for resume capability
  try {
    await db.agentExecution.upsert({
      where: { id: stateId },
      create: {
        id: stateId,
        agentId: context.agentId,
        task: context.task,
        steps: JSON.stringify(context.steps),
        status: context.status,
        totalDuration: context.steps.reduce((sum, s) => sum + (s.duration || 0), 0),
        totalTokens: context.totalTokensUsed,
        estimatedCost: context.totalCost,
        model: 'auto-routed',
        provider: 'groq/openrouter',
        userId: context.userId,
        conversationId: context.conversationId,
      },
      update: {
        steps: JSON.stringify(context.steps),
        status: context.status,
        totalDuration: context.steps.reduce((sum, s) => sum + (s.duration || 0), 0),
        totalTokens: context.totalTokensUsed,
        estimatedCost: context.totalCost,
      },
    });
  } catch {
    // Fail silently on save error
  }

  return stateId;
}

export async function loadExecutionState(executionId: string): Promise<ExecutionContext | null> {
  try {
    const execution = await db.agentExecution.findUnique({
      where: { id: executionId },
    });

    if (!execution || execution.status !== 'paused') return null;

    return {
      agentId: execution.agentId,
      agentName: '',
      agentType: 'custom',
      agentConfig: {},
      task: execution.task,
      userId: execution.userId,
      conversationId: execution.conversationId || undefined,
      maxSteps: 10,
      maxRetries: 3,
      steps: JSON.parse(execution.steps || '[]'),
      status: 'running',
      memory: { shortTerm: [], longTermContext: '' },
      tools: [],
      guardrailsActive: true,
      executionId,
      startedAt: execution.createdAt.toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      totalTokensUsed: execution.totalTokens || 0,
      totalCost: execution.estimatedCost || 0,
    };
  } catch {
    return null;
  }
}

// ============================================================
// SAVE FINAL EXECUTION
// ============================================================

async function saveExecution(context: ExecutionContext): Promise<void> {
  try {
    const totalDuration = context.steps.reduce((sum, s) => sum + (s.duration || 0), 0);

    await db.agentExecution.create({
      data: {
        agentId: context.agentId,
        task: context.task,
        steps: JSON.stringify(context.steps),
        status: context.status,
        totalDuration,
        totalTokens: context.totalTokensUsed || context.steps.length * 500,
        estimatedCost: context.totalCost || context.steps.length * 0.001,
        model: 'auto-routed',
        provider: 'groq/openrouter',
        userId: context.userId,
        conversationId: context.conversationId,
      },
    });

    // Extract and store learnings in long-term memory
    const successfulObservations = context.steps.filter(s => s.type === 'observation' && s.confidence && s.confidence > 0.7);
    if (successfulObservations.length > 0) {
      const ltm = new LongTermMemory();
      for (const obs of successfulObservations) {
        await ltm.store({
          content: `Apprentissage de ${context.agentName}: ${obs.content.substring(0, 500)}`,
          category: 'agent_learning',
          tags: [context.agentType, obs.toolName || 'general', 'auto-learned'],
          source: 'execution',
          relevance: obs.confidence || 0.7,
          userId: context.userId,
        });
      }
    }
  } catch {
    // Fail silently on save error
  }
}
