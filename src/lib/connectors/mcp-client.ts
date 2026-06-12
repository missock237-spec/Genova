/**
 * MCP Client — Model Context Protocol Client for Genova
 *
 * Production-ready MCP client supporting SSE and Streamable HTTP transports.
 * Implements the MCP specification for discovering and invoking tools,
 * resources, and prompts on remote MCP servers.
 *
 * Features:
 * - SSE transport (legacy MCP) and Streamable HTTP transport (MCP 2025-03-26)
 * - Automatic tool/resource/prompt discovery via initialize + list methods
 * - Retry with exponential backoff on transient failures
 * - Request timeout and cancellation support
 * - Connection health monitoring with heartbeat
 * - Secure credential handling (auth headers never logged)
 */

import { createLogger } from '@/lib/logger';
import { getAuthSecret } from "@/lib/auth-config";
import { db } from '@/lib/db';
import crypto from 'crypto';

const log = createLogger('mcp-client');

// ============================================================
// MCP Protocol Types
// ============================================================

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface MCPCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, unknown>;
}

export interface MCPServerInfo {
  name: string;
  version: string;
}

export interface MCPConnectionConfig {
  connectorId: string;
  serverUrl: string;
  transportType: 'sse' | 'streamable-http';
  authType: 'none' | 'bearer' | 'api_key' | 'oauth2' | 'basic';
  authConfig: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface MCPExecutionResult {
  success: boolean;
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: { uri: string; name: string; mimeType?: string };
  }>;
  isError?: boolean;
  executionTimeMs: number;
  metadata: Record<string, unknown>;
}

// ============================================================
// JSON-RPC Types
// ============================================================

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

// ============================================================
// Encryption Utilities for Auth Config
// ============================================================

const RAW_ENCRYPTION_KEY = getAuthSecret();
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getDerivedEncryptionKey(): Buffer {
  const key = RAW_ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32);
  return Buffer.from(key, 'utf-8');
}

export function encryptAuthConfig(config: Record<string, string>): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getDerivedEncryptionKey(), iv);
  let encrypted = cipher.update(JSON.stringify(config), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
}

