/**
 * OpenTelemetry Tracing — Genova.AI Distributed Tracing
 *
 * Configures the OpenTelemetry SDK with auto-instrumentation for
 * HTTP, Prisma, and ioredis. Exports traces to a configurable
 * OTLP endpoint (default: http://localhost:4318/v1/traces).
 *
 * Provides convenience wrappers for creating custom spans for
 * AI requests, queue jobs, and media generation operations.
 *
 * IMPORTANT: This module must be imported early in the application
 * lifecycle (before other imports that create HTTP servers or
 * database connections) for auto-instrumentation to work correctly.
 */

import { trace, SpanStatusCode, SpanKind, Tracer } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { createLogger } from '@/lib/logger';

const log = createLogger('monitoring:tracing');

// ============================================================
// CONFIGURATION
// ============================================================

const OTEL_EXPORTER_URL = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'genova-ai';
const SERVICE_VERSION = process.env.OTEL_SERVICE_VERSION || '1.0.0';
const TRACING_ENABLED = process.env.OTEL_TRACING_ENABLED !== 'false';

// ============================================================
// SDK INITIALIZATION
// ============================================================

let sdk: NodeSDK | null = null;
let isInitialized = false;

/**
 * Initialize the OpenTelemetry SDK.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initializeTracing(): void {
  if (isInitialized || !TRACING_ENABLED) {
    if (!TRACING_ENABLED) {
      log.info('OpenTelemetry tracing is disabled via OTEL_TRACING_ENABLED=false');
    }
    return;
  }

  try {
    const exporter = new OTLPTraceExporter({
      url: OTEL_EXPORTER_URL,
      headers: {},
    });

    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    });

    sdk = new NodeSDK({
      resource,
      traceExporter: exporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable instrumentations we don't need or that are noisy
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
          '@opentelemetry/instrumentation-net': { enabled: false },
          // HTTP instrumentation — keep enabled
          '@opentelemetry/instrumentation-http': {
            enabled: true,
            // Ignore health checks and metrics endpoints to reduce noise
            ignoreIncomingRequestHook: (req) => {
              const url = req.url || '';
              return url === '/api/monitoring/metrics' || url === '/health' || url.startsWith('/_next/');
            },
          },
          // Prisma and ioredis instrumentation are auto-detected when packages are available
          // No explicit config needed — they will be enabled automatically
        }),
      ],
    });

    sdk.start();
    isInitialized = true;

    log.info('OpenTelemetry tracing initialized', {
      exporterUrl: OTEL_EXPORTER_URL,
      serviceName: SERVICE_NAME,
    });

    // Graceful shutdown
    const shutdown = async () => {
      try {
        await sdk?.shutdown();
        log.info('OpenTelemetry SDK shut down gracefully');
      } catch (err) {
        log.error('Error shutting down OpenTelemetry SDK', { error: String(err) });
      }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    log.error('Failed to initialize OpenTelemetry tracing', { error: String(err) });
  }
}

// ============================================================
// TRACER
// ============================================================

/**
 * Get the Genova AI tracer for creating custom spans.
 */
export const tracer: Tracer = trace.getTracer('genova-ai', SERVICE_VERSION);

// ============================================================
// CONVENIENCE WRAPPER
// ============================================================

/**
 * Execute a function within a new OpenTelemetry span.
 * Automatically sets span status based on success/error.
 *
 * @param name - The name of the span
 * @param fn - The function to execute within the span
 * @param options - Optional span options (kind, attributes)
 * @returns The return value of fn
 *
 * @example
 * ```ts
 * const result = await withSpan('ai.chat.complete', async (span) => {
 *   span.setAttribute('provider', 'openrouter');
 *   span.setAttribute('model', 'gpt-4o');
 *   return await callAIProvider(...);
 * });
 * ```
 */
export async function withSpan<T>(
  name: string,
  fn: (span: ReturnType<typeof tracer.startSpan>) => Promise<T>,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  }
): Promise<T> {
  if (!TRACING_ENABLED || !isInitialized) {
    // Tracing disabled — just execute the function
    const dummySpan = {
      setAttribute: () => dummySpan,
      addEvent: () => dummySpan,
      setStatus: () => dummySpan,
      recordException: () => {},
      end: () => {},
    } as unknown as ReturnType<typeof tracer.startSpan>;
    return fn(dummySpan);
  }

  return tracer.startActiveSpan(name, { kind: options?.kind, attributes: options?.attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof Error) {
        span.recordException(err);
      }
      throw err;
    } finally {
      span.end();
    }
  });
}

// ============================================================
// DOMAIN-SPECIFIC SPAN HELPERS
// ============================================================

/**
 * Create a span for an AI provider request.
 * Usage: wrap AI API calls with this to capture provider, model, tokens, etc.
 */
export async function withAISpan<T>(
  provider: string,
  model: string,
  fn: (span: ReturnType<typeof tracer.startSpan>) => Promise<T>
): Promise<T> {
  return withSpan(`ai.request.${provider}`, fn, {
    kind: SpanKind.CLIENT,
    attributes: {
      'genova.ai.provider': provider,
      'genova.ai.model': model,
    },
  });
}

/**
 * Create a span for a queue job execution.
 */
export async function withQueueJobSpan<T>(
  queueName: string,
  jobId: string,
  fn: (span: ReturnType<typeof tracer.startSpan>) => Promise<T>
): Promise<T> {
  return withSpan(`queue.job.${queueName}`, fn, {
    kind: SpanKind.CONSUMER,
    attributes: {
      'genova.queue.name': queueName,
      'genova.queue.job_id': jobId,
    },
  });
}

/**
 * Create a span for a media generation operation.
 */
export async function withMediaGenerationSpan<T>(
  mediaType: string,
  provider: string,
  fn: (span: ReturnType<typeof tracer.startSpan>) => Promise<T>
): Promise<T> {
  return withSpan(`media.generate.${mediaType}`, fn, {
    kind: SpanKind.CLIENT,
    attributes: {
      'genova.media.type': mediaType,
      'genova.media.provider': provider,
    },
  });
}

/**
 * Create a span for a database operation.
 */
export async function withDBSpan<T>(
  operation: string,
  table: string,
  fn: (span: ReturnType<typeof tracer.startSpan>) => Promise<T>
): Promise<T> {
  return withSpan(`db.${operation}.${table}`, fn, {
    kind: SpanKind.CLIENT,
    attributes: {
      'genova.db.operation': operation,
      'genova.db.table': table,
    },
  });
}

// ============================================================
// CONTEXT PROPAGATION
// ============================================================

/**
 * Get the current active trace context for propagation
 * (e.g., passing trace ID to logs or external services).
 */
export function getCurrentTraceContext(): {
  traceId: string;
  spanId: string;
} | null {
  const span = trace.getActiveSpan();
  if (!span) return null;

  const ctx = span.spanContext();
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
  };
}

/**
 * Run a function with a linked parent context (for distributed tracing).
 */
export function withLinkedContext<T>(
  _parentContext: Record<string, string>,
  fn: () => Promise<T>
): Promise<T> {
  // For now, just run in the current context
  // Full W3C TraceContext propagation would require parsing the traceparent header
  return fn();
}

/**
 * Check if tracing is initialized and active.
 */
export function isTracingActive(): boolean {
  return isInitialized && TRACING_ENABLED;
}
