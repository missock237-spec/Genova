/**
 * n8n Client — Connect to n8n for workflow automation
 *
 * n8n is a powerful workflow automation platform that allows users to create
 * automated workflows connecting various services. This client provides
 * full CRUD operations for workflows and execution management.
 *
 * Environment variables:
 *   N8N_API_URL — Base URL of the n8n instance (default: http://localhost:5678)
 *   N8N_API_KEY — API key for n8n authentication
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('n8n-client');

// Types
export interface N8NWorkflow {
  id?: string;
  name: string;
  active: boolean;
  nodes: N8NNode[];
  connections: Record<string, N8NConnection[]>;
  settings?: Record<string, unknown>;
  tags?: N8NTag[];
  createdAt?: string;
  updatedAt?: string;
}

export interface N8NNode {
  id?: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
  disabled?: boolean;
}

export interface N8NConnection {
  node: string;
  type: string;
  typeIndex: number;
  connectionIndex: number;
}

export interface N8NTag {
  id?: string;
  name: string;
}

export interface N8NExecution {
  id: string;
  finished: boolean;
  mode: string;
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
  status: 'success' | 'error' | 'waiting' | 'running' | 'canceled' | 'unknown';
  workflowData?: N8NWorkflow;
  data?: {
    resultData?: {
      runData?: Record<string, unknown[]>;
    };
  };
}

export interface N8NCredentials {
  id: string;
  name: string;
  type: string;
}

export interface N8NPaginatedResponse<T> {
  data: T[];
  nextCursor?: string;
}

const N8N_API_URL = process.env.N8N_API_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY || '';

/**
 * Make an authenticated request to the n8n API
 */
async function n8nRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${N8N_API_URL}/api/v1${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (N8N_API_KEY) {
    headers['X-N8N-API-KEY'] = N8N_API_KEY;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    log.error('n8n API request failed', { path, status: response.status, error: errorBody });
    throw new Error(`n8n API error (${response.status}): ${errorBody}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

/**
 * Check if n8n is available and healthy
 */
export async function checkN8NHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${N8N_API_URL}/healthz`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ── Workflow CRUD ──────────────────────────────────────────────

/**
 * List all workflows
 */
export async function listWorkflows(cursor?: string, limit?: number): Promise<N8NPaginatedResponse<N8NWorkflow>> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));

  const query = params.toString() ? `?${params.toString()}` : '';
  return n8nRequest<N8NPaginatedResponse<N8NWorkflow>>(`/workflows${query}`);
}

/**
 * Get a specific workflow
 */
export async function getWorkflow(id: string): Promise<N8NWorkflow> {
  return n8nRequest<N8NWorkflow>(`/workflows/${id}`);
}

/**
 * Create a new workflow
 */
