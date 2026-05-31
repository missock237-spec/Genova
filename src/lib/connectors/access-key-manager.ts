/**
 * Access Key Manager — Genova Connector System
 *
 * Manages API keys, bearer tokens, OAuth2 credentials, and other
 * authentication mechanisms for connecting Genova to external services.
 *
 * Features:
 * - Encrypted key storage with AES-256-GCM
 * - Key validation and testing via configurable test endpoints
 * - Usage tracking and rate limit monitoring
 * - Scope-based permission management
 * - Key rotation support
 * - Comprehensive audit logging
 */

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { encryptAuthConfig, decryptAuthConfig } from './mcp-client';

const log = createLogger('access-key-manager');

// ============================================================
// Types
// ============================================================

export type AccessKeyType = 'api_key' | 'bearer_token' | 'oauth2' | 'basic_auth' | 'custom';

export interface CreateAccessKeyInput {
  name: string;
  description?: string;
  service: string;
  keyType: AccessKeyType;
  keyValue: string;
  endpoint?: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
  testEndpoint?: string;
  expiresAt?: Date;
}

export interface UpdateAccessKeyInput {
  name?: string;
  description?: string;
  keyValue?: string;
  endpoint?: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
  testEndpoint?: string;
  expiresAt?: Date | null;
  isActive?: boolean;
}

export interface AccessKeyTestResult {
  success: boolean;
  message: string;
  statusCode?: number;
  responseTimeMs: number;
  details?: Record<string, unknown>;
}

export interface AccessKeyExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
  executionTimeMs: number;
  rateLimitInfo?: {
    remaining?: number;
    limit?: number;
    resetAt?: string;
  };
}

export interface AccessKeySummary {
  id: string;
  name: string;
  service: string;
  keyType: AccessKeyType;
  endpoint?: string | null;
  scopes: string[];
  isActive: boolean;
  lastTestedAt?: Date | null;
  lastTestResult?: AccessKeyTestResult | null;
  usageCount: number;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Service Registry — Predefined service configurations
// ============================================================

export interface ServiceDefinition {
  id: string;
  name: string;
  icon: string;
  color: string;
  defaultEndpoint?: string;
  defaultTestEndpoint?: string;
  defaultKeyType: AccessKeyType;
  defaultAuthHeader: string;
  defaultScopes: string[];
  category: string;
  description: string;
}

export const SERVICE_REGISTRY: ServiceDefinition[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: '🐙',
    color: '#6e5494',
    defaultEndpoint: 'https://api.github.com',
    defaultTestEndpoint: 'https://api.github.com/user',
    defaultKeyType: 'bearer_token',
    defaultAuthHeader: 'Authorization: Bearer',
    defaultScopes: ['repo', 'read:user', 'user:email'],
    category: 'development',
    description: 'Accès aux dépôts, issues, pull requests et actions GitHub',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    icon: '💳',
    color: '#635bff',
    defaultEndpoint: 'https://api.stripe.com/v1',
    defaultTestEndpoint: 'https://api.stripe.com/v1/balance',
    defaultKeyType: 'api_key',
    defaultAuthHeader: 'Authorization: Bearer',
    defaultScopes: ['read', 'write'],
    category: 'finance',
    description: 'Paiements, abonnements et facturation via Stripe',
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: '💬',
    color: '#4a154b',
    defaultEndpoint: 'https://slack.com/api',
    defaultTestEndpoint: 'https://slack.com/api/auth.test',
    defaultKeyType: 'bearer_token',
    defaultAuthHeader: 'Authorization: Bearer',
    defaultScopes: ['chat:write', 'channels:read', 'users:read'],
    category: 'communication',
    description: 'Envoi de messages et gestion des canaux Slack',
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: '📝',
    color: '#000000',
    defaultEndpoint: 'https://api.notion.com/v1',
    defaultTestEndpoint: 'https://api.notion.com/v1/users/me',
    defaultKeyType: 'bearer_token',
    defaultAuthHeader: 'Authorization: Bearer',
    defaultScopes: ['read', 'write'],
    category: 'productivity',
    description: 'Accès aux pages, bases de données et blocs Notion',
  },
  {
    id: 'google',
    name: 'Google APIs',
    icon: '🔍',
    color: '#4285f4',
    defaultEndpoint: 'https://www.googleapis.com',
    defaultKeyType: 'api_key',
    defaultAuthHeader: 'x-goog-api-key',
    defaultScopes: ['drive.readonly', 'calendar.readonly', 'gmail.readonly'],
    category: 'productivity',
    description: 'Accès aux services Google (Drive, Calendar, Gmail, etc.)',
  },
  {
    id: 'discord',
    name: 'Discord',
    icon: '🎮',
    color: '#5865f2',
    defaultEndpoint: 'https://discord.com/api/v10',
    defaultTestEndpoint: 'https://discord.com/api/v10/users/@me',
    defaultKeyType: 'bearer_token',
    defaultAuthHeader: 'Authorization: Bot',
    defaultScopes: ['bot', 'identify', 'guilds'],
    category: 'communication',
    description: 'Bots Discord, envoi de messages et gestion de serveurs',
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    icon: '🐦',
    color: '#1da1f2',
    defaultEndpoint: 'https://api.twitter.com/2',
    defaultKeyType: 'bearer_token',
    defaultAuthHeader: 'Authorization: Bearer',
    defaultScopes: ['tweet.read', 'tweet.write', 'users.read'],
    category: 'social',
    description: 'Publication et lecture de tweets via l\'API X',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '🤖',
    color: '#10a37f',
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultTestEndpoint: 'https://api.openai.com/v1/models',
    defaultKeyType: 'api_key',
    defaultAuthHeader: 'Authorization: Bearer',
    defaultScopes: ['chat', 'completions', 'embeddings'],
    category: 'ai',
    description: 'Accès aux modèles GPT, DALL-E et Whisper d\'OpenAI',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: '🧠',
    color: '#d4a373',
    defaultEndpoint: 'https://api.anthropic.com/v1',
    defaultKeyType: 'api_key',
    defaultAuthHeader: 'x-api-key',
    defaultScopes: ['messages'],
    category: 'ai',
    description: 'Accès aux modèles Claude d\'Anthropic',
  },
  {
    id: 'figma',
    name: 'Figma',
    icon: '🎨',
    color: '#f24e1e',
    defaultEndpoint: 'https://api.figma.com/v1',
    defaultTestEndpoint: 'https://api.figma.com/v1/me',
    defaultKeyType: 'bearer_token',
    defaultAuthHeader: 'Authorization: Bearer',
    defaultScopes: ['file_read', 'file_write'],
    category: 'design',
    description: 'Accès aux fichiers et projets Figma',
  },
  {
    id: 'custom',
    name: 'Service personnalisé',
    icon: '🔧',
    color: '#6b7280',
    defaultKeyType: 'api_key',
    defaultAuthHeader: 'Authorization: Bearer',
    defaultScopes: [],
    category: 'other',
    description: 'Connexion à un service personnalisé via clé API ou token',
  },
];

