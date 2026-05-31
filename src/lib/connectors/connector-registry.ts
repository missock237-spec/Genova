/**
 * Connector Registry — Unified registry for MCP Connectors and Access Keys
 *
 * Provides a single entry point for discovering, managing, and executing
 * operations through both MCP connectors and API access keys.
 * Bridges with the existing Integration Engine for agent tool availability.
 */

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { getMCPClientManager, type MCPClient } from './mcp-client';
import { getAccessKeyManager, type AccessKeySummary, type AccessKeyTestResult, type AccessKeyExecutionResult } from './access-key-manager';
import type { MCPTool } from './mcp-client';

const log = createLogger('connector-registry');

// ============================================================
// Types
// ============================================================

export type ConnectorType = 'mcp' | 'access_key';

export interface ConnectorSummary {
  id: string;
  type: ConnectorType;
  name: string;
  description: string;
  service?: string;
  status: string;
  isActive: boolean;
  lastUsed?: Date | null;
  usageCount: number;
  createdAt: Date;
  metadata: Record<string, unknown>;
}

export interface ConnectorStats {
  total: number;
  mcpConnectors: number;
  accessKeys: number;
  active: number;
  totalExecutions: number;
  byService: Record<string, number>;
}

export interface AgentToolDescriptor {
  id: string;
  name: string;
  description: string;
  connectorType: ConnectorType;
  connectorId: string;
  connectorName: string;
  inputSchema: Record<string, unknown>;
  requiresAuth: boolean;
  category: string;
}

// ============================================================
// Connector Registry
// ============================================================

class ConnectorRegistry {
  // -----------------------------------------------------------------------
  // List All Connectors (Unified)
  // -----------------------------------------------------------------------

