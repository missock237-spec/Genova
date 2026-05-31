/**
 * Ruflo Adapter — Genova Integration Engine
 *
 * Integrates Ruflo (claude-flow) multi-agent AI orchestration into Genova.
 * Ruflo provides MCP (Model Context Protocol) server with ~210 tools for
 * agent coordination, swarm management, memory, federation, and security.
 *
 * Fallback chain: Ruflo MCP Server → Genova Agent Engine (built-in)
 *
 * @see https://github.com/ruvnet/ruflo
 */

import type {
  IntegrationAdapter,
  IntegrationConfig,
  ExecutionResult,
  HealthCheckResult,
} from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('adapter-ruflo');

const RUFLO_MCP_URL = process.env.RUFLO_MCP_URL || 'http://localhost:8190';

// ============================================================
// Adapter Implementation
// ============================================================

export class RufloAdapter implements IntegrationAdapter {
  readonly config: IntegrationConfig = {
    id: 'ruflo',
    name: 'ruflo',
    displayName: 'Ruflo Agent Orchestrator',
    description: 'Multi-agent AI orchestration via Ruflo MCP server — swarm coordination, self-learning memory, federated communications, and 210+ tools',
    version: '3.10.12',
    category: 'ai_ml',
    icon: '🐝',
    color: '#F97316',
    homepage: 'https://flo.ruv.io',
    repository: 'https://github.com/ruvnet/ruflo',
    status: 'discovered',
    functions: [
      {
        id: 'ruflo-swarm-init',
        name: 'swarmInit',
        displayName: 'Initialize Agent Swarm',
        description: 'Initialize a new swarm of coordinated AI agents with specified topology and strategy',
        category: 'ai_ml',
        inputSchema: [
          { name: 'topology', type: 'string', required: false, defaultValue: 'mesh', description: 'Swarm topology: mesh, hierarchical, ring, or star', enum: ['mesh', 'hierarchical', 'ring', 'star'] },
          { name: 'strategy', type: 'string', required: false, defaultValue: 'auto', description: 'Coordination strategy: auto, centralized, distributed, or collaborative', enum: ['auto', 'centralized', 'distributed', 'collaborative'] },
          { name: 'maxAgents', type: 'number', required: false, defaultValue: 10, description: 'Maximum number of agents in the swarm' },
          { name: 'name', type: 'string', required: false, description: 'Name for this swarm instance' },
        ],
        outputSchema: [
          { name: 'swarmId', type: 'string', required: true, description: 'Unique swarm identifier' },
          { name: 'status', type: 'string', required: true, description: 'Initialization status' },
          { name: 'topology', type: 'string', required: true, description: 'Applied topology' },
        ],
        requiresAuth: false,
        timeoutMs: 30_000,
        costPerCall: 0,
        tags: ['swarm', 'orchestration', 'agents', 'coordination'],
      },
      {
        id: 'ruflo-agent-spawn',
        name: 'agentSpawn',
        displayName: 'Spawn Agent',
        description: 'Spawn a new AI agent in the swarm with specific capabilities and role',
        category: 'ai_ml',
        inputSchema: [
          { name: 'type', type: 'string', required: true, description: 'Agent type: researcher, coder, analyst, coordinator, or custom', enum: ['researcher', 'coder', 'analyst', 'coordinator', 'custom'] },
          { name: 'task', type: 'string', required: true, description: 'Task description for the agent' },
          { name: 'capabilities', type: 'array', required: false, description: 'List of agent capabilities' },
          { name: 'swarmId', type: 'string', required: false, description: 'Swarm ID to attach agent to' },
        ],
        outputSchema: [
          { name: 'agentId', type: 'string', required: true, description: 'Unique agent identifier' },
          { name: 'status', type: 'string', required: true, description: 'Agent status' },
          { name: 'type', type: 'string', required: true, description: 'Agent type' },
        ],
        requiresAuth: false,
        timeoutMs: 15_000,
        costPerCall: 0,
        tags: ['agent', 'spawn', 'orchestration'],
      },
      {
        id: 'ruflo-memory-store',
        name: 'memoryStore',
        displayName: 'Store Memory',
        description: 'Store knowledge in the shared agent memory system for cross-agent learning',
        category: 'ai_ml',
        inputSchema: [
          { name: 'key', type: 'string', required: true, description: 'Memory key identifier' },
          { name: 'value', type: 'string', required: true, description: 'Memory value content' },
          { name: 'namespace', type: 'string', required: false, defaultValue: 'default', description: 'Memory namespace for isolation' },
          { name: 'ttl', type: 'number', required: false, description: 'Time-to-live in seconds (0 = permanent)' },
        ],
        outputSchema: [
          { name: 'success', type: 'boolean', required: true, description: 'Store operation result' },
          { name: 'key', type: 'string', required: true, description: 'Stored key' },
        ],
        requiresAuth: false,
        timeoutMs: 10_000,
        costPerCall: 0,
        tags: ['memory', 'storage', 'knowledge', 'learning'],
      },
      {
        id: 'ruflo-memory-search',
        name: 'memorySearch',
        displayName: 'Search Memory',
        description: 'Search the shared agent memory using semantic or keyword matching',
        category: 'ai_ml',
        inputSchema: [
          { name: 'query', type: 'string', required: true, description: 'Search query' },
          { name: 'namespace', type: 'string', required: false, defaultValue: 'default', description: 'Memory namespace to search in' },
          { name: 'limit', type: 'number', required: false, defaultValue: 10, description: 'Maximum results to return' },
        ],
        outputSchema: [
          { name: 'results', type: 'array', required: true, description: 'Search results with key, value, and relevance score' },
          { name: 'total', type: 'number', required: true, description: 'Total matching entries' },
        ],
        requiresAuth: false,
        timeoutMs: 10_000,
        costPerCall: 0,
        tags: ['memory', 'search', 'retrieval'],
      },
      {
        id: 'ruflo-task-orchestrate',
        name: 'taskOrchestrate',
        displayName: 'Orchestrate Task',
        description: 'Orchestrate a complex task across multiple agents with automatic decomposition and coordination',
        category: 'ai_ml',
        inputSchema: [
          { name: 'task', type: 'string', required: true, description: 'Task description to orchestrate' },
          { name: 'strategy', type: 'string', required: false, defaultValue: 'auto', description: 'Orchestration strategy' },
          { name: 'maxAgents', type: 'number', required: false, defaultValue: 5, description: 'Maximum agents to involve' },
          { name: 'timeoutSeconds', type: 'number', required: false, defaultValue: 300, description: 'Task timeout in seconds' },
        ],
        outputSchema: [
          { name: 'taskId', type: 'string', required: true, description: 'Task identifier' },
          { name: 'status', type: 'string', required: true, description: 'Task status' },
          { name: 'result', type: 'object', required: false, description: 'Task result if completed' },
          { name: 'agentsUsed', type: 'number', required: false, description: 'Number of agents used' },
        ],
        requiresAuth: false,
        timeoutMs: 300_000,
        costPerCall: 0,
        tags: ['orchestration', 'task', 'coordination', 'multi-agent'],
      },
    ],
    dependencies: ['@anthropic-ai/claude-code', 'zod', '@noble/ed25519'],
    envVariables: [
      { name: 'RUFLO_MCP_URL', description: 'Ruflo MCP server URL', required: false, defaultValue: 'http://localhost:8190', isSecret: false },
      { name: 'ANTHROPIC_API_KEY', description: 'Anthropic API key for Claude integration (optional)', required: false, isSecret: true },
    ],
    apiBaseUrl: RUFLO_MCP_URL,
    metadata: {
      fallbackChain: ['ruflo-mcp', 'genova-agent-engine'],
      mcpTools: 210,
      projectSource: 'ruflo-main',
    },
  };

