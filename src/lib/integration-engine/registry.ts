/**
 * Integration Registry — Genova Integration Engine
 *
 * Central registry for all integrations. Manages lifecycle:
 * discovery → installation → activation → execution → deactivation
 *
 * Uses in-memory store with optional database persistence.
 */

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import type {
  IntegrationConfig,
  IntegrationAdapter,
  IntegrationEvent,
  IntegrationStatus,
  HealthCheckResult,
} from './types';

const log = createLogger('integration-registry');

// ============================================================
// Registry Store
// ============================================================

class IntegrationRegistry {
  private adapters = new Map<string, IntegrationAdapter>();
  private configs = new Map<string, IntegrationConfig>();
  private healthChecks = new Map<string, HealthCheckResult>();
  private eventListeners = new Map<string, Array<(event: IntegrationEvent) => void>>();

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  /**
   * Register a new integration adapter.
   */
  register(adapter: IntegrationAdapter): void {
    const config = adapter.config;

    if (this.adapters.has(config.id)) {
      log.warn('Integration already registered, replacing', { id: config.id });
    }

    this.adapters.set(config.id, adapter);
    this.configs.set(config.id, config);

    log.info('Integration registered', {
      id: config.id,
      name: config.displayName,
      functions: config.functions.length,
    });

    this.emitEvent({
      type: 'discovered',
      integrationId: config.id,
      timestamp: new Date(),
      details: { name: config.displayName, category: config.category },
    });
  }

