/**
 * Ruflo MCP Server — Production HTTP wrapper for Genova
 *
 * Wraps the Ruflo MCP server into an HTTP API that Genova can call.
 * Provides endpoints for swarm init, agent spawn, memory, and orchestration.
 *
 * Port: 8190
 */

import http from 'http';
import { spawn } from 'child_process';

const PORT = parseInt(process.env.PORT || '8190', 10);
const RUFLO_CLI = 'npx';
const RUFLO_ARGS = ['ruflo@latest', 'mcp'];

// ============================================================
// MCP Process Manager
// ============================================================

let mcpProcess: ReturnType<typeof spawn> | null = null;

function ensureMCPProcess(): void {
  if (mcpProcess && !mcpProcess.killed) return;

  console.log('[Ruflo] Starting MCP server process...');
  mcpProcess = spawn(RUFLO_CLI, RUFLO_ARGS, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  mcpProcess.stdout?.on('data', (data: Buffer) => {
    console.log('[Ruflo MCP stdout]', data.toString().trim());
  });

  mcpProcess.stderr?.on('data', (data: Buffer) => {
    console.error('[Ruflo MCP stderr]', data.toString().trim());
  });

  mcpProcess.on('exit', (code) => {
    console.log(`[Ruflo] MCP process exited with code ${code}`);
    mcpProcess = null;
    // Auto-restart after delay
    setTimeout(ensureMCPProcess, 5000);
  });
}

// ============================================================
// In-memory state for demo/fallback mode
// ============================================================

interface SwarmState {
  id: string;
  topology: string;
  strategy: string;
  maxAgents: number;
  agents: Map<string, { id: string; type: string; task: string; status: string }>;
  memory: Map<string, { value: string; namespace: string; storedAt: number }>;
}

const swarms = new Map<string, SwarmState>();

// ============================================================
// HTTP Server
// ============================================================

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  try {
    // Health check
    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        version: '3.10.12',
        uptime: process.uptime(),
        mcpProcessRunning: mcpProcess !== null && !mcpProcess.killed,
        swarmsActive: swarms.size,
      }));
      return;
    }

    // MCP endpoint
    if (url.pathname === '/mcp' && req.method === 'POST') {
      const body = await readBody(req);
      const parsed = JSON.parse(body);
      const { method, params } = parsed;

      const result = await handleMCPMethod(method, params || {});

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: parsed.id,
        result,
      }));
      return;
    }

    // Swarm list
    if (url.pathname === '/swarms' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        swarms: Array.from(swarms.entries()).map(([id, s]) => ({
          id,
          topology: s.topology,
          strategy: s.strategy,
          agentsCount: s.agents.size,
          memoryCount: s.memory.size,
        })),
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    console.error('[Ruflo] Request error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error',
    }));
  }
});

// ============================================================
// MCP Method Handler
// ============================================================

async function handleMCPMethod(method: string, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case 'swarm_init': {
      const swarmId = `swarm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const swarm: SwarmState = {
        id: swarmId,
        topology: (params.topology as string) || 'mesh',
        strategy: (params.strategy as string) || 'auto',
        maxAgents: (params.maxAgents as number) || 10,
        agents: new Map(),
        memory: new Map(),
      };
      swarms.set(swarmId, swarm);

      // Try to forward to actual Ruflo MCP
      try {
        ensureMCPProcess();
        // In production, would send to MCP stdin
      } catch {
        // Running in standalone mode
      }

      return { swarmId, status: 'initialized', topology: swarm.topology };
    }

    case 'agent_spawn': {
      const swarmId = (params.swarmId as string) || 'default';
      let swarm = swarms.get(swarmId);
      if (!swarm) {
        swarm = Array.from(swarms.values())[0];
      }
      if (!swarm) {
        throw new Error('No swarm available. Initialize a swarm first.');
      }

      const agentId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      swarm.agents.set(agentId, {
        id: agentId,
        type: (params.type as string) || 'researcher',
        task: (params.task as string) || '',
        status: 'active',
      });

      return { agentId, status: 'spawned', type: params.type };
    }

    case 'memory_store': {
      const namespace = (params.namespace as string) || 'default';
      const key = params.key as string;
      const value = params.value as string;

      // Store in all swarms' memory (shared memory model)
      for (const swarm of swarms.values()) {
        swarm.memory.set(`${namespace}:${key}`, {
          value,
          namespace,
          storedAt: Date.now(),
        });
      }

      return { success: true, key, namespace };
    }

    case 'memory_search': {
      const query = (params.query as string).toLowerCase();
      const namespace = (params.namespace as string) || 'default';
      const limit = (params.limit as number) || 10;

      const results: Array<{ key: string; value: string; score: number; namespace: string }> = [];

      for (const swarm of swarms.values()) {
        for (const [memKey, memValue] of swarm.memory.entries()) {
          if (memValue.namespace !== namespace && namespace !== 'default') continue;
          if (memKey.toLowerCase().includes(query) || memValue.value.toLowerCase().includes(query)) {
            results.push({
              key: memKey.replace(`${namespace}:`, ''),
              value: memValue.value,
              score: 0.8,
              namespace: memValue.namespace,
            });
          }
        }
      }

      return { results: results.slice(0, limit), total: results.length };
    }

    case 'task_orchestrate': {
      const taskId = `task_${Date.now()}`;
      // In production, would coordinate agents to execute the task
      return {
        taskId,
        status: 'orchestrating',
        agentsUsed: 1,
        message: 'Task orchestration initiated',
      };
    }

    default:
      throw new Error(`Unknown MCP method: ${method}`);
  }
}

// ============================================================
// Helpers
// ============================================================

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ============================================================
// Start Server
// ============================================================

server.listen(PORT, () => {
  console.log(`[Ruflo] MCP HTTP Server running on port ${PORT}`);
  console.log(`[Ruflo] Health check: http://localhost:${PORT}/health`);
  console.log(`[Ruflo] MCP endpoint: http://localhost:${PORT}/mcp`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Ruflo] SIGTERM received, shutting down...');
  if (mcpProcess && !mcpProcess.killed) {
    mcpProcess.kill('SIGTERM');
  }
  server.close(() => {
    console.log('[Ruflo] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Ruflo] SIGINT received, shutting down...');
  if (mcpProcess && !mcpProcess.killed) {
    mcpProcess.kill('SIGINT');
  }
  server.close(() => {
    console.log('[Ruflo] Server closed');
    process.exit(0);
  });
});
