// Agent Manager — Coordinates multiple agents working together

import { executeAgentLoop, type ExecutionContext, type ExecutionStep } from './execution-loop';
import { decomposeTask, type MultiAgentPlan } from './planner';
import { ToolRegistry } from '@/lib/tools/registry';
import { db } from '@/lib/db';

export class AgentManager {
  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  /**
   * Create a multi-agent execution plan
   */
  async createPlan(
    objective: string,
    agentIds: string[],
    userId: string
  ): Promise<MultiAgentPlan> {
    return decomposeTask(objective, agentIds, userId);
  }

  /**
   * Execute a multi-agent plan with dependency management
   */
  async executePlan(
    plan: MultiAgentPlan,
    userId: string,
    onStep?: (agentId: string, step: ExecutionStep) => void
  ): Promise<MultiAgentPlan> {
    plan.status = 'executing';
    const completedTasks = new Set<string>();
    const taskResults: Record<string, string> = {};
    const maxIterations = plan.agents.length * 2;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      // Find tasks that can be started (all dependencies met)
      const readyTasks = plan.agents.filter((_, index) => {
        const taskId = `task_${index}`;
        if (completedTasks.has(taskId)) return false;
        return _.dependencies.every(dep => completedTasks.has(dep));
      });

      if (readyTasks.length === 0) {
        // Either all done or stuck
        const allDone = plan.agents.every((_, index) =>
          completedTasks.has(`task_${index}`)
        );
        if (allDone) {
          plan.status = 'completed';
        } else {
          plan.status = 'failed';
        }
        break;
      }

      // Execute ready tasks (sequentially to avoid overwhelming the API)
      for (let i = 0; i < plan.agents.length; i++) {
        const agentTask = plan.agents[i];
        const taskId = `task_${i}`;

        if (completedTasks.has(taskId)) continue;
        if (!agentTask.dependencies.every(dep => completedTasks.has(dep))) continue;

        // Build context from completed tasks
        const depContext = agentTask.dependencies
          .map(dep => taskResults[dep])
          .filter(Boolean)
          .join('\n');

        const fullTask = depContext
          ? `${agentTask.task}\n\nContexte des tâches précédentes:\n${depContext}`
          : agentTask.task;

        try {
          const steps = await this.delegateTask(
            agentTask.agentId,
            fullTask,
            `Tu es assigné au rôle: ${agentTask.role}`,
            userId,
            onStep ? (step) => onStep(agentTask.agentId, step) : undefined
          );

          const resultStep = steps.find(s => s.type === 'result');
          const obsSteps = steps.filter(s => s.type === 'observation');
          const result = resultStep?.content || obsSteps.map(s => s.content).join('\n') || 'Tâche terminée';

          completedTasks.add(taskId);
          taskResults[taskId] = result;
          plan.results[taskId] = { agentId: agentTask.agentId, result, success: true };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
          // Don't add failed tasks to completedTasks — dependent tasks should not execute
          taskResults[taskId] = `Erreur: ${errorMsg}`;
          plan.results[taskId] = { agentId: agentTask.agentId, error: errorMsg, success: false };
        }
      }
    }

    if (plan.status === 'executing') {
      plan.status = 'completed';
    }

    return plan;
  }

  /**
   * Delegate a task to a specific agent
   */
  async delegateTask(
    agentId: string,
    task: string,
    context: string,
    userId: string,
    onStep?: (step: ExecutionStep) => void
  ): Promise<ExecutionStep[]> {
    // Get agent from database
    const agent = await db.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      throw new Error(`Agent non trouvé: ${agentId}`);
    }

    let agentConfig: Record<string, unknown> = {};
    try {
      agentConfig = JSON.parse(agent.config);
    } catch {
      agentConfig = {};
    }

    // Determine available tools based on agent type
    const allTools = this.toolRegistry.getToolNames();
    const toolMapping: Record<string, string[]> = {
      sales: ['web_search', 'database_query', 'calculator'],
      support: ['database_query', 'web_search'],
      marketing: ['web_search', 'calculator', 'database_query'],
      research: ['web_search', 'database_query', 'filesystem'],
      rh: ['database_query', 'calculator'],
      accounting: ['calculator', 'database_query'],
      custom: allTools,
    };

    const agentTools = toolMapping[agent.type] || allTools;

    // Create execution context
    const executionContext: ExecutionContext = {
      agentId: agent.id,
      agentName: agent.name,
      agentType: agent.type,
      agentConfig: { ...agentConfig, context },
      task,
      userId,
      maxSteps: 8,
      maxRetries: 3,
      steps: [],
      status: 'running',
      memory: {
        shortTerm: [],
        longTermContext: '',
      },
      tools: agentTools,
      guardrailsActive: true,
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      totalTokensUsed: 0,
      totalCost: 0,
    };

    return executeAgentLoop(executionContext, this.toolRegistry, onStep);
  }
}