export function getServiceDefinition(serviceId: string): ServiceDefinition | undefined {
  return SERVICE_REGISTRY.find(s => s.id === serviceId);
}

// ============================================================
// Access Key Manager
// ============================================================

class AccessKeyManager {
  // -----------------------------------------------------------------------
  // CRUD Operations
  // -----------------------------------------------------------------------

  /**
   * Create a new access key with encrypted storage.
   */
  async create(userId: string, input: CreateAccessKeyInput): Promise<AccessKeySummary> {
    // Validate input
    if (!input.name || !input.service || !input.keyValue) {
      throw new Error('Name, service, and keyValue are required');
    }

    if (input.name.length > 100) {
      throw new Error('Name must be at most 100 characters');
    }

    if (input.keyValue.length > 10000) {
      throw new Error('Key value too long');
    }

    // Encrypt the key value
    const encryptedValue = encryptAuthConfig({ key: input.keyValue });

    const accessKey = await db.accessKey.create({
      data: {
        name: input.name,
        description: input.description || '',
        service: input.service,
        keyType: input.keyType,
        keyValue: encryptedValue,
        endpoint: input.endpoint || null,
        scopes: JSON.stringify(input.scopes || []),
        metadata: JSON.stringify(input.metadata || {}),
        testEndpoint: input.testEndpoint || null,
        expiresAt: input.expiresAt || null,
        userId,
      },
    });

    // Log creation
    await this.logAction(userId, 'access_key_created', accessKey.id, {
      service: input.service,
      keyType: input.keyType,
    });

    log.info('Access key created', {
      id: accessKey.id,
      service: input.service,
      userId,
    });

    return this.toSummary(accessKey);
  }