export function decryptAuthConfig(encrypted: string): Record<string, string> {
  try {
    const parts = encrypted.split(':');
    if (parts.length !== 3) return {};
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encryptedData = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, getDerivedEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch {
    log.warn('Failed to decrypt auth config, returning empty object');
    return {};
  }
}

// ============================================================
// MCP Transport — SSE
// ============================================================

class SSETransport {
  private endpoint: string;
  private headers: Record<string, string>;
  private messageId = 0;
  private abortController: AbortController | null = null;

  constructor(serverUrl: string, headers: Record<string, string>) {
    // SSE endpoint is the server URL + /sse
    this.endpoint = serverUrl.endsWith('/sse') ? serverUrl : `${serverUrl}/sse`;
    this.headers = { ...headers };
  }

  async connect(): Promise<void> {
    // SSE connection is established per-request in MCP spec
    log.debug('SSE transport ready', { endpoint: this.endpoint });
  }

  async sendRequest(request: JSONRPCRequest, timeoutMs: number = 30000): Promise<JSONRPCResponse> {
    const requestId = ++this.messageId;
    request.id = requestId;

    // Determine the message endpoint
    // For SSE, we POST to the server URL (not /sse)
    const messageEndpoint = this.endpoint.replace(/\/sse$/, '/message');

    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => this.abortController?.abort(), timeoutMs);

    try {
      const response = await fetch(messageEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(request),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        return {
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32000,
            message: `HTTP ${response.status}: ${response.statusText}`,
          },
        };
      }

      const data = await response.json();
      return data as JSONRPCResponse;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return {
          jsonrpc: '2.0',
          id: requestId,
          error: { code: -32000, message: 'Request timed out' },
        };
      }
      return {
        jsonrpc: '2.0',
        id: requestId,
        error: { code: -32000, message: error instanceof Error ? error.message : 'Unknown error' },
      };
    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
    }
  }

  async disconnect(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

// ============================================================
// MCP Transport — Streamable HTTP (MCP 2025-03-26)
// ============================================================

class StreamableHTTPTransport {
  private serverUrl: string;
  private headers: Record<string, string>;
  private messageId = 0;
  private sessionId: string | null = null;
  private abortController: AbortController | null = null;

  constructor(serverUrl: string, headers: Record<string, string>) {
    this.serverUrl = serverUrl;
    this.headers = { ...headers };
  }

  async connect(): Promise<void> {
    // Streamable HTTP doesn't require a persistent connection
    log.debug('Streamable HTTP transport ready', { url: this.serverUrl });
  }

  async sendRequest(request: JSONRPCRequest, timeoutMs: number = 30000): Promise<JSONRPCResponse> {
    const requestId = ++this.messageId;
    request.id = requestId;

    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => this.abortController?.abort(), timeoutMs);

    try {
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...this.headers,
      };

      if (this.sessionId) {
        requestHeaders['Mcp-Session-Id'] = this.sessionId;
      }

      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(request),
        signal: this.abortController.signal,
      });

      // Capture session ID from response
      const responseSessionId = response.headers.get('Mcp-Session-Id');
      if (responseSessionId) {
        this.sessionId = responseSessionId;
      }

      if (!response.ok) {
        return {
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32000,
            message: `HTTP ${response.status}: ${response.statusText}`,
          },
        };
      }

      const contentType = response.headers.get('content-type') || '';

      // Handle SSE response stream
      if (contentType.includes('text/event-stream')) {
        return await this.parseSSEResponse(response, requestId);
      }

      // Handle JSON response
      const data = await response.json();
      return data as JSONRPCResponse;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return {
          jsonrpc: '2.0',
          id: requestId,
          error: { code: -32000, message: 'Request timed out' },
        };
      }
      return {
        jsonrpc: '2.0',
        id: requestId,
        error: { code: -32000, message: error instanceof Error ? error.message : 'Unknown error' },
      };
    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
    }
  }

  private async parseSSEResponse(response: Response, requestId: number): Promise<JSONRPCResponse> {
    const text = await response.text();
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.id === requestId) {
            return data as JSONRPCResponse;
          }
        } catch {
          continue;
        }
      }
    }

    return {
      jsonrpc: '2.0',
      id: requestId,
      error: { code: -32000, message: 'No valid response found in SSE stream' },
    };
  }

  async disconnect(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.sessionId = null;
  }
}

// ============================================================
// MCP Client
// ============================================================

type Transport = SSETransport | StreamableHTTPTransport;

export class MCPClient {
  private config: MCPConnectionConfig;
  private transport: Transport;
  private initialized = false;
  private capabilities: MCPCapabilities = {};
  private serverInfo: MCPServerInfo = { name: 'unknown', version: '0.0.0' };
  private discoveredTools: MCPTool[] = [];
  private discoveredResources: MCPResource[] = [];
  private discoveredPrompts: MCPPrompt[] = [];
  private requestId = 0;
  private retryCount = 0;

  constructor(config: MCPConnectionConfig) {
    this.config = config;
    const headers = this.buildAuthHeaders();

    if (config.transportType === 'sse') {
      this.transport = new SSETransport(config.serverUrl, headers);
    } else {
      this.transport = new StreamableHTTPTransport(config.serverUrl, headers);
    }
  }

  // -----------------------------------------------------------------------
  // Connection Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Initialize the MCP connection.
   * Performs the MCP handshake: initialize → initialized notification.
   * Then discovers available tools, resources, and prompts.
   */
  async connect(): Promise<{
    capabilities: MCPCapabilities;
    serverInfo: MCPServerInfo;
    tools: MCPTool[];
    resources: MCPResource[];
    prompts: MCPPrompt[];
  }> {
    const startTime = Date.now();

    try {
      // Update status in DB to connecting
      await this.updateConnectorStatus('connecting');

      // Connect the transport
      await this.transport.connect();

      // MCP Initialize handshake
      const initResult = await this.sendRequest('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
          prompts: { listChanged: true },
        },
        clientInfo: {
          name: 'Genova Genova',
          version: '1.0.0',
        },
      });

      if (initResult.error) {
        throw new Error(`MCP initialize failed: ${initResult.error.message}`);
      }

