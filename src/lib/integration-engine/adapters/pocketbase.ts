/**
 * PocketBase Adapter — Genova Integration Engine
 *
 * Integrates PocketBase backend into Genova for
 * agent data, memories, learnings, and file storage.
 */

import type {
  IntegrationAdapter,
  IntegrationConfig,
  ExecutionResult,
  HealthCheckResult,
} from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('adapter-pocketbase');

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090';

export class PocketBaseAdapter implements IntegrationAdapter {
  readonly config: IntegrationConfig = {
    id: 'pocketbase',
    name: 'pocketbase',
    displayName: 'PocketBase',
    description: 'Lightweight backend for agent data, memories, learnings, and file storage',
    version: '1.0.0',
    category: 'database',
    icon: '🗄️',
    color: '#3B82F6',
    homepage: 'https://pocketbase.io',
    repository: 'https://github.com/pocketbase/pocketbase',
    status: 'discovered',
    functions: [
      {
        id: 'pocketbase-query',
        name: 'query',
        displayName: 'Query Collection',
        description: 'Query records from a PocketBase collection',
        category: 'database',
        inputSchema: [
          { name: 'collection', type: 'string', required: true, description: 'Collection name' },
          { name: 'filter', type: 'string', required: false, description: 'Filter expression' },
          { name: 'sort', type: 'string', required: false, description: 'Sort expression' },
          { name: 'limit', type: 'number', required: false, defaultValue: 50, description: 'Max results' },
          { name: 'page', type: 'number', required: false, defaultValue: 1, description: 'Page number' },
        ],
        outputSchema: [
          { name: 'items', type: 'array', required: true, description: 'Query results' },
          { name: 'total', type: 'number', required: true, description: 'Total records' },
        ],
        requiresAuth: true,
        authType: 'token',
        timeoutMs: 15_000,
        costPerCall: 0,
        tags: ['database', 'query', 'read'],
      },
      {
        id: 'pocketbase-create',
        name: 'create',
        displayName: 'Create Record',
        description: 'Create a new record in a PocketBase collection',
        category: 'database',
        inputSchema: [
          { name: 'collection', type: 'string', required: true, description: 'Collection name' },
          { name: 'data', type: 'object', required: true, description: 'Record data' },
        ],
        outputSchema: [
          { name: 'record', type: 'object', required: true, description: 'Created record' },
        ],
        requiresAuth: true,
        authType: 'token',
        timeoutMs: 10_000,
        costPerCall: 0,
        tags: ['database', 'create', 'write'],
      },
      {
        id: 'pocketbase-update',
        name: 'update',
        displayName: 'Update Record',
        description: 'Update an existing record in a PocketBase collection',
        category: 'database',
        inputSchema: [
          { name: 'collection', type: 'string', required: true, description: 'Collection name' },
          { name: 'id', type: 'string', required: true, description: 'Record ID' },
          { name: 'data', type: 'object', required: true, description: 'Update data' },
        ],
        outputSchema: [
          { name: 'record', type: 'object', required: true, description: 'Updated record' },
        ],
        requiresAuth: true,
        authType: 'token',
        timeoutMs: 10_000,
        costPerCall: 0,
        tags: ['database', 'update', 'write'],
      },
      {
        id: 'pocketbase-delete',
        name: 'delete',
        displayName: 'Delete Record',
        description: 'Delete a record from a PocketBase collection',
        category: 'database',
        inputSchema: [
          { name: 'collection', type: 'string', required: true, description: 'Collection name' },
          { name: 'id', type: 'string', required: true, description: 'Record ID' },
        ],
        outputSchema: [
          { name: 'success', type: 'boolean', required: true, description: 'Deletion status' },
        ],
        requiresAuth: true,
        authType: 'token',
        timeoutMs: 10_000,
        costPerCall: 0,
        tags: ['database', 'delete'],
      },
      {
        id: 'pocketbase-health',
        name: 'healthCheck',
        displayName: 'Health Check',
        description: 'Check PocketBase server health',
        category: 'database',
        inputSchema: [],
        outputSchema: [
          { name: 'healthy', type: 'boolean', required: true, description: 'Health status' },
        ],
        requiresAuth: false,
        timeoutMs: 5_000,
        costPerCall: 0,
        tags: ['database', 'health', 'status'],
      },
    ],
    dependencies: ['pocketbase'],
    envVariables: [
      { name: 'POCKETBASE_URL', description: 'PocketBase server URL', required: false, defaultValue: 'http://localhost:8090', isSecret: false },
      { name: 'POCKETBASE_ADMIN_EMAIL', description: 'Admin email', required: false, isSecret: false },
      { name: 'POCKETBASE_ADMIN_PASSWORD', description: 'Admin password', required: false, isSecret: true },
    ],
    apiBaseUrl: POCKETBASE_URL,
    metadata: {},
  };