  /**
   * Update an existing access key.
   */
  async update(userId: string, keyId: string, input: UpdateAccessKeyInput): Promise<AccessKeySummary> {
    const existing = await db.accessKey.findUnique({
      where: { id: keyId },
    });

    if (!existing) {
      throw new Error('Access key not found');
    }

    if (existing.userId !== userId) {
      throw new Error('Access denied: key belongs to another user');
    }

    const updateData: Record<string, unknown> = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.endpoint !== undefined) updateData.endpoint = input.endpoint;
    if (input.testEndpoint !== undefined) updateData.testEndpoint = input.testEndpoint;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    if (input.expiresAt !== undefined) updateData.expiresAt = input.expiresAt;
    if (input.scopes !== undefined) updateData.scopes = JSON.stringify(input.scopes);
    if (input.metadata !== undefined) updateData.metadata = JSON.stringify(input.metadata);

    // If key value is being updated, re-encrypt
    if (input.keyValue !== undefined) {
      updateData.keyValue = encryptAuthConfig({ key: input.keyValue });
    }

    const updated = await db.accessKey.update({
      where: { id: keyId },
      data: updateData,
    });

    await this.logAction(userId, 'access_key_updated', keyId, {
      updatedFields: Object.keys(updateData),
    });

    return this.toSummary(updated);
  }

  /**
   * Delete an access key.
   */
  async delete(userId: string, keyId: string): Promise<void> {
    const existing = await db.accessKey.findUnique({
      where: { id: keyId },
    });

    if (!existing) {
      throw new Error('Access key not found');
    }

    if (existing.userId !== userId) {
      throw new Error('Access denied: key belongs to another user');
    }

    await db.accessKey.delete({
      where: { id: keyId },
    });

    await this.logAction(userId, 'access_key_deleted', keyId, {
      service: existing.service,
    });
  }

  /**
   * Get a single access key by ID.
   */
  async getById(userId: string, keyId: string): Promise<AccessKeySummary | null> {
    const key = await db.accessKey.findUnique({
      where: { id: keyId },
    });

    if (!key || key.userId !== userId) {
      return null;
    }

    return this.toSummary(key);
  }

  /**
   * List all access keys for a user.
   */
  async list(userId: string, options: {
    service?: string;
    isActive?: boolean;
    keyType?: AccessKeyType;
  } = {}): Promise<AccessKeySummary[]> {
    const keys = await db.accessKey.findMany({
      where: {
        userId,
        ...(options.service ? { service: options.service } : {}),
        ...(options.isActive !== undefined ? { isActive: options.isActive } : {}),
        ...(options.keyType ? { keyType: options.keyType } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map(k => this.toSummary(k));
  }

  // -----------------------------------------------------------------------
  // Key Decryption (for internal use only)
  // -----------------------------------------------------------------------

  /**
   * Decrypt and retrieve the actual key value.
   * WARNING: This should only be used server-side for making API calls.
   * Never expose the decrypted value to the client.
   */
  async decryptKeyValue(keyId: string, userId: string): Promise<string> {
    const key = await db.accessKey.findUnique({
      where: { id: keyId },
    });

    if (!key) {
      throw new Error('Access key not found');
    }

    if (key.userId !== userId) {
      throw new Error('Access denied');
    }

    if (!key.isActive) {
      throw new Error('Access key is inactive');
    }

    // Check expiration
    if (key.expiresAt && key.expiresAt < new Date()) {
      throw new Error('Access key has expired');
    }

    const decrypted = decryptAuthConfig(key.keyValue);
    return decrypted.key || '';
  }

  // -----------------------------------------------------------------------
  // Key Testing
  // -----------------------------------------------------------------------

  /**
   * Test an access key by making a request to its test endpoint.
   */
  async testKey(userId: string, keyId: string): Promise<AccessKeyTestResult> {
    const key = await db.accessKey.findUnique({
      where: { id: keyId },
    });

    if (!key || key.userId !== userId) {
      return {
        success: false,
        message: 'Access key not found or access denied',
        responseTimeMs: 0,
      };
    }

    const testEndpoint = key.testEndpoint || this.inferTestEndpoint(key.service, key.endpoint);
    if (!testEndpoint) {
      return {
        success: false,
        message: 'No test endpoint configured for this key',
        responseTimeMs: 0,
      };
    }

    const startTime = Date.now();

    try {
      const keyValue = await this.decryptKeyValue(keyId, userId);
      const headers = this.buildRequestHeaders(key.keyType, keyValue);
      const metadata = this.parseJsonSafe<Record<string, string>>(key.metadata);

      // Add custom headers from metadata
      if (metadata.customHeaders) {
        Object.assign(headers, metadata.customHeaders);
      }

      const response = await fetch(testEndpoint, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(15000),
      });

      const testResult: AccessKeyTestResult = {
        success: response.ok,
        message: response.ok ? 'Connexion réussie' : `Erreur HTTP ${response.status}`,
        statusCode: response.status,
        responseTimeMs: Date.now() - startTime,
      };

      // Try to extract rate limit info from response headers
      const remaining = response.headers.get('x-ratelimit-remaining');
      const limit = response.headers.get('x-ratelimit-limit');
      const resetAt = response.headers.get('x-ratelimit-reset');

      if (remaining || limit || resetAt) {
        testResult.details = {
          rateLimit: {
            remaining: remaining ? parseInt(remaining, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
            resetAt: resetAt || undefined,
          },
        };
      }

      // Update the key with test results
      await db.accessKey.update({
        where: { id: keyId },
        data: {
          lastTestedAt: new Date(),
          lastTestResult: JSON.stringify(testResult),
          rateLimitInfo: JSON.stringify(testResult.details?.rateLimit || {}),
        },
      });

      return testResult;
    } catch (error) {
      const testResult: AccessKeyTestResult = {
        success: false,
        message: error instanceof Error ? error.message : 'Test failed',
        responseTimeMs: Date.now() - startTime,
      };

      await db.accessKey.update({
        where: { id: keyId },
        data: {
          lastTestedAt: new Date(),
          lastTestResult: JSON.stringify(testResult),
        },
      });

      return testResult;
    }
  }

  // -----------------------------------------------------------------------
  // API Execution via Access Key
  // -----------------------------------------------------------------------

  /**
   * Execute an API call using an access key.
   * This is the primary method for agents to call external APIs.
   */
  async execute(
    userId: string,
    keyId: string,
    options: {
      method?: string;
      path: string;
      body?: Record<string, unknown>;
      queryParams?: Record<string, string>;
      headers?: Record<string, string>;
      agentId?: string;
      timeoutMs?: number;
    }
  ): Promise<AccessKeyExecutionResult> {
    const key = await db.accessKey.findUnique({
      where: { id: keyId },
    });

    if (!key || key.userId !== userId) {
      return {
        success: false,
        error: 'Access key not found or access denied',
        executionTimeMs: 0,
      };
    }

    if (!key.isActive) {
      return {
        success: false,
        error: 'Access key is inactive',
        executionTimeMs: 0,
      };
    }

    if (key.expiresAt && key.expiresAt < new Date()) {
      return {
        success: false,
        error: 'Access key has expired',
        executionTimeMs: 0,
      };
    }

    const startTime = Date.now();
    let status: 'success' | 'error' | 'timeout' = 'success';
    let errorMessage: string | undefined;

    try {
      const keyValue = await this.decryptKeyValue(keyId, userId);
      const authHeaders = this.buildRequestHeaders(key.keyType, keyValue);
      const metadata = this.parseJsonSafe<Record<string, string>>(key.metadata);

      // Build URL
      const baseUrl = key.endpoint || '';
      const url = new URL(options.path, baseUrl);
      if (options.queryParams) {
        for (const [k, v] of Object.entries(options.queryParams)) {
          url.searchParams.set(k, v);
        }
      }

      // Build request
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...(typeof metadata.customHeaders === 'object' && metadata.customHeaders ? metadata.customHeaders as Record<string, string> : {}),
        ...options.headers,
      };

      const response = await fetch(url.toString(), {
        method: options.method || 'GET',
        headers: requestHeaders,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(options.timeoutMs || 30000),
      });

      // Extract rate limit info
      const remaining = response.headers.get('x-ratelimit-remaining');
      const limit = response.headers.get('x-ratelimit-limit');
      const resetAt = response.headers.get('x-ratelimit-reset');

      const rateLimitInfo = (remaining || limit || resetAt) ? {
        remaining: remaining ? parseInt(remaining, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        resetAt: resetAt || undefined,
      } : undefined;

      // Parse response
      let data: unknown;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        status = 'error';
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }

      // Update usage count
      await db.accessKey.update({
        where: { id: keyId },
        data: {
          usageCount: { increment: 1 },
          rateLimitInfo: JSON.stringify(rateLimitInfo || {}),
        },
      });

      return {
        success: response.ok,
        data,
        error: response.ok ? undefined : errorMessage,
        statusCode: response.status,
        executionTimeMs: Date.now() - startTime,
        rateLimitInfo,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        status = 'timeout';
      }
      errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: errorMessage,
        executionTimeMs: Date.now() - startTime,
      };
    } finally {
      // Log execution
      await this.logExecution({
        connectorType: 'access_key',
        connectorId: keyId,
        agentId: options.agentId,
        operation: `${options.method || 'GET'} ${options.path}`,
        inputParams: JSON.stringify(this.sanitizeBody(options.body || {})),
        outputResult: JSON.stringify({ success: status === 'success', statusCode: status === 'success' ? 200 : 0 }),
        status,
        errorMessage,
        durationMs: Date.now() - startTime,
        userId,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Key Rotation
  // -----------------------------------------------------------------------

  /**
   * Rotate an access key — update the key value while preserving all other settings.
   */
  async rotateKey(userId: string, keyId: string, newKeyValue: string): Promise<AccessKeySummary> {
    return this.update(userId, keyId, { keyValue: newKeyValue });
  }

  // -----------------------------------------------------------------------
  // Statistics
  // -----------------------------------------------------------------------

  /**
   * Get access key statistics for a user.
   */
  async getStats(userId: string): Promise<{
    total: number;
    active: number;
    expired: number;
    byService: Record<string, number>;
    byType: Record<string, number>;
    totalUsage: number;
  }> {
    const keys = await db.accessKey.findMany({
      where: { userId },
      select: {
        service: true,
        keyType: true,
        isActive: true,
        expiresAt: true,
        usageCount: true,
      },
    });

    const now = new Date();
    const byService: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let active = 0;
    let expired = 0;
    let totalUsage = 0;

    for (const key of keys) {
      byService[key.service] = (byService[key.service] || 0) + 1;
      byType[key.keyType] = (byType[key.keyType] || 0) + 1;
      if (key.isActive) active++;
      if (key.expiresAt && key.expiresAt < now) expired++;
      totalUsage += key.usageCount;
    }

    return {
      total: keys.length,
      active,
      expired,
      byService,
      byType,
      totalUsage,
    };
  }

  // -----------------------------------------------------------------------
  // Private Helpers
  // -----------------------------------------------------------------------

  private buildRequestHeaders(keyType: string, keyValue: string): Record<string, string> {
    switch (keyType) {
      case 'bearer_token':
        return { 'Authorization': `Bearer ${keyValue}` };
      case 'api_key':
        return { 'X-API-Key': keyValue, 'Authorization': `Bearer ${keyValue}` };
      case 'oauth2':
        return { 'Authorization': `Bearer ${keyValue}` };
      case 'basic_auth':
        return { 'Authorization': `Basic ${keyValue}` };
      case 'custom':
        return { 'Authorization': keyValue };
      default:
        return { 'Authorization': `Bearer ${keyValue}` };
    }
  }

  private inferTestEndpoint(service: string, endpoint?: string | null): string | null {
    // Check service registry for default test endpoint
    const serviceDef = getServiceDefinition(service);
    if (serviceDef?.defaultTestEndpoint) {
      return serviceDef.defaultTestEndpoint;
    }
    // If we have an endpoint, try /me or /status
    if (endpoint) {
      return `${endpoint}/me`;
    }
    return null;
  }

  private sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
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

  private parseJsonSafe<T>(json: string): T {
    try {
      return JSON.parse(json);
    } catch {
      return {} as T;
    }
  }

  private toSummary(key: {
    id: string;
    name: string;
    service: string;
    keyType: string;
    endpoint?: string | null;
    scopes: string;
    isActive: boolean;
    lastTestedAt?: Date | null;
    lastTestResult?: string | null;
    usageCount: number;
    expiresAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): AccessKeySummary {
    let lastTestResult: AccessKeyTestResult | null = null;
    if (key.lastTestResult) {
      try {
        lastTestResult = JSON.parse(key.lastTestResult);
      } catch {
        lastTestResult = null;
      }
    }

    return {
      id: key.id,
      name: key.name,
      service: key.service,
      keyType: key.keyType as AccessKeyType,
      endpoint: key.endpoint,
      scopes: this.parseJsonSafe<string[]>(key.scopes),
      isActive: key.isActive,
      lastTestedAt: key.lastTestedAt,
      lastTestResult,
      usageCount: key.usageCount,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    };
  }

  private async logAction(
    userId: string,
    action: string,
    resourceId: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      await db.auditLog.create({
        data: {
          userId,
          action,
          resource: 'access_key',
          resourceId,
          details: JSON.stringify(details),
          severity: 'info',
        },
      });

      await db.activityLog.create({
        data: {
          action: action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          details: JSON.stringify({ resourceId, ...details }),
          category: 'connector',
          userId,
        },
      });
    } catch (dbError) {
      log.warn('Failed to log access key action', {
        action,
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }
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
// Singleton
// ============================================================

let _manager: AccessKeyManager | null = null;

export function getAccessKeyManager(): AccessKeyManager {
  if (!_manager) {
    _manager = new AccessKeyManager();
  }
  return _manager;
}
