/**
 * n8n Adapter — Genova Integration Engine
 *
 * Integrates n8n workflow automation into Genova.
 * Provides workflow creation, execution, and management.
 */

import type {
  IntegrationAdapter,
  IntegrationConfig,
  ExecutionResult,
  HealthCheckResult,
} from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('adapter-n8n');

const N8N_API_URL = process.env.N8N_API_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY || '';

export class N8nAdapter implements IntegrationAdapter {
  readonly config: IntegrationConfig = {
    id: 'n8n',
    name: 'n8n',
    displayName: 'n8n Workflows',
    description: 'Workflow automation engine — create, execute, and manage automated workflows',
    version: '1.0.0',
    category: 'automation',
    icon: '🔄',
    color: '#FF6D5A',
    homepage: 'https://n8n.io',
    repository: 'https://github.com/n8n-io/n8n',
    status: 'discovered',
    functions: [
      {
        id: 'n8n-list-workflows',
        name: 'listWorkflows',
        displayName: 'List Workflows',
        description: 'List all available n8n workflows',
        category: 'automation',
        inputSchema: [
          { name: 'active', type: 'boolean', required: false, description: 'Filter by active status' },
          { name: 'limit', type: 'number', required: false, defaultValue: 50, description: 'Max results' },
        ],
        outputSchema: [
          { name: 'workflows', type: 'array', required: true, description: 'List of workflows' },
          { name: 'total', type: 'number', required: true, description: 'Total count' },
        ],
        requiresAuth: true,
        authType: 'api_key',
        timeoutMs: 10_000,
        costPerCall: 0,
        tags: ['workflow', 'automation', 'list'],
      },
      {
        id: 'n8n-execute-workflow',
        name: 'executeWorkflow',
        displayName: 'Execute Workflow',
        description: 'Execute an n8n workflow by ID',
        category: 'automation',
        inputSchema: [
          { name: 'workflowId', type: 'string', required: true, description: 'Workflow ID' },
          { name: 'inputData', type: 'object', required: false, description: 'Input data for the workflow' },
          { name: 'waitForResult', type: 'boolean', required: false, defaultValue: true, description: 'Wait for completion' },
        ],
        outputSchema: [
          { name: 'executionId', type: 'string', required: true, description: 'Execution ID' },
          { name: 'status', type: 'string', required: true, description: 'Execution status' },
          { name: 'result', type: 'object', required: false, description: 'Execution result data' },
        ],
        requiresAuth: true,
        authType: 'api_key',
        timeoutMs: 60_000,
        costPerCall: 0,
        tags: ['workflow', 'automation', 'execute'],
      },
      {
        id: 'n8n-create-workflow',
        name: 'createWorkflow',
        displayName: 'Create Workflow',
        description: 'Create a new n8n workflow',
        category: 'automation',
        inputSchema: [
          { name: 'name', type: 'string', required: true, description: 'Workflow name' },
          { name: 'nodes', type: 'array', required: true, description: 'Workflow nodes configuration' },
          { name: 'connections', type: 'object', required: false, description: 'Node connections' },
          { name: 'active', type: 'boolean', required: false, defaultValue: false, description: 'Activate on creation' },
        ],
        outputSchema: [
          { name: 'workflowId', type: 'string', required: true, description: 'Created workflow ID' },
          { name: 'status', type: 'string', required: true, description: 'Creation status' },
        ],
        requiresAuth: true,
        authType: 'api_key',
        timeoutMs: 15_000,
        costPerCall: 0,
        tags: ['workflow', 'automation', 'create'],
      },
      {
        id: 'n8n-get-execution',
        name: 'getExecution',
        displayName: 'Get Execution Status',
        description: 'Get the status and result of a workflow execution',
        category: 'automation',
        inputSchema: [
          { name: 'executionId', type: 'string', required: true, description: 'Execution ID' },
        ],
        outputSchema: [
          { name: 'status', type: 'string', required: true, description: 'Execution status' },
          { name: 'result', type: 'object', required: false, description: 'Execution result' },
        ],
        requiresAuth: true,
        authType: 'api_key',
        timeoutMs: 10_000,
        costPerCall: 0,
        tags: ['workflow', 'automation', 'status'],
      },
    ],
    dependencies: ['n8n'],
    envVariables: [
      { name: 'N8N_API_URL', description: 'n8n instance URL', required: false, defaultValue: 'http://localhost:5678', isSecret: false },
      { name: 'N8N_API_KEY', description: 'n8n API key', required: false, isSecret: true },
    ],
    apiBaseUrl: N8N_API_URL,
    metadata: {},
  };

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (N8N_API_KEY) {
      headers['X-N8N-API-KEY'] = N8N_API_KEY;
    }
    return headers;
  }

  async initialize(): Promise<void> {
    log.info('n8n adapter initializing');
  }

  async execute(functionId: string, params: Record<string, unknown>, _userId: string): Promise<ExecutionResult> {
    switch (functionId) {
      case 'n8n-list-workflows':
      case 'listWorkflows':
        return this.listWorkflows(params);
      case 'n8n-execute-workflow':
      case 'executeWorkflow':
        return this.executeWorkflow(params);
      case 'n8n-create-workflow':
      case 'createWorkflow':
        return this.createWorkflow(params);
      case 'n8n-get-execution':
      case 'getExecution':
        return this.getExecution(params);
      default:
        return { success: false, error: `Unknown function: ${functionId}`, executionTimeMs: 0, provider: 'n8n', costUsd: 0, metadata: {} };
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${N8N_API_URL}/rest/workflows`, {
        headers: this.getHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timer);
      return { healthy: res.ok, responseTimeMs: Date.now() - start, checkedAt: new Date() };
    } catch (error) {
      return { healthy: false, responseTimeMs: Date.now() - start, error: error instanceof Error ? error.message : 'Not reachable', checkedAt: new Date() };
    }
  }

  async shutdown(): Promise<void> {
    log.info('n8n adapter shutting down');
  }

  private async listWorkflows(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    try {
      const limit = (params.limit as number) || 50;
      const url = `${N8N_API_URL}/rest/workflows?limit=${limit}`;

      const res = await fetch(url, { headers: this.getHeaders() });
      if (!res.ok) throw new Error(`n8n API error: ${res.status}`);

      const data = await res.json();
      return {
        success: true,
        data: { workflows: data.data || [], total: data.count || 0 },
        executionTimeMs: Date.now() - startTime,
        provider: 'n8n',
        costUsd: 0,
        metadata: {},
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'List workflows failed',
        executionTimeMs: Date.now() - startTime,
        provider: 'n8n',
        costUsd: 0,
        metadata: {},
      };
    }
  }

  private async executeWorkflow(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { workflowId, inputData, waitForResult } = params as { workflowId: string; inputData?: Record<string, unknown>; waitForResult?: boolean };

    try {
      const url = `${N8N_API_URL}/rest/workflows/${workflowId}/execute`;
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ inputData: inputData || {} }),
      });

      if (!res.ok) throw new Error(`n8n execute error: ${res.status}`);
      const data = await res.json();

      return {
        success: true,
        data: {
          executionId: data.executionId || data.id,
          status: data.status || 'running',
          result: data.result || data.data,
        },
        executionTimeMs: Date.now() - startTime,
        provider: 'n8n',
        costUsd: 0,
        metadata: {},
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Execute workflow failed',
        executionTimeMs: Date.now() - startTime,
        provider: 'n8n',
        costUsd: 0,
        metadata: {},
      };
    }
  }

  private async createWorkflow(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { name, nodes, connections, active } = params as { name: string; nodes: unknown[]; connections?: Record<string, unknown>; active?: boolean };

    try {
      const res = await fetch(`${N8N_API_URL}/rest/workflows`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ name, nodes, connections: connections || {}, active: active || false }),
      });

      if (!res.ok) throw new Error(`n8n create error: ${res.status}`);
      const data = await res.json();

      return {
        success: true,
        data: { workflowId: data.id, status: 'created' },
        executionTimeMs: Date.now() - startTime,
        provider: 'n8n',
        costUsd: 0,
        metadata: {},
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Create workflow failed',
        executionTimeMs: Date.now() - startTime,
        provider: 'n8n',
        costUsd: 0,
        metadata: {},
      };
    }
  }

  private async getExecution(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { executionId } = params as { executionId: string };

    try {
      const res = await fetch(`${N8N_API_URL}/rest/executions/${executionId}`, {
        headers: this.getHeaders(),
      });

      if (!res.ok) throw new Error(`n8n get execution error: ${res.status}`);
      const data = await res.json();

      return {
        success: true,
        data: { status: data.status, result: data.data },
        executionTimeMs: Date.now() - startTime,
        provider: 'n8n',
        costUsd: 0,
        metadata: {},
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Get execution failed',
        executionTimeMs: Date.now() - startTime,
        provider: 'n8n',
        costUsd: 0,
        metadata: {},
      };
    }
  }
}
