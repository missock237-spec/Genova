// Agent Execution Loop — avec ResourceGuard anti-epuisement + Validation Zod (P0-3)

import { chatCompletion } from '@/lib/ai-router';
import { ToolRegistry } from '@/lib/tools/registry';
import { ShortTermMemory } from '@/lib/memory/short-term';
import { LongTermMemory } from '@/lib/memory/long-term';
import { db } from '@/lib/db';
import { checkpointManager, CheckpointState } from '@/lib/agent-engine/checkpoint-manager';
import { Tracer } from '@/lib/observability/tracer';
import { ResourceGuard, limitString } from '@/lib/resource-guard';
import { z } from 'zod';

// P0-3: Zod schema pour la sortie LLM dans le cycle think/act
const LLMThinkOutputSchema = z.object({
  thought: z.string().max(8000),
  action: z.string().max(256),
  actionInput: z.record(z.string(), z.unknown()).optional().default({}),
  isFinal: z.boolean().optional().default(false),
  confidence: z.number().min(0).max(1).optional().default(0.5),
});

const guard = new ResourceGuard({ timeoutMs: 60000, maxIterations: 25, maxStringLength: 100000 });

export interface ExecutionStep {
  id: string;
  type: 'thought' | 'action' | 'observation' | 'reflection' | 'plan' | 'error' | 'result' | 'retry' | 'correction';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  timestamp: string;
  duration?: number;
  confidence?: number;
  reflectionScore?: number;
  needsRetry?: boolean;
  retryCount?: number;
  alternativeApproach?: string;
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
  memory: { shortTerm: Array<{ role: string; content: string }>; longTermContext: string };
  tools: string[];
  guardrailsActive: boolean;
  plan?: ExecutionPlan;
  executionId?: string;
  startedAt: string;
  lastUpdatedAt: string;
  totalTokensUsed: number;
  totalCost: number;
}

let stepCounter = 0;
function generateStepId(): string { return `step_${Date.now()}_${++stepCounter}`; }

async function thinkStep(context: ExecutionContext, toolRegistry: ToolRegistry): Promise<ExecutionStep> {
  return guard.withTimeout(async () => {
    const startTime = Date.now();
    try {
      const systemPrompt = buildThinkPrompt(context, toolRegistry);
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...context.memory.shortTerm.slice(-8).map(m => ({ role: m.role as 'user'|'assistant'|'system', content: m.content })),
        { role: 'user', content: 'Analyse la situation actuelle.' },
      ];
      const result = await chatCompletion(messages, 'reasoning');
      const duration = Date.now() - startTime;
      // P0-3: Validation Zod stricte de la sortie LLM
      let parsed: z.infer<typeof LLMThinkOutputSchema>;
      try {
        const content = result.content.trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const raw = JSON.parse(content);
        const zodResult = LLMThinkOutputSchema.safeParse(raw);
        if (!zodResult.success) {
          // FAIL-CLOSED: sortie LLM invalide → erreur
          const errorStep: ExecutionStep = { id: generateStepId(), type: 'error', content: `Sortie LLM invalide (Zod): ${zodResult.error.issues.map(i => i.message).join(', ')}`, timestamp: new Date().toISOString(), duration, confidence: 0 };
          context.steps.push(errorStep);
          context.status = 'error';
          return errorStep;
        }
        parsed = zodResult.data;
      } catch {
        parsed = { thought: result.content, action: 'respond', actionInput: { message: result.content }, isFinal: true, confidence: 0.5 };
      }
      const step: ExecutionStep = { id: generateStepId(), type: 'thought', content: limitString(parsed.thought || 'Analyse...', 5000), timestamp: new Date().toISOString(), duration, confidence: parsed.confidence || 0.5 };
      context.steps.push(step);
      context.memory.shortTerm.push({ role: 'assistant', content: limitString(parsed.thought, 5000) });
      context.totalTokensUsed += Math.ceil(result.content.length / 4);
      context.lastUpdatedAt = new Date().toISOString();
      if (parsed.isFinal || parsed.action === 'respond') {
        const resultStep: ExecutionStep = { id: generateStepId(), type: 'result', content: limitString((parsed.actionInput?.message as string) || parsed.thought || 'Termine', 10000), timestamp: new Date().toISOString(), duration, confidence: parsed.confidence };
        context.steps.push(resultStep);
        context.status = 'completed';
        return resultStep;
      }
      if (parsed.action && parsed.action !== 'respond') return await actStep(parsed.action, parsed.actionInput || {}, context, toolRegistry);
      return step;
    } catch (error) {
      const errorStep: ExecutionStep = { id: generateStepId(), type: 'error', content: `Erreur: ${error instanceof Error ? error.message : 'Inconnue'}`, timestamp: new Date().toISOString(), duration: Date.now() - startTime, confidence: 0 };
      context.steps.push(errorStep);
      return errorStep;
    }
  }, 30000);
}

