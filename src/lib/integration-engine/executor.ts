/**
 * Integration Executor — Genova Integration Engine
 *
 * Executes functions from registered integrations with:
 * - Timeout handling
 * - Retry with exponential backoff
 * - Fallback chain support
 * - Cost tracking
 * - Execution logging
 */

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { getIntegrationRegistry } from './registry';
import type {
  ExecutionRequest,
  ExecutionResult,
  IntegrationConfig,
  IntegrationFunction,
} from './types';

const log = createLogger('integration-executor');

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 500;

// ============================================================
// Execution Engine
// ============================================================

export class IntegrationExecutor {
  private activeExecutions = new Map<string, AbortController>();

  /**
   * Execute an integration function.
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const { integrationId, functionId, params, userId, timeoutMs, priority } = request;

    const registry = getIntegrationRegistry();
    const config = registry.getById(integrationId);
    const adapter = registry.getAdapter(integrationId);

    if (!config) {
      return {
        success: false,
        error: `Integration not found: ${integrationId}`,
        executionTimeMs: 0,
        provider: integrationId,
        costUsd: 0,
        metadata: {},
      };
    }

    if (!adapter) {
      return {
        success: false,
        error: `Adapter not available for: ${integrationId}`,
        executionTimeMs: 0,
        provider: integrationId,
        costUsd: 0,
        metadata: {},
      };
    }

    if (config.status !== 'active') {
      return {
        success: false,
        error: `Integration is not active (status: ${config.status})`,
        executionTimeMs: 0,
        provider: integrationId,
        costUsd: 0,
        metadata: {},
      };
    }

    // Find the function definition
    const funcDef = config.functions.find(f => f.id === functionId || f.name === functionId);
    if (!funcDef) {
      return {
        success: false,
        error: `Function not found: ${functionId} in ${integrationId}`,
        executionTimeMs: 0,
        provider: integrationId,
        costUsd: 0,
        metadata: {},
      };
    }

    // Validate required parameters
    const validationError = this.validateParams(params, funcDef);
    if (validationError) {
      return {
        success: false,
        error: validationError,
        executionTimeMs: 0,
        provider: integrationId,
        costUsd: 0,
        metadata: {},
      };
    }

    // Execute with retry and timeout
    const effectiveTimeout = timeoutMs || funcDef.timeoutMs || DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const controller = new AbortController();
    this.activeExecutions.set(executionId, controller);

    try {
      const result = await this.executeWithRetry(
        adapter,
        functionId,
        params,
        userId,
        effectiveTimeout,
        controller,
      );

      const executionTimeMs = Date.now() - startTime;

      // Track execution
      await this.trackExecution({
        integrationId,
        functionId,
        userId,
        executionTimeMs,
        success: result.success,
        costUsd: result.costUsd,
        priority: priority || 'normal',
      });

      return {
        ...result,
        executionTimeMs,
        metadata: {
          ...result.metadata,
          executionId,
          integrationId,
          functionId,
        },
      };
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Cancel an active execution.
   */
  cancel(executionId: string): boolean {
    const controller = this.activeExecutions.get(executionId);
    if (controller) {
      controller.abort();
      this.activeExecutions.delete(executionId);
      return true;
    }
    return false;
  }