  /**
   * List all connectors for a user (both MCP and access keys).
   */
  async listAll(userId: string, options: {
    type?: ConnectorType;
    isActive?: boolean;
    search?: string;
  } = {}): Promise<ConnectorSummary[]> {
    const connectors: ConnectorSummary[] = [];

    // Fetch MCP connectors
    if (!options.type || options.type === 'mcp') {
      const mcpConnectors = await db.mCPConnector.findMany({
        where: {
          userId,
          ...(options.isActive !== undefined ? { isActive: options.isActive } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const mc of mcpConnectors) {
        if (options.search) {
          const search = options.search.toLowerCase();
          if (!mc.name.toLowerCase().includes(search) &&
              !mc.description.toLowerCase().includes(search)) {
            continue;
          }
        }

        connectors.push({
          id: mc.id,
          type: 'mcp',
          name: mc.name,
          description: mc.description,
          status: mc.status,
          isActive: mc.isActive,
          lastUsed: mc.lastConnectedAt,
          usageCount: mc.requestCount,
          createdAt: mc.createdAt,
          metadata: {
            transportType: mc.transportType,
            authType: mc.authType,
            serverUrl: mc.serverUrl,
            toolCount: (() => { try { return JSON.parse(mc.tools).length; } catch { return 0; } })(),
            resourceCount: (() => { try { return JSON.parse(mc.resources).length; } catch { return 0; } })(),
          },
        });
      }
    }

    // Fetch Access Keys
    if (!options.type || options.type === 'access_key') {
      const accessKeys = await db.accessKey.findMany({
        where: {
          userId,
          ...(options.isActive !== undefined ? { isActive: options.isActive } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const ak of accessKeys) {
        if (options.search) {
          const search = options.search.toLowerCase();
          if (!ak.name.toLowerCase().includes(search) &&
              !ak.description.toLowerCase().includes(search) &&
              !ak.service.toLowerCase().includes(search)) {
            continue;
          }
        }

        connectors.push({
          id: ak.id,
          type: 'access_key',
          name: ak.name,
          description: ak.description,
          service: ak.service,
          status: ak.isActive ? 'active' : 'inactive',
          isActive: ak.isActive,
          lastUsed: ak.lastTestedAt,
          usageCount: ak.usageCount,
          createdAt: ak.createdAt,
          metadata: {
            keyType: ak.keyType,
            endpoint: ak.endpoint,
            scopes: (() => { try { return JSON.parse(ak.scopes); } catch { return []; } })(),
            expiresAt: ak.expiresAt,
          },
        });
      }
    }

    return connectors;
  }

  // -----------------------------------------------------------------------
  // Statistics
  // -----------------------------------------------------------------------

  /**
   * Get connector statistics for a user.
   */
  async getStats(userId: string): Promise<ConnectorStats> {
    const [mcpCount, keyCount, activeMcp, activeKeys, executions] = await Promise.all([
      db.mCPConnector.count({ where: { userId } }),
      db.accessKey.count({ where: { userId } }),
      db.mCPConnector.count({ where: { userId, isActive: true } }),
      db.accessKey.count({ where: { userId, isActive: true } }),
      db.connectorExecution.count({ where: { userId } }),
    ]);

    // Get by-service breakdown
    const keysByService = await db.accessKey.groupBy({
      by: ['service'],
      where: { userId },
      _count: { service: true },
    });

    const byService: Record<string, number> = {};
    for (const entry of keysByService) {
      byService[entry.service] = entry._count.service;
    }

    // Add MCP connectors as "mcp" service
    byService['mcp'] = mcpCount;

    return {
      total: mcpCount + keyCount,
      mcpConnectors: mcpCount,
      accessKeys: keyCount,
      active: activeMcp + activeKeys,
      totalExecutions: executions,
      byService,
    };
  }

  // -----------------------------------------------------------------------
  // Agent Tool Discovery
  // -----------------------------------------------------------------------

  /**
   * Discover all available tools from MCP connectors and access keys
   * that can be used by agents.
   */
  async discoverAgentTools(userId: string): Promise<AgentToolDescriptor[]> {
    const tools: AgentToolDescriptor[] = [];

    // Discover MCP tools
    const mcpConnectors = await db.mCPConnector.findMany({
      where: { userId, isActive: true, status: 'connected' },
      select: { id: true, name: true, tools: true },
    });

    for (const connector of mcpConnectors) {
      let mcpTools: MCPTool[] = [];
      try {
        mcpTools = JSON.parse(connector.tools);
      } catch {
        continue;
      }

      for (const tool of mcpTools) {
        tools.push({
          id: `mcp_${connector.id}_${tool.name}`,
          name: tool.name,
          description: tool.description || `Outil MCP: ${tool.name}`,
          connectorType: 'mcp',
          connectorId: connector.id,
          connectorName: connector.name,
          inputSchema: tool.inputSchema,
          requiresAuth: true,
          category: 'mcp_tool',
        });
      }
    }

    // Discover Access Key tools (service-level operations)
    const accessKeys = await db.accessKey.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        name: true,
        service: true,
        endpoint: true,
        scopes: true,
        keyType: true,
      },
    });

    for (const key of accessKeys) {
      let scopes: string[] = [];
      try {
        scopes = JSON.parse(key.scopes);
      } catch {
        // ignore
      }

      tools.push({
        id: `ak_${key.id}_api_call`,
        name: `${key.service}_api_call`,
        description: `Appel API ${key.service} via ${key.name}`,
        connectorType: 'access_key',
        connectorId: key.id,
        connectorName: key.name,
        inputSchema: {
          type: 'object',
          properties: {
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'Méthode HTTP' },
            path: { type: 'string', description: 'Chemin de l\'endpoint API' },
            body: { type: 'object', description: 'Corps de la requête (JSON)' },
            queryParams: { type: 'object', description: 'Paramètres de requête' },
          },
          required: ['method', 'path'],
        },
        requiresAuth: true,
        category: 'api_call',
      });

      // Add scope-specific tools if available
      for (const scope of scopes) {
        tools.push({
          id: `ak_${key.id}_${scope}`,
          name: `${key.service}_${scope.replace(/[:.]/g, '_')}`,
          description: `Opération ${scope} sur ${key.service}`,
          connectorType: 'access_key',
          connectorId: key.id,
          connectorName: key.name,
          inputSchema: {
            type: 'object',
            properties: {
              data: { type: 'object', description: `Données pour l'opération ${scope}` },
            },
          },
          requiresAuth: true,
          category: scope.split(':')[0] || 'api_call',
        });
      }
    }

    return tools;
  }

  // -----------------------------------------------------------------------
  // Execution
  // -----------------------------------------------------------------------

  /**
   * Execute a connector operation (MCP tool or API call).
   */
  async execute(
    userId: string,
    connectorId: string,
    connectorType: ConnectorType,
    operation: string,
    params: Record<string, unknown>,
    options: {
      agentId?: string;
      timeoutMs?: number;
    } = {}
  ): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
    executionTimeMs: number;
    metadata: Record<string, unknown>;
  }> {
    const startTime = Date.now();

    try {
      if (connectorType === 'mcp') {
        const mcpManager = getMCPClientManager();
        const client = await mcpManager.getClient(connectorId, userId);
        const result = await client.callTool(operation, params, {
          agentId: options.agentId,
          userId,
          timeoutMs: options.timeoutMs,
        });

        return {
          success: result.success,
          data: result.content,
          error: result.isError ? result.content.map(c => c.text).join('\n') : undefined,
          executionTimeMs: result.executionTimeMs,
          metadata: result.metadata,
        };
      }

      if (connectorType === 'access_key') {
        const akManager = getAccessKeyManager();
        const result = await akManager.execute(userId, connectorId, {
          method: (params.method as string) || 'GET',
          path: (params.path as string) || operation,
          body: params.body as Record<string, unknown>,
          queryParams: params.queryParams as Record<string, string>,
          agentId: options.agentId,
          timeoutMs: options.timeoutMs,
        });

        return {
          success: result.success,
          data: result.data,
          error: result.error,
          executionTimeMs: result.executionTimeMs,
          metadata: {
            statusCode: result.statusCode,
            rateLimitInfo: result.rateLimitInfo,
          },
        };
      }

      return {
        success: false,
        error: `Unknown connector type: ${connectorType}`,
        executionTimeMs: Date.now() - startTime,
        metadata: {},
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Execution failed',
        executionTimeMs: Date.now() - startTime,
        metadata: {},
      };
    }
  }

  // -----------------------------------------------------------------------
  // Execution History
  // -----------------------------------------------------------------------

  /**
   * Get execution history for a user's connectors.
   */
  async getExecutionHistory(userId: string, options: {
    connectorId?: string;
    connectorType?: ConnectorType;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    executions: Array<{
      id: string;
      connectorType: string;
      connectorId: string;
      operation: string;
      status: string;
      durationMs: number;
      errorMessage?: string | null;
      createdAt: Date;
    }>;
    total: number;
  }> {
    const where = {
      userId,
      ...(options.connectorId ? { connectorId: options.connectorId } : {}),
      ...(options.connectorType ? { connectorType: options.connectorType } : {}),
      ...(options.status ? { status: options.status } : {}),
    };

    const [executions, total] = await Promise.all([
      db.connectorExecution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
        select: {
          id: true,
          connectorType: true,
          connectorId: true,
          operation: true,
          status: true,
          durationMs: true,
          errorMessage: true,
          createdAt: true,
        },
      }),
      db.connectorExecution.count({ where }),
    ]);

    return { executions, total };
  }

  // -----------------------------------------------------------------------
  // Health Check
  // -----------------------------------------------------------------------

  /**
   * Run health checks on all active MCP connectors.
   */
  async checkMCPHealth(userId: string): Promise<Record<string, {
    healthy: boolean;
    responseTimeMs: number;
    error?: string;
  }>> {
    const mcpManager = getMCPClientManager();
    return mcpManager.checkAllHealth();
  }
}

// ============================================================
// Singleton
// ============================================================

let _registry: ConnectorRegistry | null = null;

export function getConnectorRegistry(): ConnectorRegistry {
  if (!_registry) {
    _registry = new ConnectorRegistry();
  }
  return _registry;
}