export async function createWorkflow(workflow: Omit<N8NWorkflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<N8NWorkflow> {
  log.info('Creating n8n workflow', { name: workflow.name });
  return n8nRequest<N8NWorkflow>('/workflows', {
    method: 'POST',
    body: JSON.stringify(workflow),
  });
}

/**
 * Update an existing workflow
 */
export async function updateWorkflow(id: string, workflow: Partial<N8NWorkflow>): Promise<N8NWorkflow> {
  log.info('Updating n8n workflow', { id, name: workflow.name });
  return n8nRequest<N8NWorkflow>(`/workflows/${id}`, {
    method: 'PUT',
    body: JSON.stringify(workflow),
  });
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(id: string): Promise<void> {
  log.info('Deleting n8n workflow', { id });
  await n8nRequest<void>(`/workflows/${id}`, { method: 'DELETE' });
}

/**
 * Activate a workflow
 */
export async function activateWorkflow(id: string): Promise<N8NWorkflow> {
  log.info('Activating n8n workflow', { id });
  return n8nRequest<N8NWorkflow>(`/workflows/${id}/activate`, { method: 'POST' });
}

/**
 * Deactivate a workflow
 */
export async function deactivateWorkflow(id: string): Promise<N8NWorkflow> {
  log.info('Deactivating n8n workflow', { id });
  return n8nRequest<N8NWorkflow>(`/workflows/${id}/deactivate`, { method: 'POST' });
}

// ── Executions ────────────────────────────────────────────────

/**
 * List workflow executions
 */
export async function listExecutions(workflowId?: string, limit?: number, cursor?: string): Promise<N8NPaginatedResponse<N8NExecution>> {
  const params = new URLSearchParams();
  if (workflowId) params.set('workflowId', workflowId);
  if (limit) params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);

  const query = params.toString() ? `?${params.toString()}` : '';
  return n8nRequest<N8NPaginatedResponse<N8NExecution>>(`/executions${query}`);
}

/**
 * Get a specific execution
 */
export async function getExecution(id: string): Promise<N8NExecution> {
  return n8nRequest<N8NExecution>(`/executions/${id}`);
}

/**
 * Delete an execution
 */
export async function deleteExecution(id: string): Promise<void> {
  log.info('Deleting n8n execution', { id });
  await n8nRequest<void>(`/executions/${id}`, { method: 'DELETE' });
}

// ── Credentials ───────────────────────────────────────────────

/**
 * List available credential types
 */
export async function listCredentialTypes(): Promise<string[]> {
  try {
    const result = await n8nRequest<{ data: Array<{ name: string }> }>('/credential-types');
    return result.data?.map(c => c.name) ?? [];
  } catch {
    return [];
  }
}

// ── Genova-specific helpers ───────────────────────────────────

/**
 * Create a Genova agent workflow template
 * This creates a pre-configured workflow with webhook trigger and agent processing nodes.
 */
export async function createAgentWorkflow(
  name: string,
  agentConfig: {
    triggerType: 'webhook' | 'schedule' | 'manual';
    prompt: string;
    outputType: 'text' | 'image' | 'email';
    outputTarget?: string;
  },
): Promise<N8NWorkflow> {
  const nodes: N8NNode[] = [];
  const connections: Record<string, N8NConnection[]> = {};

  // Webhook trigger node
  if (agentConfig.triggerType === 'webhook') {
    nodes.push({
      name: 'Webhook Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 1,
      position: [250, 300],
      parameters: {
        httpMethod: 'POST',
        path: `genova-${name.toLowerCase().replace(/\s+/g, '-')}`,
        responseMode: 'onReceived',
      },
    });
  } else if (agentConfig.triggerType === 'schedule') {
    nodes.push({
      name: 'Schedule Trigger',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: {
        rule: { interval: [{ field: 'hours', hoursInterval: 1 }] },
      },
    });
  } else {
    nodes.push({
      name: 'Manual Trigger',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [250, 300],
      parameters: {},
    });
  }

  // Genova Agent node (HTTP Request to Genova API)
  nodes.push({
    name: 'Genova Agent',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 3,
    position: [450, 300],
    parameters: {
      method: 'POST',
      url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/agent/execute`,
      sendBody: true,
      bodyParameters: {
        parameters: [
          { name: 'prompt', value: agentConfig.prompt },
          { name: 'mode', value: agentConfig.outputType },
        ],
      },
    },
  });

  // Connect trigger → agent
  const triggerName = nodes[0].name;
  connections[triggerName] = [{
    node: 'Genova Agent',
    type: 'main',
    typeIndex: 0,
    connectionIndex: 0,
  }];

  // Output node
  if (agentConfig.outputType === 'email' && agentConfig.outputTarget) {
    nodes.push({
      name: 'Send Email',
      type: 'n8n-nodes-base.emailSend',
      typeVersion: 2,
      position: [650, 300],
      parameters: {
        toEmail: agentConfig.outputTarget,
        subject: `Genova Agent: ${name}`,
        text: '={{ $json.content }}',
      },
    });

    connections['Genova Agent'] = [{
      node: 'Send Email',
      type: 'main',
      typeIndex: 0,
      connectionIndex: 0,
    }];
  }

  log.info('Creating Genova agent workflow template', { name, triggerType: agentConfig.triggerType });

  return createWorkflow({
    name: `[Genova] ${name}`,
    active: false,
    nodes,
    connections,
    settings: {
      callerPolicy: 'workflowsFromSameOwner',
    },
    tags: [{ name: 'genova' }],
  });
}

export { N8N_API_URL, N8N_API_KEY };