async function actStep(toolName: string, toolInput: Record<string, unknown>, context: ExecutionContext, toolRegistry: ToolRegistry): Promise<ExecutionStep> {
  return guard.withTimeout(async () => {
    const startTime = Date.now();
    const actionStep: ExecutionStep = { id: generateStepId(), type: 'action', content: `Execution de ${toolName}`, toolName, toolInput, timestamp: new Date().toISOString() };
    context.steps.push(actionStep);
    const tool = toolRegistry.get(toolName);
    if (!tool) {
      const errorStep: ExecutionStep = { id: generateStepId(), type: 'error', content: `Outil "${toolName}" non trouve`, timestamp: new Date().toISOString(), duration: Date.now() - startTime, confidence: 0, needsRetry: true };
      context.steps.push(errorStep);
      return errorStep;
    }
    const result = await toolRegistry.execute(toolName, guard.limitDepth(toolInput, 5) as Record<string, unknown>, { userId: context.userId, agentId: context.agentId, conversationId: context.conversationId, sandbox: true });
    const duration = Date.now() - startTime;
    if (result.success) {
      const outputStr = typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2);
      const obsStep: ExecutionStep = { id: generateStepId(), type: 'observation', content: limitString(outputStr, 2000), toolName, toolOutput: result.result, timestamp: new Date().toISOString(), duration, confidence: 0.8 };
      context.steps.push(obsStep);
      context.memory.shortTerm.push({ role: 'user', content: `Resultat de ${toolName}: ${limitString(obsStep.content, 2000)}` });
      return await reflectStep(context, toolRegistry, obsStep);
    } else {
      const errorStep: ExecutionStep = { id: generateStepId(), type: 'error', content: `Erreur ${toolName}: ${result.error}`, toolName, timestamp: new Date().toISOString(), duration, confidence: 0.1, needsRetry: true };
      context.steps.push(errorStep);
      return errorStep;
    }
  }, 30000);
}