  /**
   * Unregister an integration.
   */
  async unregister(integrationId: string): Promise<void> {
    const adapter = this.adapters.get(integrationId);
    if (adapter) {
      await adapter.shutdown().catch(err => {
        log.warn('Error shutting down adapter', { id: integrationId, error: String(err) });
      });
    }

    this.adapters.delete(integrationId);
    this.configs.delete(integrationId);
    this.healthChecks.delete(integrationId);

    log.info('Integration unregistered', { id: integrationId });
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  getAll(): IntegrationConfig[] {
    return Array.from(this.configs.values());
  }

  getById(id: string): IntegrationConfig | undefined {
    return this.configs.get(id);
  }

  getAdapter(id: string): IntegrationAdapter | undefined {
    return this.adapters.get(id);
  }

  getByCategory(category: string): IntegrationConfig[] {
    return this.getAll().filter(c => c.category === category);
  }

  getByStatus(status: IntegrationStatus): IntegrationConfig[] {
    return this.getAll().filter(c => c.status === status);
  }

  getHealthCheck(id: string): HealthCheckResult | undefined {
    return this.healthChecks.get(id);
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Activate an integration — initialize its adapter and mark as active.
   */
  async activate(integrationId: string, userId: string): Promise<void> {
    const adapter = this.adapters.get(integrationId);
    const config = this.configs.get(integrationId);

    if (!adapter || !config) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    if (config.status === 'active') {
      log.info('Integration already active', { id: integrationId });
      return;
    }

    try {
      this.updateStatus(integrationId, 'installing');

      await adapter.initialize();

      this.updateStatus(integrationId, 'active');

      // Persist to database
      await this.persistIntegration(config, userId);

      log.info('Integration activated', { id: integrationId });

      this.emitEvent({
        type: 'activated',
        integrationId,
        timestamp: new Date(),
        details: { userId },
      });
    } catch (error) {
      this.updateStatus(integrationId, 'error', error instanceof Error ? error.message : 'Activation failed');

      log.error('Integration activation failed', {
        id: integrationId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Deactivate an integration.
   */
  async deactivate(integrationId: string, userId: string): Promise<void> {
    const adapter = this.adapters.get(integrationId);
    const config = this.configs.get(integrationId);

    if (!config) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    try {
      if (adapter) {
        await adapter.shutdown();
      }

      this.updateStatus(integrationId, 'inactive');

      log.info('Integration deactivated', { id: integrationId });

      this.emitEvent({
        type: 'deactivated',
        integrationId,
        timestamp: new Date(),
        details: { userId },
      });
    } catch (error) {
      this.updateStatus(integrationId, 'error', error instanceof Error ? error.message : 'Deactivation failed');
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Health Checks
  // -----------------------------------------------------------------------

  /**
   * Run a health check on an integration.
   */
  async checkHealth(integrationId: string): Promise<HealthCheckResult> {
    const adapter = this.adapters.get(integrationId);

    if (!adapter) {
      return {
        healthy: false,
        responseTimeMs: 0,
        error: 'Adapter not found',
        checkedAt: new Date(),
      };
    }

    try {
      const result = await adapter.healthCheck();
      this.healthChecks.set(integrationId, result);

      // Update config status based on health
      if (result.healthy && this.configs.get(integrationId)?.status !== 'active') {
        this.updateStatus(integrationId, 'active');
      } else if (!result.healthy && this.configs.get(integrationId)?.status === 'active') {
        this.updateStatus(integrationId, 'error', result.error);
      }

      this.emitEvent({
        type: 'health_check',
        integrationId,
        timestamp: new Date(),
        details: { healthy: result.healthy, responseTimeMs: result.responseTimeMs },
      });

      return result;
    } catch (error) {
      const result: HealthCheckResult = {
        healthy: false,
        responseTimeMs: 0,
        error: error instanceof Error ? error.message : 'Health check failed',
        checkedAt: new Date(),
      };
      this.healthChecks.set(integrationId, result);
      return result;
    }
  }

  /**
   * Run health checks on all active integrations.
   */
  async checkAllHealth(): Promise<Record<string, HealthCheckResult>> {
    const results: Record<string, HealthCheckResult> = {};
    const activeIds = this.getByStatus('active').map(c => c.id);

    await Promise.allSettled(
      activeIds.map(async (id) => {
        results[id] = await this.checkHealth(id);
      }),
    );

    return results;
  }

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  onEvent(listener: (event: IntegrationEvent) => void): () => void {
    const id = Math.random().toString(36).slice(2);
    const listeners = this.eventListeners.get(id) || [];
    listeners.push(listener);
    this.eventListeners.set(id, listeners);

    return () => {
      this.eventListeners.delete(id);
    };
  }

  private emitEvent(event: IntegrationEvent): void {
    for (const listeners of this.eventListeners.values()) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // Swallow event listener errors
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private updateStatus(id: string, status: IntegrationStatus, error?: string): void {
    const config = this.configs.get(id);
    if (config) {
      config.status = status;
      config.error = error;
      config.lastHealthCheck = status === 'active' || status === 'error' ? new Date() : config.lastHealthCheck;
    }
  }

  private async persistIntegration(config: IntegrationConfig, userId: string): Promise<void> {
    try {
      await db.userResource.upsert({
        where: {
          id: config.id,
        },
        create: {
          id: config.id,
          type: 'integration',
          name: config.displayName,
          config: JSON.stringify({
            category: config.category,
            version: config.version,
            functions: config.functions.map(f => f.id),
            repository: config.repository,
            homepage: config.homepage,
          }),
          endpoint: config.apiBaseUrl,
          isActive: config.status === 'active',
          userId,
        },
        update: {
          isActive: config.status === 'active',
          config: JSON.stringify({
            category: config.category,
            version: config.version,
            functions: config.functions.map(f => f.id),
            repository: config.repository,
            homepage: config.homepage,
          }),
        },
      });
    } catch (dbError) {
      log.warn('Failed to persist integration to DB', {
        id: config.id,
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }
  }
}

// ============================================================
// Singleton
// ============================================================

let _registry: IntegrationRegistry | null = null;

export function getIntegrationRegistry(): IntegrationRegistry {
  if (!_registry) {
    _registry = new IntegrationRegistry();
  }
  return _registry;
}

export { IntegrationRegistry };
