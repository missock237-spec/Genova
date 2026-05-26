// Agent Execution Loop — The ReAct (Reason + Act) Loop
// Agent follows: Observe → Think → Act → Observe → Think → Act → ...

import { chatCompletion } from '@/lib/ai-router';
import { ToolRegistry } from '@/lib/tools/registry';
import { ShortTermMemory } from '@/lib/memory/short-term';
import { LongTermMemory } from '@/lib/memory/long-term';
import { db } from '@/lib/db';

export interface ExecutionStep {
  id: string;
  type: 'thought' | 'action' | 'observation' | 'plan' | 'error' | 'result';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  timestamp: string;
  duration?: number;
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
  steps: ExecutionStep[];
  status: 'running' | 'completed' | 'failed' | 'paused' | 'awaiting_approval';
  memory: {
    shortTerm: Array<{ role: string; content: string }>;
    longTermContext: string;
  };
  tools: string[];
  guardrailsActive: boolean;
}

let stepCounter = 0;

function generateStepId(): string {
  return `step_${Date.now()}_${++stepCounter}`;
}

/**
 * Build the system prompt for the ReAct loop
 */
function buildReActPrompt(context: ExecutionContext, toolRegistry: ToolRegistry): string {
  const availableTools = context.tools
    .map(name => toolRegistry.get(name))
    .filter(Boolean);

  const toolDescriptions = availableTools.length > 0
    ? availableTools.map(t => `- ${t!.name}: ${t!.description}`).join('\n')
    : 'Aucun outil disponible.';

  const stepHistory = context.steps
    .map(step => {
      switch (step.type) {
        case 'thought': return `💭 Pensée: ${step.content}`;
        case 'action': return `🔧 Action: ${step.toolName}(${JSON.stringify(step.toolInput || {})})`;
        case 'observation': return `👁️ Observation: ${step.content}`;
        case 'error': return `❌ Erreur: ${step.content}`;
        case 'result': return `✅ Résultat: ${step.content}`;
        default: return step.content;
      }
    })
    .join('\n');

  return `Tu es ${context.agentName}, un agent IA de type ${context.agentType}. Tu exécutes des tâches de manière autonome en suivant le cycle Reason-Act (ReAct).

## Ta mission
${context.task}

## Configuration de l'agent
${JSON.stringify(context.agentConfig, null, 2)}

## Mémoire à long terme
${context.memory.longTermContext || 'Aucune mémoire à long terme pertinente.'}

## Outils disponibles
${toolDescriptions}

## Historique d'exécution
${stepHistory || 'Aucune étape précédente.'}

## Instructions CRITIQUES
1. Analyse la tâche et raisonne étape par étape
2. Décide de la prochaine action à entreprendre
3. Si tu as besoin d'information, utilise un outil
4. Si tu as assez d'information, donne ta réponse finale
5. Tu as au maximum ${context.maxSteps} étapes

## Format de réponse OBLIGATOIRE
Réponds UNIQUEMENT en JSON valide avec cette structure:
{
  "thought": "Ton raisonnement sur la situation actuelle et ce que tu vas faire",
  "action": "nom_de_l_outil_ou_respond",
  "actionInput": { "param": "valeur" },
  "isFinal": false
}

Si "action" est "respond", c'est ta réponse finale et "isFinal" doit être true.
Si "action" est un nom d'outil, "actionInput" contient les paramètres de l'outil.

Réponds TOUJOURS en français.`;
}

/**
 * The thinking step — agent reasons about what to do next
 */