async function reflectStep(context: ExecutionContext, toolRegistry: ToolRegistry, lastObservation: ExecutionStep): Promise<ExecutionStep> {
  return guard.withTimeout(async () => {
    const startTime = Date.now();
    try {
      const recentSteps = context.steps.slice(-5);
      const stepSummary = recentSteps.map(s => {
        switch (s.type) {
          case 'thought': return `Pensee: ${limitString(s.content, 200)}`;
          case 'action': return `Action: ${s.toolName}(${JSON.stringify(s.toolInput || {})})`;
          case 'observation': return `Observation: ${limitString(s.content, 200)}`;
          case 'error': return `Erreur: ${limitString(s.content, 200)}`;
          default: return limitString(s.content, 200);
        }
      }).join('\n');
      const reflectPrompt = `Evalue la progression. Objectif: ${limitString(context.task, 500)}. Derniere observation: ${limitString(lastObservation.content, 500)}. Etapes: ${stepSummary}. Reponds en JSON: { "progressScore": 0-1, "qualityScore": 0-1, "reflection": "analyse", "recommendation": "continuer|retry|stop|respond" }`;
      const result = await chatCompletion([{ role: 'system', content: reflectPrompt }, { role: 'user', content: 'Evalue.' }], 'reasoning');
      let parsed: { progressScore: number; qualityScore: number; reflection: string; recommendation: string; needsRetry?: boolean };
      try {
        const content = result.content.trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        parsed = JSON.parse(content);
      } catch { parsed = { progressScore: 0.5, qualityScore: 0.5, reflection: 'Evaluation', recommendation: 'continuer' }; }
      const reflectionStep: ExecutionStep = { id: generateStepId(), type: 'reflection', content: limitString(parsed.reflection, 2000), timestamp: new Date().toISOString(), duration: Date.now() - startTime, reflectionScore: parsed.progressScore, confidence: 0.5, needsRetry: parsed.needsRetry || false };
      context.steps.push(reflectionStep);
      if (parsed.recommendation === 'stop' || parsed.recommendation === 'respond') {
        context.status = 'completed';
        const resultStep: ExecutionStep = { id: generateStepId(), type: 'result', content: limitString(lastObservation.content, 10000), timestamp: new Date().toISOString(), duration: Date.now() - startTime, confidence: parsed.progressScore };
        context.steps.push(resultStep);
        return resultStep;
      }
      return reflectionStep;
    } catch (error) {
      const errorStep: ExecutionStep = { id: generateStepId(), type: 'error', content: `Erreur: ${error instanceof Error ? error.message : 'Inconnue'}`, timestamp: new Date().toISOString(), duration: Date.now() - startTime };
      context.steps.push(errorStep);
      return errorStep;
    }
  }, 15000);
}

function buildThinkPrompt(context: ExecutionContext, toolRegistry: ToolRegistry): string {
  const availableTools = context.tools.map(name => toolRegistry.get(name)).filter(Boolean);
  const toolDescriptions = availableTools.length > 0 ? availableTools.map(t => `- ${t!.name}: ${limitString(t!.description, 100)}`).join('\n') : 'Aucun';
  const stepHistory = context.steps.slice(-12).map(step => {
    switch (step.type) {
      case 'thought': return `Pensee: ${limitString(step.content, 200)}`;
      case 'action': return `Action: ${step.toolName}`;
      case 'observation': return `Observation: ${limitString(step.content, 200)}`;
      case 'reflection': return `Reflexion: ${limitString(step.content, 200)}`;
      case 'error': return `Erreur: ${limitString(step.content, 200)}`;
      case 'result': return `Resultat: ${limitString(step.content, 200)}`;
      default: return limitString(step.content, 200);
    }
  }).join('\n');
  return `Tu es ${context.agentName}. Mission: ${limitString(context.task, 1000)}. Outils: ${toolDescriptions || 'aucun'}. Historique: ${stepHistory || 'aucun'}. Max ${context.maxSteps} etapes. Reponds en JSON: { "thought": "...", "action": "outil|respond", "actionInput": {}, "isFinal": false, "confidence": 0-1 }`;
}

