// Planner — Task decomposition and multi-agent planning

import { chatCompletion } from '@/lib/ai-router';
import { db } from '@/lib/db';

export interface AgentTask {
  id: string;
  agentId: string;
  objective: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  steps?: unknown[];
}

export interface MultiAgentPlan {
  id: string;
  objective: string;
  agents: Array<{
    agentId: string;
    role: string;
    task: string;
    dependencies: string[]; // IDs of tasks that must complete first
  }>;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  results: Record<string, unknown>;
  createdAt: string;
}

/**
 * Decompose a complex objective into actionable steps for multiple agents
 */
export async function decomposeTask(
  objective: string,
  agentIds: string[],
  userId: string
): Promise<MultiAgentPlan> {
  // Get available agents
  const agents = await db.agent.findMany({
    where: { id: { in: agentIds }, userId, status: 'active' },
  });

  if (agents.length === 0) {
    throw new Error('Aucun agent actif disponible pour cette tâche');
  }

  const agentDescriptions = agents.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
    description: a.description,
    config: a.config,
  }));

  // Use LLM to decompose the objective
  const result = await chatCompletion(
    [
      {
        role: 'system',
        content: `Tu es un planificateur multi-agents. Tu décomposes un objectif complexe en sous-tâches assignées aux agents IA disponibles.

Réponds UNIQUEMENT en JSON valide avec cette structure:
{
  "tasks": [
    {
      "agentId": "id_de_l_agent",
      "role": "Rôle de l'agent dans cette tâche",
      "task": "Description détaillée de la sous-tâche",
      "dependencies": []
    }
  ],
  "summary": "Résumé du plan"
}

Les dépendances sont les index (0-based) des tâches qui doivent être terminées avant celle-ci.
Parle en français.`,
      },
      {
        role: 'user',
        content: `Objectif: ${objective}\n\nAgents disponibles:\n${JSON.stringify(agentDescriptions, null, 2)}`,
      },
    ],
    'orchestration'
  );

  let planData: { tasks: Array<{ agentId: string; role: string; task: string; dependencies: number[] }>; summary: string };
  try {
    let content = result.content.trim();
    content = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    planData = JSON.parse(content);
  } catch {
    // Fallback: assign the whole task to the first agent
    planData = {
      tasks: [{
        agentId: agents[0].id,
        role: 'Exécuteur principal',
        task: objective,
        dependencies: [],
      }],
      summary: `Tâche assignée à ${agents[0].name}`,
    };
  }

  // Build the plan
  const taskIds = planData.tasks.map(() => `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);

  const plan: MultiAgentPlan = {
    id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    objective,
    agents: planData.tasks.map((task, index) => ({
      agentId: task.agentId,
      role: task.role,
      task: task.task,
      dependencies: task.dependencies.map(depIdx => taskIds[depIdx]).filter(Boolean),
    })),
    status: 'planning',
    results: {},
    createdAt: new Date().toISOString(),
  };

  // Map task IDs to agents
  plan.agents.forEach((agent, i) => {
    agent.dependencies = planData.tasks[i]?.dependencies?.map(depIdx => taskIds[depIdx]).filter(Boolean) || [];
  });

  return plan;
}

/**
 * Evaluate if a plan is still valid or needs adjustment
 */
export async function evaluatePlanProgress(
  plan: MultiAgentPlan,
  completedSteps: Array<{ agentId: string; result?: string }>
): Promise<{
  shouldContinue: boolean;
  adjustmentNeeded: boolean;
  newSteps?: Array<{ agentId: string; role: string; task: string; dependencies: string[] }>;
}> {
  if (plan.status === 'completed' || plan.status === 'failed') {
    return { shouldContinue: false, adjustmentNeeded: false };
  }

  const completedAgentIds = completedSteps
    .filter(s => s.result)
    .map(s => s.agentId);

  const allCompleted = plan.agents.every(a => completedAgentIds.includes(a.agentId));

  if (allCompleted) {
    return { shouldContinue: false, adjustmentNeeded: false };
  }

  // Check if any tasks have failed
  const failedTasks = completedSteps.filter(s => !s.result);
  if (failedTasks.length > 0) {
    return {
      shouldContinue: true,
      adjustmentNeeded: true,
      newSteps: failedTasks.map(f => ({
        agentId: f.agentId,
        role: 'Nouvelle tentative',
        task: 'Réessayer la tâche qui a échoué',
        dependencies: [],
      })),
    };
  }

  return { shouldContinue: true, adjustmentNeeded: false };
}