async function thinkStep(
  context: ExecutionContext,
  toolRegistry: ToolRegistry
): Promise<ExecutionStep> {
  const startTime = Date.now();

  try {
    const systemPrompt = buildReActPrompt(context, toolRegistry);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...context.memory.shortTerm.slice(-6),
      { role: 'user' as const, content: 'Quelle est ta prochaine action ? Réponds en JSON.' },
    ];

    const result = await chatCompletion(messages, 'reasoning');
    const duration = Date.now() - startTime;

    // Parse the LLM response
    let parsed: { thought: string; action: string; actionInput: Record<string, unknown>; isFinal: boolean };
    try {
      // Try to extract JSON from the response
      let content = result.content.trim();
      // Remove markdown code blocks if present
      content = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(content);
    } catch {
      // If JSON parsing fails, treat the whole response as a thought
      parsed = {
        thought: result.content,
        action: 'respond',
        actionInput: { message: result.content },
        isFinal: true,
      };
    }

    const step: ExecutionStep = {
      id: generateStepId(),
      type: 'thought',
      content: parsed.thought || 'Analyse en cours...',
      timestamp: new Date().toISOString(),
      duration,
    };

    context.steps.push(step);
    context.memory.shortTerm.push({ role: 'assistant', content: parsed.thought });

    // If this is a final response, return it as a result step
    if (parsed.isFinal || parsed.action === 'respond') {
      const resultStep: ExecutionStep = {
        id: generateStepId(),
        type: 'result',
        content: (parsed.actionInput?.message as string) || parsed.thought || 'Tâche terminée',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      };
      context.steps.push(resultStep);
      context.status = 'completed';
      return resultStep;
    }

    // If an action is specified, execute it
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
    };
    context.steps.push(errorStep);
    return errorStep;
  }
}

/**
 * Execute a tool action
 */
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
    };
    context.steps.push(errorStep);
    return errorStep;
  }

  // Check guardrails for dangerous tools
  if (tool.isDangerous && context.guardrailsActive) {
    // Check if there are active guardrails
    const guardrails = await db.guardrail.findMany({
      where: { userId: context.userId, isActive: true },
    });

    if (guardrails.length > 0) {
      // Simple guardrail check: if any guardrail blocks dangerous operations
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
          content: `Action bloquée par le garde-fou "${blockingGuardrail.name}". Approbation requise pour les outils dangereux.`,
          toolName,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
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
    sandbox: false,
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
    };
    context.steps.push(obsStep);
    context.memory.shortTerm.push({
      role: 'user',
      content: `Résultat de ${toolName}: ${obsStep.content}`,
    });
    return obsStep;
  } else {
    const errorStep: ExecutionStep = {
      id: generateStepId(),
      type: 'error',
      content: `Erreur de l'outil ${toolName}: ${result.error}`,
      toolName,
      timestamp: new Date().toISOString(),
      duration,
    };
    context.steps.push(errorStep);
    return errorStep;
  }
}

/**
 * Main execution function — runs the ReAct loop
 */
export async function executeAgentLoop(
  context: ExecutionContext,
  toolRegistry: ToolRegistry,
  onStep?: (step: ExecutionStep) => void
): Promise<ExecutionStep[]> {
  // Reset step counter
  stepCounter = 0;

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

  // Start the execution loop
  let currentStep = 0;
  context.status = 'running';

  while (currentStep < context.maxSteps && context.status === 'running') {
    currentStep++;

    try {
      const step = await thinkStep(context, toolRegistry);

      // Notify callback
      if (onStep) {
        onStep(step);
      }

      // If the loop completed or is awaiting approval, stop
      if (context.status === 'completed' || context.status === 'awaiting_approval' || context.status === 'paused') {
        break;
      }

      // If we got a result, we're done
      if (step.type === 'result') {
        context.status = 'completed';
        break;
      }

      // If we got too many errors in a row, stop
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

  // Save execution to database
  await saveExecution(context);

  return context.steps;
}

/**
 * Save the execution to the database
 */
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
        totalTokens: context.steps.length * 500, // Rough estimate
        estimatedCost: context.steps.length * 0.001, // Rough estimate
        model: 'auto-routed',
        provider: 'groq/openrouter',
        userId: context.userId,
        conversationId: context.conversationId,
      },
    });
  } catch {
    // Fail silently on save error
  }
}