  /**
   * Execute a function with fallback to alternative integrations.
   */
  async executeWithFallback(
    request: ExecutionRequest,
    fallbackIntegrationIds: string[] = [],
  ): Promise<ExecutionResult> {
    // Try primary
    const primaryResult = await this.execute(request);
    if (primaryResult.success) return primaryResult;

    // Try fallbacks
    for (const fallbackId of fallbackIntegrationIds) {
      log.info('Trying fallback integration', {
        primary: request.integrationId,
        fallback: fallbackId,
        functionId: request.functionId,
      });

      const fallbackRequest: ExecutionRequest = {
        ...request,
        integrationId: fallbackId,
      };

      const fallbackResult = await this.execute(fallbackRequest);
      if (fallbackResult.success) {
        fallbackResult.metadata = {
          ...fallbackResult.metadata,
          fallbackFrom: request.integrationId,
        };
        return fallbackResult;
      }
    }

    // All failed — return the primary error
    return primaryResult;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async executeWithRetry(
    adapter: import('./types').IntegrationAdapter,
    functionId: string,
    params: Record<string, unknown>,
    userId: string,
    timeoutMs: number,
    controller: AbortController,
  ): Promise<ExecutionResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (controller.signal.aborted) {
        return {
          success: false,
          error: 'Execution cancelled',
          executionTimeMs: 0,
          provider: adapter.config.id,
          costUsd: 0,
          metadata: { cancelled: true },
        };
      }

      try {
        // Race the execution against timeout
        const result = await Promise.race([
          adapter.execute(functionId, params, userId),
          new Promise<never>((_, reject) => {
            const timer = setTimeout(() => {
              controller.abort();
              reject(new Error(`Execution timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            controller.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('Execution cancelled'));
            }, { once: true });
          }),
        ]);

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on validation/cancellation errors
        if (
          lastError.message.includes('cancelled') ||
          lastError.message.includes('not found') ||
          lastError.message.includes('Invalid')
        ) {
          break;
        }

        if (attempt < MAX_RETRIES) {
          const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
          log.info('Retrying execution', {
            functionId,
            attempt: attempt + 1,
            delayMs: delay,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Execution failed after retries',
      executionTimeMs: 0,
      provider: adapter.config.id,
      costUsd: 0,
      metadata: { retries: MAX_RETRIES },
    };
  }

  private validateParams(
    params: Record<string, unknown>,
    funcDef: IntegrationFunction,
  ): string | null {
    const requiredParams = funcDef.inputSchema.filter(p => p.required);

    for (const param of requiredParams) {
      if (params[param.name] === undefined || params[param.name] === null) {
        return `Missing required parameter: ${param.name} (${param.description})`;
      }

      // Type validation
      const value = params[param.name];
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== param.type && param.type !== 'file' && param.type !== 'stream') {
        // Allow numbers as strings and vice versa for flexibility
        if (
          !((param.type === 'number' && typeof value === 'string' && !isNaN(Number(value))) ||
            (param.type === 'string' && typeof value === 'number'))
        ) {
          return `Parameter ${param.name} must be of type ${param.type}, got ${actualType}`;
        }
      }

      // Enum validation
      if (param.enum && !param.enum.includes(String(value))) {
        return `Parameter ${param.name} must be one of: ${param.enum.join(', ')}`;
      }
    }

    return null;
  }

  private async trackExecution(details: {
    integrationId: string;
    functionId: string;
    userId: string;
    executionTimeMs: number;
    success: boolean;
    costUsd: number;
    priority: string;
  }): Promise<void> {
    try {
      await db.agentUsage.create({
        data: {
          agentId: details.integrationId,
          userId: details.userId,
          action: `integration:${details.functionId}`,
          duration: details.executionTimeMs,
          status: details.success ? 'success' : 'failed',
          metadata: JSON.stringify({
            integrationId: details.integrationId,
            functionId: details.functionId,
            costUsd: details.costUsd,
            priority: details.priority,
          }),
        },
      });

      if (details.costUsd > 0) {
        await db.aICost.create({
          data: {
            userId: details.userId,
            provider: details.integrationId,
            model: details.functionId,
            costUsd: details.costUsd,
          },
        });
      }
    } catch (dbError) {
      log.warn('Failed to track execution', {
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }
  }
}

// ============================================================
// Singleton
// ============================================================

let _executor: IntegrationExecutor | null = null;

export function getIntegrationExecutor(): IntegrationExecutor {
  if (!_executor) {
    _executor = new IntegrationExecutor();
  }
  return _executor;
}