export async function executeAgentLoop(context: ExecutionContext, toolRegistry: ToolRegistry, onStep?: (step: ExecutionStep) => void): Promise<ExecutionStep[]> {
  stepCounter = 0;
  context.maxSteps = Math.min(context.maxSteps || 10, 25); // Hard limit
  context.maxRetries = Math.min(context.maxRetries || 3, 5); // Hard limit
  context.startedAt = context.startedAt || new Date().toISOString();
  context.lastUpdatedAt = new Date().toISOString();
  context.totalTokensUsed = context.totalTokensUsed || 0;
  context.totalCost = context.totalCost || 0;
  if (!context.agentConfig || Object.keys(context.agentConfig).length === 0) {
    const agent = await db.agent.findUnique({ where: { id: context.agentId } });
    if (agent) { context.agentName = agent.name; context.agentType = agent.type; try { context.agentConfig = JSON.parse(agent.config); } catch { context.agentConfig = {}; } }
  }
  const longTermMemory = new LongTermMemory();
  context.memory.longTermContext = await longTermMemory.getContextForQuery(context.task, context.userId);
  if (context.conversationId) {
    const shortTermMemory = new ShortTermMemory();
    context.memory.shortTerm = await shortTermMemory.getContext(context.conversationId, 10);
  }
  if (!context.plan) context.plan = await createExecutionPlan(context);
  let currentStep = 0;
  context.status = 'running';
  const tracer = new Tracer();
  const traceId = tracer.startTrace(context.agentId, context.task);
  const startTime = Date.now();
  // ============================================================
  // Checkpoint : tenter de reprendre une exécution interrompue
  // ============================================================
  if (context.executionId) {
    const existingCheckpoint = await checkpointManager.load(context.executionId);
    if (existingCheckpoint && existingCheckpoint.status === 'failed' && existingCheckpoint.retryCount < 2) {
      // Reprendre depuis le dernier checkpoint
      context.steps = existingCheckpoint.steps as ExecutionStep[];
      currentStep = existingCheckpoint.currentStepIndex;
      context.totalTokensUsed = existingCheckpoint.totalTokensUsed;
      context.totalCost = existingCheckpoint.totalCost;
      context.status = 'running';
    }
  }

  while (currentStep < context.maxSteps && context.status === 'running') {
    if (Date.now() - startTime > 120000) {
      // Timeout — sauvegarder le checkpoint avant de quitter
      if (context.executionId) {
        await checkpointManager.save({
          agentId: context.agentId,
          userId: context.userId,
          executionId: context.executionId,
          task: context.task,
          steps: context.steps,
          currentStepIndex: currentStep,
          plan: context.plan,
          status: 'failed',
          totalTokensUsed: context.totalTokensUsed,
          totalCost: context.totalCost,
          startedAt: context.startedAt,
          lastCheckpointAt: new Date().toISOString(),
          conversationId: context.conversationId,
          toolsUsed: context.tools,
          error: 'Global timeout exceeded (120s)',
          retryCount: 0,
        }, true);
      }
      context.status = 'failed';
      break;
    }
    currentStep++;
    try {
      const step = await thinkStep(context, toolRegistry);
      tracer.addStep(traceId, { type: step.type, content: limitString(step.content, 200), duration: step.duration || 0, tokensUsed: Math.ceil(step.content.length / 4), model: 'auto-routed', provider: 'groq/openrouter', toolName: step.toolName, toolDuration: step.duration });
      if (onStep) onStep(step);

      // ============================================================
      // Checkpoint : sauvegarder la progression après chaque étape
      // ============================================================
      if (context.executionId && currentStep % 2 === 0) {
        await checkpointManager.save({
          agentId: context.agentId,
          userId: context.userId,
          executionId: context.executionId,
          task: context.task,
          steps: context.steps,
          currentStepIndex: currentStep,
          plan: context.plan,
          status: context.status,
          totalTokensUsed: context.totalTokensUsed,
          totalCost: context.totalCost,
          startedAt: context.startedAt,
          lastCheckpointAt: new Date().toISOString(),
          conversationId: context.conversationId,
          toolsUsed: context.tools,
          retryCount: 0,
        });
      }

      if (['completed', 'awaiting_approval', 'paused', 'failed'].includes(context.status)) break;
      if (step.type === 'result') { context.status = 'completed'; break; }
      const recentErrors = context.steps.slice(-3).filter(s => s.type === 'error').length;
      if (recentErrors >= 3) {
        // Sauvegarder le checkpoint avant de déclarer échec
        if (context.executionId) {
          await checkpointManager.save({
            agentId: context.agentId,
            userId: context.userId,
            executionId: context.executionId,
            task: context.task,
            steps: context.steps,
            currentStepIndex: currentStep,
            plan: context.plan,
            status: 'failed',
            totalTokensUsed: context.totalTokensUsed,
            totalCost: context.totalCost,
            startedAt: context.startedAt,
            lastCheckpointAt: new Date().toISOString(),
            conversationId: context.conversationId,
            toolsUsed: context.tools,
            error: 'Too many consecutive errors (3+)',
            retryCount: 0,
          }, true);
        }
        context.status = 'failed';
        break;
      }
    } catch (error) {
      const errorStep: ExecutionStep = { id: generateStepId(), type: 'error', content: `Erreur: ${error instanceof Error ? error.message : 'Inconnue'}`, timestamp: new Date().toISOString() };
      context.steps.push(errorStep);
      if (onStep) onStep(errorStep);

      // Sauvegarder le checkpoint en cas d'exception
      if (context.executionId) {
        await checkpointManager.save({
          agentId: context.agentId,
          userId: context.userId,
          executionId: context.executionId,
          task: context.task,
          steps: context.steps,
          currentStepIndex: currentStep,
          plan: context.plan,
          status: 'failed',
          totalTokensUsed: context.totalTokensUsed,
          totalCost: context.totalCost,
          startedAt: context.startedAt,
          lastCheckpointAt: new Date().toISOString(),
          conversationId: context.conversationId,
          toolsUsed: context.tools,
          error: error instanceof Error ? error.message : 'Unknown error',
          retryCount: 0,
        }, true);
      }

      context.status = 'failed';
      break;
    }
  }

  // Nettoyer le checkpoint si l'exécution a réussi
  if (context.status === 'completed' && context.executionId) {
    await checkpointManager.delete(context.executionId);
  }
  if (currentStep >= context.maxSteps && context.status === 'running') {
    context.status = 'completed';
    const finalStep: ExecutionStep = { id: generateStepId(), type: 'result', content: 'Limite d\'etapes atteinte. Resultats partiels.', timestamp: new Date().toISOString() };
    context.steps.push(finalStep);
    if (onStep) onStep(finalStep);
  }
  tracer.endTrace(traceId, context.status === 'completed' ? 'completed' : 'failed');
  await saveExecution(context);
  return context.steps;
}