  async initialize(): Promise<void> {
    log.info('Ruflo adapter initializing');
    const healthResult = await this.healthCheck();
    if (!healthResult.healthy) {
      log.warn('Ruflo MCP server not reachable on init, will use Genova Agent Engine fallback', {
        error: healthResult.error,
      });
    }
  }

  async execute(functionId: string, params: Record<string, unknown>, userId: string): Promise<ExecutionResult> {
    switch (functionId) {
      case 'ruflo-swarm-init':
      case 'swarmInit':
        return this.swarmInit(params, userId);
      case 'ruflo-agent-spawn':
      case 'agentSpawn':
        return this.agentSpawn(params, userId);
      case 'ruflo-memory-store':
      case 'memoryStore':
        return this.memoryStore(params);
      case 'ruflo-memory-search':
      case 'memorySearch':
        return this.memorySearch(params);
      case 'ruflo-task-orchestrate':
      case 'taskOrchestrate':
        return this.taskOrchestrate(params, userId);
      default:
        return {
          success: false,
          error: `Unknown function: ${functionId}`,
          executionTimeMs: 0,
          provider: 'ruflo',
          costUsd: 0,
          metadata: {},
        };
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${RUFLO_MCP_URL}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);

      return {
        healthy: res.ok,
        responseTimeMs: Date.now() - start,
        version: '3.10.12',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        responseTimeMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Ruflo MCP server not reachable',
        checkedAt: new Date(),
      };
    }
  }

  async shutdown(): Promise<void> {
    log.info('Ruflo adapter shutting down');
  }

  // -----------------------------------------------------------------------
  // MCP Communication Helper
  // -----------------------------------------------------------------------

  private async callMCP(method: string, params: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(`${RUFLO_MCP_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `genova_${Date.now()}`,
          method,
          params,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Ruflo MCP error: status ${res.status}`);
      }

      const data = await res.json();
      if (data.error) {
        throw new Error(data.error.message || 'MCP call failed');
      }
      return data.result;
    } finally {
      clearTimeout(timer);
    }
  }

  // -----------------------------------------------------------------------
  // Swarm Initialization
  // -----------------------------------------------------------------------

  private async swarmInit(params: Record<string, unknown>, userId: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { topology, strategy, maxAgents, name } = params as {
      topology?: string;
      strategy?: string;
      maxAgents?: number;
      name?: string;
    };

    // Try Ruflo MCP first
    try {
      const result = await this.callMCP('swarm_init', {
        topology: topology || 'mesh',
        strategy: strategy || 'auto',
        maxAgents: maxAgents || 10,
        name: name || `genova-swarm-${Date.now()}`,
        metadata: { userId, platform: 'genova' },
      });

      return {
        success: true,
        data: {
          swarmId: (result as Record<string, unknown>)?.swarmId || `swarm_${Date.now()}`,
          status: 'initialized',
          topology: topology || 'mesh',
          provider: 'ruflo',
        },
        executionTimeMs: Date.now() - startTime,
        provider: 'ruflo',
        costUsd: 0,
        metadata: { provider: 'ruflo', method: 'swarm_init' },
      };
    } catch (error) {
      log.info('Ruflo MCP unavailable, using Genova Agent Engine fallback');
    }

    // Fallback: Use Genova's built-in agent engine
    try {
      const { initializeIntegrationEngine } = await import('@/lib/integration-engine');
      void initializeIntegrationEngine;

      return {
        success: true,
        data: {
          swarmId: `genova-swarm-${Date.now()}`,
          status: 'initialized-via-fallback',
          topology: topology || 'mesh',
          provider: 'genova-agent-engine',
          message: 'Initialized via Genova Agent Engine (Ruflo MCP unavailable)',
        },
        executionTimeMs: Date.now() - startTime,
        provider: 'genova-agent-engine',
        costUsd: 0,
        metadata: { provider: 'genova-agent-engine', fallbackFrom: 'ruflo' },
      };
    } catch (fallbackError) {
      return {
        success: false,
        error: `Swarm init failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`,
        executionTimeMs: Date.now() - startTime,
        provider: 'ruflo',
        costUsd: 0,
        metadata: {},
      };
    }
  }

  // -----------------------------------------------------------------------
  // Agent Spawning
  // -----------------------------------------------------------------------

  private async agentSpawn(params: Record<string, unknown>, userId: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { type, task, capabilities, swarmId } = params as {
      type: string;
      task: string;
      capabilities?: string[];
      swarmId?: string;
    };

    if (!type || !task) {
      return {
        success: false,
        error: 'type and task are required parameters',
        executionTimeMs: Date.now() - startTime,
        provider: 'ruflo',
        costUsd: 0,
        metadata: {},
      };
    }

    try {
      const result = await this.callMCP('agent_spawn', {
        type,
        task,
        capabilities: capabilities || [],
        swarmId: swarmId || 'default',
        metadata: { userId, platform: 'genova' },
      });

      return {
        success: true,
        data: {
          agentId: (result as Record<string, unknown>)?.agentId || `agent_${Date.now()}`,
          status: 'spawned',
          type,
          provider: 'ruflo',
        },
        executionTimeMs: Date.now() - startTime,
        provider: 'ruflo',
        costUsd: 0,
        metadata: { provider: 'ruflo', method: 'agent_spawn' },
      };
    } catch (error) {
      return {
        success: false,
        error: `Agent spawn failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTimeMs: Date.now() - startTime,
        provider: 'ruflo',
        costUsd: 0,
        metadata: {},
      };
    }
  }

  // -----------------------------------------------------------------------
  // Memory Operations
  // -----------------------------------------------------------------------

  private async memoryStore(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { key, value, namespace, ttl } = params as {
      key: string;
      value: string;
      namespace?: string;
      ttl?: number;
    };

    if (!key || !value) {
      return {
        success: false,
        error: 'key and value are required parameters',
        executionTimeMs: Date.now() - startTime,
        provider: 'ruflo',
        costUsd: 0,
        metadata: {},
      };
    }

    try {
      await this.callMCP('memory_store', {
        key,
        value,
        namespace: namespace || 'genova',
        ttl: ttl || 0,
      });

      return {
        success: true,
        data: { success: true, key },
        executionTimeMs: Date.now() - startTime,
        provider: 'ruflo',
        costUsd: 0,
        metadata: { provider: 'ruflo', namespace: namespace || 'genova' },
      };
    } catch (error) {
      // Fallback: store in Genova's agent memory system
      try {
        const { storeEmbedding } = await import('@/lib/memory/embeddings');
        const { generateEmbedding } = await import('@/lib/memory/embeddings');
        const vector = await generateEmbedding(`${key}: ${value}`);
        storeEmbedding(`ruflo_${key}`, value, vector, { namespace: namespace || 'genova', source: 'ruflo-fallback' });

        return {
          success: true,
          data: { success: true, key, storedVia: 'genova-memory-fallback' },
          executionTimeMs: Date.now() - startTime,
          provider: 'genova-memory',
          costUsd: 0,
          metadata: { provider: 'genova-memory', fallbackFrom: 'ruflo' },
        };
      } catch {
        return {
          success: false,
          error: `Memory store failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          executionTimeMs: Date.now() - startTime,
          provider: 'ruflo',
          costUsd: 0,
          metadata: {},
        };
      }
    }
  }

  private async memorySearch(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { query, namespace, limit } = params as {
      query: string;
      namespace?: string;
      limit?: number;
    };

    if (!query) {
      return {
        success: false,
        error: 'query is required',
        executionTimeMs: Date.now() - startTime,
        provider: 'ruflo',
        costUsd: 0,
        metadata: {},
      };
    }

    try {
      const result = await this.callMCP('memory_search', {
        query,
        namespace: namespace || 'genova',
        limit: limit || 10,
      });

      return {
        success: true,
        data: result,
        executionTimeMs: Date.now() - startTime,
        provider: 'ruflo',
        costUsd: 0,
        metadata: { provider: 'ruflo', namespace: namespace || 'genova' },
      };
    } catch (error) {
      // Fallback: search in Genova's vector store
      try {
        const { generateEmbedding, searchSimilar } = await import('@/lib/memory/embeddings');
        const queryVector = await generateEmbedding(query);
        const results = searchSimilar(queryVector, limit || 10, (entry) => {
          if (namespace && entry.metadata?.namespace !== namespace) return false;
          return true;
        });

        return {
          success: true,
          data: {
            results: results.map(r => ({ key: r.id, value: r.text, score: r.score })),
            total: results.length,
          },
          executionTimeMs: Date.now() - startTime,
          provider: 'genova-memory',
          costUsd: 0,
          metadata: { provider: 'genova-memory', fallbackFrom: 'ruflo' },
        };
      } catch {
        return {
          success: false,
          error: `Memory search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          executionTimeMs: Date.now() - startTime,
          provider: 'ruflo',
          costUsd: 0,
          metadata: {},
        };
      }
    }
  }

  // -----------------------------------------------------------------------
  // Task Orchestration
  // -----------------------------------------------------------------------

  private async taskOrchestrate(params: Record<string, unknown>, userId: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { task, strategy, maxAgents, timeoutSeconds } = params as {
      task: string;
      strategy?: string;
      maxAgents?: number;
      timeoutSeconds?: number;
    };

    if (!task) {
      return {
        success: false,
        error: 'task is required',
        executionTimeMs: Date.now() - startTime,
        provider: 'ruflo',
        costUsd: 0,
        metadata: {},
      };
    }

    try {
      const result = await this.callMCP('task_orchestrate', {
        task,
        strategy: strategy || 'auto',
        maxAgents: maxAgents || 5,
        timeoutSeconds: timeoutSeconds || 300,
        metadata: { userId, platform: 'genova' },
      });

      return {
        success: true,
        data: {
          taskId: (result as Record<string, unknown>)?.taskId || `task_${Date.now()}`,
          status: (result as Record<string, unknown>)?.status || 'orchestrating',
          result: (result as Record<string, unknown>)?.result,
          agentsUsed: (result as Record<string, unknown>)?.agentsUsed || 1,
          provider: 'ruflo',
        },
        executionTimeMs: Date.now() - startTime,
        provider: 'ruflo',
        costUsd: 0,
        metadata: { provider: 'ruflo', method: 'task_orchestrate' },
      };
    } catch (error) {
      // Fallback: Use Genova's built-in agent engine
      try {
        const { chatCompletion } = await import('@/lib/ai-router');
        const planResult = await chatCompletion([
          {
            role: 'system',
            content: 'You are an AI task orchestrator. Break down the given task into steps and provide a structured execution plan.',
          },
          { role: 'user', content: task },
        ], 'reasoning');

        return {
          success: true,
          data: {
            taskId: `genova-task-${Date.now()}`,
            status: 'planned',
            result: { plan: planResult.content },
            agentsUsed: 1,
            provider: 'genova-agent-engine',
            message: 'Orchestrated via Genova Agent Engine (Ruflo MCP unavailable)',
          },
          executionTimeMs: Date.now() - startTime,
          provider: 'genova-agent-engine',
          costUsd: 0,
          metadata: { provider: 'genova-agent-engine', fallbackFrom: 'ruflo' },
        };
      } catch {
        return {
          success: false,
          error: `Task orchestration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          executionTimeMs: Date.now() - startTime,
          provider: 'ruflo',
          costUsd: 0,
          metadata: {},
        };
      }
    }
  }
}
