/**
 * @module observability
 * @description Point d'entrée du système d'observabilité Gen3ia.
 * Réexporte les types, le journaliseur, le collecteur de métriques
 * et le traceur distribué.
 */

export type {
  LogLevel,
  LogEntry,
  LogError,
  MetricPoint,
  Span,
} from './types';

export { Logger, createLogger } from './logger';
export type { LoggerOptions } from './logger';

export { MetricsCollector, globalMetrics } from './metrics';

export {
  Tracer,
  globalTracer,
  generateCorrelationId,
  generateTraceId,
  generateSpanId,
} from './tracing';