async function createExecutionPlan(context: ExecutionContext): Promise<ExecutionPlan> {
  try {
    const result = await chatCompletion([
      { role: 'system', content: `Cree un plan simple pour: ${limitString(context.task, 500)}. Outils: ${context.tools.join(',') || 'aucun'}. JSON: { "steps": [{ "description": "...", "toolHint": "..." }] }` },
      { role: 'user', content: 'Cree le plan.' },
    ], 'orchestration');
    let parsed: { steps: Array<{ description: string; toolHint?: string; dependsOn?: string[] }> };
    try {
      const content = result.content.trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(content);
    } catch { parsed = { steps: [{ description: 'Analyser la demande' }, { description: 'Executer' }, { description: 'Presenter les resultats' }] }; }
    return { steps: parsed.steps.slice(0, 5).map((step, i) => ({ id: `plan_step_${i}`, description: step.description, status: 'pending' as const, dependsOn: step.dependsOn, toolHint: step.toolHint })), currentStepIndex: 0, adaptiveHistory: [] };
  } catch { return { steps: [{ id: 'plan_step_0', description: 'Executer la tache', status: 'pending' }], currentStepIndex: 0, adaptiveHistory: [] }; }
}

async function saveExecution(context: ExecutionContext): Promise<void> {
  try {
    const totalDuration = context.steps.reduce((sum, s) => sum + (s.duration || 0), 0);
    await db.agentExecution.create({ data: { agentId: context.agentId, task: limitString(context.task, 500), steps: JSON.stringify(context.steps).slice(0, 50000), status: context.status, totalDuration, totalTokens: context.totalTokensUsed || context.steps.length * 500, estimatedCost: context.totalCost || context.steps.length * 0.001, model: 'auto-routed', provider: 'groq/openrouter', userId: context.userId } });
  } catch {}
}
