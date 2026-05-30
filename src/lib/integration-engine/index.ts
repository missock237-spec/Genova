/**
 * Integration Engine — Main Entry Point
 *
 * Initializes all adapters, starts the registry, and provides
 * a unified API for the Genova SaaS integration system.
 */

import { getIntegrationRegistry } from './registry';
import { getIntegrationExecutor } from './executor';
import { createLogger } from '@/lib/logger';

// Adapters
import { SpeechBrainAdapter } from './adapters/speechbrain';
import { BaileysAdapter } from './adapters/baileys';
import { N8nAdapter } from './adapters/n8n';
import { ComfyUIAdapter } from './adapters/comfyui';
import { PocketBaseAdapter } from './adapters/pocketbase';
import { CogVideoAdapter } from './adapters/cogvideo';

const log = createLogger('integration-engine');

// Re-export types and components
export type { IntegrationConfig, IntegrationFunction, IntegrationStatus, IntegrationCategory, ExecutionRequest, ExecutionResult, HealthCheckResult, ScanResult, IntegrationAdapter, } from './types';
export { scanProject } from './scanner';
export type { ScanOptions } from './scanner';
export { getIntegrationRegistry } from './registry';
export { getIntegrationExecutor } from './executor';

// ============================================================
// Engine Initialization
// ============================================================

let _initialized = false;

/**
 * Initialize the Integration Engine.
 * Registers all built-in adapters and starts health monitoring.
 */
export async function initializeIntegrationEngine(): Promise<void> {
  if (_initialized) {
    log.info('Integration engine already initialized');
    return;
  }

  log.info('Initializing Genova Integration Engine...');

  const registry = getIntegrationRegistry();

  // Register all built-in adapters
  const adapters = [
    new SpeechBrainAdapter(),
    new BaileysAdapter(),
    new N8nAdapter(),
    new ComfyUIAdapter(),
    new PocketBaseAdapter(),
    new CogVideoAdapter(),
  ];

  for (const adapter of adapters) {
    try {
      registry.register(adapter);
    } catch (error) {
      log.warn('Failed to register adapter', {
        id: adapter.config.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  _initialized = true;
  log.info('Integration Engine initialized', {
    adapters: adapters.length,
    integrations: registry.getAll().length,
  });
}

/**
 * Get all registered integrations.
 */
export function getAllIntegrations() {
  return getIntegrationRegistry().getAll();
}

/**
 * Get an integration by ID.
 */
export function getIntegration(id: string) {
  return getIntegrationRegistry().getById(id);
}

/**
 * Execute an integration function.
 */
export async function executeIntegration(request: import('./types').ExecutionRequest) {
  const executor = getIntegrationExecutor();
  return executor.execute(request);
}

/**
 * Activate an integration.
 */
export async function activateIntegration(id: string, userId: string) {
  const registry = getIntegrationRegistry();
  await registry.activate(id, userId);
}

/**
 * Deactivate an integration.
 */
export async function deactivateIntegration(id: string, userId: string) {
  const registry = getIntegrationRegistry();
  await registry.deactivate(id, userId);
}

/**
 * Run health checks on all integrations.
 */
export async function checkAllIntegrationsHealth() {
  const registry = getIntegrationRegistry();
  return registry.checkAllHealth();
}
