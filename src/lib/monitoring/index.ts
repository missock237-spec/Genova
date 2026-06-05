/**
 * Genova.AI Monitoring — Unified Exports
 *
 * Single entry point for all monitoring functionality:
 *   - Prometheus metrics (prom-client)
 *   - OpenTelemetry tracing
 *   - Alert engine
 *
 * Usage:
 *   import { initializeMonitoring, trackAIRequest, withSpan } from '@/lib/monitoring';
 */

// ============================================================
// METRICS EXPORTS
// ============================================================

export {
  metricsRegistry,
  getMetrics,
  getMetricsContentType,
  getRegistry,
  trackAIRequest,
  trackHTTPRequest,
  trackQueueJob,
  trackError,
  setQueueDepth,
  setActiveSessions,
  setActiveSSEConnections,
  trackDBQuery,
  setWorkerPoolUtilization,
  setCacheHitRate,
} from './metrics';

export type {
  AIRequestLabels,
  AIRequestDurationLabels,
  AITokenLabels,
  AICostLabels,
  QueueJobLabels,
  QueueJobDurationLabels,
  HTTPRequestLabels,
  HTTPRequestDurationLabels,
  ErrorLabels,
  CacheLabels,
} from './metrics';

// ============================================================
// TRACING EXPORTS
// ============================================================

export {
  tracer,
  withSpan,
  withAISpan,
  withQueueJobSpan,
  withMediaGenerationSpan,
  withDBSpan,
  getCurrentTraceContext,
  isTracingActive,
  initializeTracing,
} from './tracing';

// ============================================================
// ALERTS EXPORTS
// ============================================================

export {
  AlertEngine,
  getAlertEngine,
} from './alerts';

export type {
  AlertSeverity,
  AlertStatus,
  AlertRule,
  AlertEvaluationResult,
  AlertEvent,
  AlertChannel,
  AlertEngineConfig,
} from './alerts';

// ============================================================
// INITIALIZATION
// ============================================================

import { createLogger } from '@/lib/logger';
import { initializeTracing } from './tracing';
import { getAlertEngine } from './alerts';
import type { AlertEngineConfig } from './alerts';

const log = createLogger('monitoring');

export interface MonitoringConfig {
  /** Enable/disable OpenTelemetry tracing (default: true) */
  tracing?: boolean;
  /** Enable/disable alert engine (default: true) */
  alerts?: boolean;
  /** Alert engine configuration */
  alertConfig?: AlertEngineConfig;
  /** Alert evaluation interval in ms (default: 60000) */
  alertEvaluationIntervalMs?: number;
}

/**
 * Initialize the full monitoring stack.
 *
 * - Starts OpenTelemetry tracing with auto-instrumentation
 * - Starts the alert engine with periodic rule evaluation
 *
 * Call this once at application startup. Safe to call multiple times.
 */
export function initializeMonitoring(config: MonitoringConfig = {}): void {
  log.info('Initializing Genova.AI monitoring stack', {
    tracing: config.tracing !== false,
    alerts: config.alerts !== false,
  });

  // 1. Initialize OpenTelemetry tracing
  if (config.tracing !== false) {
    try {
      initializeTracing();
    } catch (err) {
      log.error('Failed to initialize tracing', { error: String(err) });
    }
  }

  // 2. Initialize and start alert engine
  if (config.alerts !== false) {
    try {
      const engine = getAlertEngine(config.alertConfig);
      engine.start(config.alertEvaluationIntervalMs ?? 60000);
    } catch (err) {
      log.error('Failed to initialize alert engine', { error: String(err) });
    }
  }

  log.info('Genova.AI monitoring stack initialized');
}