  private authToken: string | null = null;

  async initialize(): Promise<void> {
    log.info('PocketBase adapter initializing');
    await this.authenticate();
  }

  private async authenticate(): Promise<void> {
    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
    const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) return;

    try {
      const res = await fetch(`${POCKETBASE_URL}/api/admins/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
      });
      if (res.ok) {
        const data = await res.json();
        this.authToken = data.token;
      }
    } catch {
      log.warn('PocketBase auth failed');
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) {
      headers['Authorization'] = this.authToken;
    }
    return headers;
  }

  async execute(functionId: string, params: Record<string, unknown>, _userId: string): Promise<ExecutionResult> {
    switch (functionId) {
      case 'pocketbase-query': case 'query': return this.query(params);
      case 'pocketbase-create': case 'create': return this.create(params);
      case 'pocketbase-update': case 'update': return this.update(params);
      case 'pocketbase-delete': case 'delete': return this.delete(params);
      case 'pocketbase-health': case 'healthCheck': return this.pbHealthCheck();
      default: return { success: false, error: `Unknown function: ${functionId}`, executionTimeMs: 0, provider: 'pocketbase', costUsd: 0, metadata: {} };
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${POCKETBASE_URL}/api/health`, { signal: controller.signal });
      clearTimeout(timer);
      return { healthy: res.ok, responseTimeMs: Date.now() - start, checkedAt: new Date() };
    } catch {
      return { healthy: false, responseTimeMs: Date.now() - start, error: 'PocketBase not reachable', checkedAt: new Date() };
    }
  }

  async shutdown(): Promise<void> {
    this.authToken = null;
    log.info('PocketBase adapter shutting down');
  }

  private async query(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { collection, filter, sort, limit, page } = params as { collection: string; filter?: string; sort?: string; limit?: number; page?: number };

    try {
      const queryParams = new URLSearchParams();
      if (filter) queryParams.set('filter', filter);
      if (sort) queryParams.set('sort', sort);
      queryParams.set('perPage', String(limit || 50));
      queryParams.set('page', String(page || 1));

      const res = await fetch(`${POCKETBASE_URL}/api/collections/${collection}/records?${queryParams}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) throw new Error(`PocketBase query error: ${res.status}`);

      const data = await res.json();
      return {
        success: true,
        data: { items: data.items || [], total: data.totalItems || 0 },
        executionTimeMs: Date.now() - startTime,
        provider: 'pocketbase',
        costUsd: 0,
        metadata: {},
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Query failed', executionTimeMs: Date.now() - startTime, provider: 'pocketbase', costUsd: 0, metadata: {} };
    }
  }

  private async create(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { collection, data } = params as { collection: string; data: Record<string, unknown> };

    try {
      const res = await fetch(`${POCKETBASE_URL}/api/collections/${collection}/records`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`PocketBase create error: ${res.status}`);
      const result = await res.json();
      return { success: true, data: { record: result }, executionTimeMs: Date.now() - startTime, provider: 'pocketbase', costUsd: 0, metadata: {} };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Create failed', executionTimeMs: Date.now() - startTime, provider: 'pocketbase', costUsd: 0, metadata: {} };
    }
  }

  private async update(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { collection, id, data } = params as { collection: string; id: string; data: Record<string, unknown> };

    try {
      const res = await fetch(`${POCKETBASE_URL}/api/collections/${collection}/records/${id}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`PocketBase update error: ${res.status}`);
      const result = await res.json();
      return { success: true, data: { record: result }, executionTimeMs: Date.now() - startTime, provider: 'pocketbase', costUsd: 0, metadata: {} };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Update failed', executionTimeMs: Date.now() - startTime, provider: 'pocketbase', costUsd: 0, metadata: {} };
    }
  }

  private async delete(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { collection, id } = params as { collection: string; id: string };

    try {
      const res = await fetch(`${POCKETBASE_URL}/api/collections/${collection}/records/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      return { success: res.ok, data: { success: res.ok }, executionTimeMs: Date.now() - startTime, provider: 'pocketbase', costUsd: 0, metadata: {} };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Delete failed', executionTimeMs: Date.now() - startTime, provider: 'pocketbase', costUsd: 0, metadata: {} };
    }
  }

  private async pbHealthCheck(): Promise<ExecutionResult> {
    const health = await this.healthCheck();
    return { success: true, data: { healthy: health.healthy }, executionTimeMs: health.responseTimeMs, provider: 'pocketbase', costUsd: 0, metadata: {} };
  }
}