      const result = initResult.result as {
        protocolVersion?: string;
        capabilities?: MCPCapabilities;
        serverInfo?: MCPServerInfo;
      };

      this.capabilities = result.capabilities || {};
      this.serverInfo = result.serverInfo || { name: 'unknown', version: '0.0.0' };

      // Send initialized notification
      await this.sendNotification('notifications/initialized');

      // Discover tools, resources, and prompts
      await this.discoverCapabilities();

      this.initialized = true;

      // Update DB
      await db.mCPConnector.update({
        where: { id: this.config.connectorId },
        data: {
          status: 'connected',
          lastConnectedAt: new Date(),
          capabilities: JSON.stringify(this.capabilities),
          serverInfo: JSON.stringify(this.serverInfo),
          tools: JSON.stringify(this.discoveredTools),
          resources: JSON.stringify(this.discoveredResources),
          prompts: JSON.stringify(this.discoveredPrompts),
          lastError: null,
        },
      });

      log.info('MCP client connected', {
        connectorId: this.config.connectorId,
        server: this.serverInfo.name,
        tools: this.discoveredTools.length,
        resources: this.discoveredResources.length,
        durationMs: Date.now() - startTime,
      });

      return {
        capabilities: this.capabilities,
        serverInfo: this.serverInfo,
        tools: this.discoveredTools,
        resources: this.discoveredResources,
        prompts: this.discoveredPrompts,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.updateConnectorStatus('error', errorMessage);

      log.error('MCP connection failed', {
        connectorId: this.config.connectorId,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Disconnect from the MCP server.
   */
  async disconnect(): Promise<void> {
    try {
      await this.transport.disconnect();
      this.initialized = false;

      await this.updateConnectorStatus('disconnected');

      log.info('MCP client disconnected', {
        connectorId: this.config.connectorId,
      });
    } catch (error) {
      log.warn('Error during MCP disconnect', {
        connectorId: this.config.connectorId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // -----------------------------------------------------------------------
  // Tool Execution
  // -----------------------------------------------------------------------

  /**
   * Call an MCP tool on the connected server.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    options: { timeoutMs?: number; agentId?: string; userId: string } = { userId: '' }
  ): Promise<MCPExecutionResult> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized. Call connect() first.');
    }

    const startTime = Date.now();
    let status: 'success' | 'error' | 'timeout' = 'success';
    let errorMessage: string | undefined;

    try {
      const result = await this.sendRequest('tools/call', {
        name: toolName,
        arguments: args,
      }, options.timeoutMs);

      if (result.error) {
        status = 'error';
        errorMessage = result.error.message;
        throw new Error(`MCP tool call failed: ${result.error.message}`);
      }

      const callResult = result.result as {
        content: MCPExecutionResult['content'];
        isError?: boolean;
      };

      // Update request count
      await db.mCPConnector.update({
        where: { id: this.config.connectorId },
        data: {
          requestCount: { increment: 1 },
          avgLatencyMs: Math.round((Date.now() - startTime) * 0.1 + (await this.getCurrentAvgLatency()) * 0.9),
        },
      });

      return {
        success: !callResult.isError,
        content: callResult.content || [],
        isError: callResult.isError,
        executionTimeMs: Date.now() - startTime,
        metadata: {
          toolName,
          serverName: this.serverInfo.name,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('timed out')) {
        status = 'timeout';
      }
      errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        content: [{ type: 'text', text: errorMessage }],
        isError: true,
        executionTimeMs: Date.now() - startTime,
        metadata: { toolName, error: errorMessage },
      };
    } finally {
      // Log execution
      await this.logExecution({
        connectorType: 'mcp',
        connectorId: this.config.connectorId,
        agentId: options.agentId,
        operation: toolName,
        inputParams: JSON.stringify(this.sanitizeParams(args)),
        outputResult: JSON.stringify({ success: status === 'success' }),
        status,
        errorMessage,
        durationMs: Date.now() - startTime,
        userId: options.userId,
      });
    }
  }

  /**
   * Read an MCP resource.
   */
  async readResource(uri: string, options: { timeoutMs?: number } = {}): Promise<MCPExecutionResult> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized');
    }

    const startTime = Date.now();

    try {
      const result = await this.sendRequest('resources/read', { uri }, options.timeoutMs);

      if (result.error) {
        throw new Error(`MCP resource read failed: ${result.error.message}`);
      }

      const readResult = result.result as {
        contents: Array<{
          uri: string;
          mimeType?: string;
          text?: string;
          blob?: string;
        }>;
      };

      return {
        success: true,
        content: (readResult.contents || []).map(c => ({
          type: 'resource' as const,
          resource: { uri: c.uri, name: c.uri, mimeType: c.mimeType },
          text: c.text,
          data: c.blob,
          mimeType: c.mimeType,
        })),
        executionTimeMs: Date.now() - startTime,
        metadata: { uri, serverName: this.serverInfo.name },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: [{ type: 'text', text: errorMessage }],
        isError: true,
        executionTimeMs: Date.now() - startTime,
        metadata: { uri, error: errorMessage },
      };
    }
  }

  /**
   * Get an MCP prompt.
   */
  async getPrompt(
    name: string,
    args: Record<string, string> = {},
    options: { timeoutMs?: number } = {}
  ): Promise<MCPExecutionResult> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized');
    }

    const startTime = Date.now();

    try {
      const result = await this.sendRequest('prompts/get', {
        name,
        arguments: args,
      }, options.timeoutMs);

      if (result.error) {
        throw new Error(`MCP prompt get failed: ${result.error.message}`);
      }

      const promptResult = result.result as {
        description?: string;
        messages: Array<{
          role: string;
          content: { type: string; text?: string };
        }>;
      };

      return {
        success: true,
        content: (promptResult.messages || []).map(m => ({
          type: 'text' as const,
          text: m.content.text || '',
        })),
        executionTimeMs: Date.now() - startTime,
        metadata: { promptName: name, serverName: this.serverInfo.name },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: [{ type: 'text', text: errorMessage }],
        isError: true,
        executionTimeMs: Date.now() - startTime,
        metadata: { promptName: name, error: errorMessage },
      };
    }
  }

  // -----------------------------------------------------------------------
  // Discovery
  // -----------------------------------------------------------------------

  /**
   * Re-discover tools, resources, and prompts from the server.
   */
  async refreshCapabilities(): Promise<{
    tools: MCPTool[];
    resources: MCPResource[];
    prompts: MCPPrompt[];
  }> {
    await this.discoverCapabilities();

    await db.mCPConnector.update({
      where: { id: this.config.connectorId },
      data: {
        tools: JSON.stringify(this.discoveredTools),
        resources: JSON.stringify(this.discoveredResources),
        prompts: JSON.stringify(this.discoveredPrompts),
      },
    });

    return {
      tools: this.discoveredTools,
      resources: this.discoveredResources,
      prompts: this.discoveredPrompts,
    };
  }

  // -----------------------------------------------------------------------
  // Health Check
  // -----------------------------------------------------------------------

  /**
   * Check if the MCP server is reachable and responding.
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    responseTimeMs: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      // Try to ping the server with a tools/list request (lightweight)
      const result = await this.sendRequest('tools/list', {}, 10000);

      return {
        healthy: !result.error,
        responseTimeMs: Date.now() - startTime,
        error: result.error?.message,
      };
    } catch (error) {
      return {
        healthy: false,
        responseTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Health check failed',
      };
    }
  }

  // -----------------------------------------------------------------------
  // Getters
  // -----------------------------------------------------------------------

  getTools(): MCPTool[] {
    return [...this.discoveredTools];
  }

  getResources(): MCPResource[] {
    return [...this.discoveredResources];
  }

  getPrompts(): MCPPrompt[] {
    return [...this.discoveredPrompts];
  }

  getServerInfo(): MCPServerInfo {
    return { ...this.serverInfo };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getConnectorId(): string {
    return this.config.connectorId;
  }

  // -----------------------------------------------------------------------
  // Private Helpers
  // -----------------------------------------------------------------------

  private buildAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    switch (this.config.authType) {
      case 'bearer':
        if (this.config.authConfig.token) {
          headers['Authorization'] = `Bearer ${this.config.authConfig.token}`;
        }
        break;
      case 'api_key':
        if (this.config.authConfig.headerName && this.config.authConfig.apiKey) {
          headers[this.config.authConfig.headerName] = this.config.authConfig.apiKey;
        } else if (this.config.authConfig.apiKey) {
          headers['X-API-Key'] = this.config.authConfig.apiKey;
        }
        break;
      case 'basic':
        if (this.config.authConfig.username && this.config.authConfig.password) {
          const encoded = Buffer.from(
            `${this.config.authConfig.username}:${this.config.authConfig.password}`
          ).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
        }
        break;
      case 'oauth2':
        if (this.config.authConfig.accessToken) {
          headers['Authorization'] = `Bearer ${this.config.authConfig.accessToken}`;
        }
        break;
    }

    return headers;
  }

  private async sendRequest(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number = this.config.timeoutMs || 30000
  ): Promise<JSONRPCResponse> {
    const maxRetries = this.config.maxRetries ?? 2;
    let lastError: JSONRPCResponse | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        log.debug('Retrying MCP request', { method, attempt });
      }

      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: ++this.requestId,
        method,
        params,
      };

      const response = await this.transport.sendRequest(request, timeoutMs);

      if (response.error) {
        lastError = response;
        // Don't retry on client errors (4xx equivalent codes)
        if (response.error.code >= -32600 && response.error.code <= -32603) {
          return response;
        }
        continue;
      }

      this.retryCount = 0;
      return response;
    }

    return lastError || {
      jsonrpc: '2.0',
      id: this.requestId,
      error: { code: -32000, message: 'Max retries exceeded' },
    };
  }

  private async sendNotification(method: string, params: Record<string, unknown> = {}): Promise<void> {
    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    // For notifications, we fire and forget
    try {
      const headers = this.buildAuthHeaders();
      const endpoint = this.config.transportType === 'sse'
        ? this.config.serverUrl.replace(/\/sse$/, '/message')
        : this.config.serverUrl;

      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(notification),
      });
    } catch (error) {
      log.warn('Failed to send MCP notification', {
        method,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async discoverCapabilities(): Promise<void> {
    // Discover tools
    if (this.capabilities.tools) {
      try {
        const toolsResult = await this.sendRequest('tools/list', {});
        if (toolsResult.result && !toolsResult.error) {
          const toolsData = toolsResult.result as { tools: MCPTool[] };
          this.discoveredTools = toolsData.tools || [];
        }
      } catch (error) {
        log.warn('Failed to discover MCP tools', {
          connectorId: this.config.connectorId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Discover resources
    if (this.capabilities.resources) {
      try {
        const resourcesResult = await this.sendRequest('resources/list', {});
        if (resourcesResult.result && !resourcesResult.error) {
          const resourcesData = resourcesResult.result as { resources: MCPResource[] };
          this.discoveredResources = resourcesData.resources || [];
        }
      } catch (error) {
        log.warn('Failed to discover MCP resources', {
          connectorId: this.config.connectorId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Discover prompts
    if (this.capabilities.prompts) {
      try {
        const promptsResult = await this.sendRequest('prompts/list', {});
        if (promptsResult.result && !promptsResult.error) {
          const promptsData = promptsResult.result as { prompts: MCPPrompt[] };
          this.discoveredPrompts = promptsData.prompts || [];
        }
      } catch (error) {
        log.warn('Failed to discover MCP prompts', {
          connectorId: this.config.connectorId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async updateConnectorStatus(status: string, error?: string): Promise<void> {
    try {
      await db.mCPConnector.update({
        where: { id: this.config.connectorId },
        data: {
          status,
          lastError: error || null,
          ...(status === 'connected' ? { lastConnectedAt: new Date() } : {}),
        },
      });
    } catch (dbError) {
      log.warn('Failed to update connector status in DB', {
        connectorId: this.config.connectorId,
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }
  }

  private async getCurrentAvgLatency(): Promise<number> {
    try {
      const connector = await db.mCPConnector.findUnique({
        where: { id: this.config.connectorId },
        select: { avgLatencyMs: true },
      });
      return connector?.avgLatencyMs || 0;
    } catch {
      return 0;
    }
  }

  private sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      // Mask sensitive fields
      if (key.toLowerCase().includes('password') ||
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('key') ||
          key.toLowerCase().includes('credential')) {
        sanitized[key] = '••••••••';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private async logExecution(exec: {
    connectorType: string;
    connectorId: string;
    agentId?: string;
    operation: string;
    inputParams: string;
    outputResult: string;
    status: string;
    errorMessage?: string;
    durationMs: number;
    userId: string;
  }): Promise<void> {
    try {
      await db.connectorExecution.create({
        data: {
          connectorType: exec.connectorType,
          connectorId: exec.connectorId,
          agentId: exec.agentId,
          operation: exec.operation,
          inputParams: exec.inputParams,
          outputResult: exec.outputResult,
          status: exec.status,
          errorMessage: exec.errorMessage,
          durationMs: exec.durationMs,
          userId: exec.userId,
        },
      });
    } catch (dbError) {
      log.warn('Failed to log connector execution', {
        connectorId: exec.connectorId,
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }
  }
}

// ============================================================
// MCP Client Manager — Singleton
// ============================================================

class MCPClientManager {
  private clients = new Map<string, MCPClient>();

  /**
   * Get or create an MCP client for a connector.
   */
  async getClient(connectorId: string, userId: string): Promise<MCPClient> {
    const existing = this.clients.get(connectorId);
    if (existing && existing.isInitialized()) {
      return existing;
    }

    // Load connector config from DB
    const connector = await db.mCPConnector.findUnique({
      where: { id: connectorId },
    });

    if (!connector) {
      throw new Error(`MCP connector not found: ${connectorId}`);
    }

    if (connector.userId !== userId) {
      throw new Error('Access denied: connector belongs to another user');
    }

    if (!connector.isActive) {
      throw new Error('Connector is inactive');
    }

    // Decrypt auth config
    const authConfig = connector.authConfig && connector.authConfig !== '{}'
      ? decryptAuthConfig(connector.authConfig)
      : {};

    const config: MCPConnectionConfig = {
      connectorId: connector.id,
      serverUrl: connector.serverUrl,
      transportType: connector.transportType as 'sse' | 'streamable-http',
      authType: connector.authType as MCPConnectionConfig['authType'],
      authConfig,
    };

    const client = new MCPClient(config);

    // If it was previously connected, reconnect
    if (connector.status === 'connected') {
      try {
        await client.connect();
      } catch (error) {
        log.warn('Failed to reconnect MCP client', {
          connectorId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.clients.set(connectorId, client);
    return client;
  }

  /**
   * Create and connect a new MCP client.
   */
  async createAndConnect(config: MCPConnectionConfig): Promise<MCPClient> {
    const client = new MCPClient(config);
    await client.connect();
    this.clients.set(config.connectorId, client);
    return client;
  }

  /**
   * Disconnect and remove a client.
   */
  async removeClient(connectorId: string): Promise<void> {
    const client = this.clients.get(connectorId);
    if (client) {
      await client.disconnect();
      this.clients.delete(connectorId);
    }
  }

  /**
   * Get all active clients.
   */
  getActiveClients(): MCPClient[] {
    return Array.from(this.clients.values()).filter(c => c.isInitialized());
  }

  /**
   * Get a client if it exists and is initialized.
   */
  getConnectedClient(connectorId: string): MCPClient | undefined {
    const client = this.clients.get(connectorId);
    return client?.isInitialized() ? client : undefined;
  }

  /**
   * Run health checks on all active clients.
   */
  async checkAllHealth(): Promise<Record<string, { healthy: boolean; responseTimeMs: number; error?: string }>> {
    const results: Record<string, { healthy: boolean; responseTimeMs: number; error?: string }> = {};

    await Promise.allSettled(
      Array.from(this.clients.entries()).map(async ([id, client]) => {
        if (client.isInitialized()) {
          results[id] = await client.healthCheck();
        }
      })
    );

    return results;
  }
}

let _manager: MCPClientManager | null = null;

export function getMCPClientManager(): MCPClientManager {
  if (!_manager) {
    _manager = new MCPClientManager();
  }
  return _manager;
}
