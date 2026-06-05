/**
 * Prometheus Metrics Registry — Genova.AI Monitoring
 *
 * Centralized metrics collection using prom-client. Exposes all custom
 * application metrics for Prometheus scraping via /api/monitoring/metrics.
 *
 * Metric naming follows Prometheus best practices:
 *   - namespace: genova_ai
 *   - suffix conventions: _total (counters), _seconds (histograms), no suffix (gauges)
 */

import promClient, { Registry, Counter, Histogram, Gauge } from 'prom-client';

// ============================================================
// TYPES
// ============================================================

export interface AIRequestLabels {
  provider: string;
  model: string;
  status: 'success' | 'error' | 'timeout' | 'rate_limited';
}

export interface AIRequestDurationLabels {
  provider: string;
  model: string;
}

export interface AITokenLabels {
  provider: string;
  model: string;
  type: 'input' | 'output';
}

export interface AICostLabels {
  provider: string;
  model: string;
}

export interface QueueJobLabels {
  queue: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
}

export interface QueueJobDurationLabels {
  queue: string;
}

export interface HTTPRequestLabels {
  method: string;
  route: string;
  status_code: string;
}

export interface HTTPRequestDurationLabels {
  method: string;
  route: string;
}

export interface ErrorLabels {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface CacheLabels {
  operation: 'hit' | 'miss';
}

// ============================================================
// CUSTOM REGISTRY
// ============================================================

const registry = new Registry();

// Default metrics (process CPU, memory, event loop lag, etc.)
promClient.collectDefaultMetrics({
  register: registry,
  prefix: 'genova_ai_',
});

// ============================================================
// AI METRICS
// ============================================================

/** Total AI API requests by provider/model/status */
const aiRequestsTotal = new Counter({
  name: 'genova_ai_requests_total',
  help: 'Total AI API requests by provider, model, and status',
  labelNames: ['provider', 'model', 'status'],
  registers: [registry],
});

/** AI request latency histogram */
const aiRequestDurationSeconds = new Histogram({
  name: 'genova_ai_request_duration_seconds',
  help: 'AI request latency in seconds',
  labelNames: ['provider', 'model'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
});

/** Token usage by type (input/output) */
const aiTokensTotal = new Counter({
  name: 'genova_ai_tokens_total',
  help: 'Total token usage by type (input/output)',
  labelNames: ['provider', 'model', 'type'],
  registers: [registry],
});

/** Total AI cost tracking in dollars */
const aiCostDollarsTotal = new Counter({
  name: 'genova_ai_cost_dollars_total',
  help: 'Total AI cost in USD by provider and model',
  labelNames: ['provider', 'model'],
  registers: [registry],
});

// ============================================================
// QUEUE METRICS
// ============================================================

/** Current jobs in each queue */
const queueJobsTotal = new Gauge({
  name: 'genova_queue_jobs_total',
  help: 'Current number of jobs in each queue by status',
  labelNames: ['queue', 'status'],
  registers: [registry],
});

/** Job processing time histogram */
const queueJobDurationSeconds = new Histogram({
  name: 'genova_queue_job_duration_seconds',
  help: 'Job processing duration in seconds by queue type',
  labelNames: ['queue'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300],
  registers: [registry],
});

// ============================================================
// HTTP METRICS
// ============================================================

/** HTTP requests by method/route/status */
const httpRequestsTotal = new Counter({
  name: 'genova_http_requests_total',
  help: 'Total HTTP requests by method, route, and status code',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

/** HTTP request latency histogram */
const httpRequestDurationSeconds = new Histogram({
  name: 'genova_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

// ============================================================
// SESSION & CONNECTION METRICS
// ============================================================

/** Active user sessions */
const activeSessions = new Gauge({
  name: 'genova_active_sessions',
  help: 'Number of active user sessions',
  registers: [registry],
});

/** Active SSE connections */
const activeSSEConnections = new Gauge({
  name: 'genova_active_sse_connections',
  help: 'Number of active Server-Sent Events connections',
  registers: [registry],
});

// ============================================================
// DATABASE METRICS
// ============================================================

/** Database query latency histogram */
const dbQueryDurationSeconds = new Histogram({
  name: 'genova_db_query_duration_seconds',
  help: 'Database query latency in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [registry],
});

// ============================================================
// ERROR METRICS
// ============================================================

/** Errors by type and severity */
const errorsTotal = new Counter({
  name: 'genova_errors_total',
  help: 'Total errors by type and severity',
  labelNames: ['type', 'severity'],
  registers: [registry],
});

// ============================================================
// WORKER & CACHE METRICS
// ============================================================

/** Worker pool CPU utilization */
const workerPoolUtilization = new Gauge({
  name: 'genova_worker_pool_utilization',
  help: 'Worker pool CPU utilization (0-1)',
  registers: [registry],
});

/** Cache hit rate */
const cacheHitRate = new Gauge({
  name: 'genova_cache_hit_rate',
  help: 'Cache hit rate (0-1)',
  registers: [registry],
});

// ============================================================
// CONVENIENCE METHODS
// ============================================================

/**
 * Track an AI API request — increments counters for requests, tokens, and cost.
 * Call this after every AI provider call completes.
 */
export function trackAIRequest(params: {
  provider: string;
  model: string;
  status: AIRequestLabels['status'];
  durationSeconds: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}): void {
  const { provider, model, status, durationSeconds, inputTokens = 0, outputTokens = 0, costUsd = 0 } = params;

  aiRequestsTotal.inc({ provider, model, status });
  aiRequestDurationSeconds.observe({ provider, model }, durationSeconds);

  if (inputTokens > 0) {
    aiTokensTotal.inc({ provider, model, type: 'input' }, inputTokens);
  }
  if (outputTokens > 0) {
    aiTokensTotal.inc({ provider, model, type: 'output' }, outputTokens);
  }
  if (costUsd > 0) {
    aiCostDollarsTotal.inc({ provider, model }, costUsd);
  }
}

/**
 * Track an HTTP request — increments request counter and observes duration.
 */
export function trackHTTPRequest(params: {
  method: string;
  route: string;
  statusCode: number;
  durationSeconds: number;
}): void {
  const { method, route, statusCode, durationSeconds } = params;

  httpRequestsTotal.inc({ method, route, status_code: String(statusCode) });
  httpRequestDurationSeconds.observe({ method, route }, durationSeconds);
}

/**
 * Track a queue job — observes processing duration and updates job counts.
 */
export function trackQueueJob(params: {
  queue: string;
  status: 'completed' | 'failed';
  durationSeconds: number;
}): void {
  const { queue, status, durationSeconds } = params;

  queueJobDurationSeconds.observe({ queue }, durationSeconds);
  // Increment completed/failed, decrement running
  queueJobsTotal.dec({ queue, status: 'running' });
  queueJobsTotal.inc({ queue, status });
}

/**
 * Track an error event.
 */
export function trackError(params: {
  type: string;
  severity: ErrorLabels['severity'];
}): void {
  errorsTotal.inc({ type: params.type, severity: params.severity });
}

/**
 * Update queue depth gauge. Call when jobs are enqueued or dequeued.
 */
export function setQueueDepth(queue: string, status: QueueJobLabels['status'], count: number): void {
  queueJobsTotal.set({ queue, status }, count);
}

/**
 * Set active session count.
 */
export function setActiveSessions(count: number): void {
  activeSessions.set(count);
}

/**
 * Set active SSE connection count.
 */
export function setActiveSSEConnections(count: number): void {
  activeSSEConnections.set(count);
}

/**
 * Observe a database query duration.
 */
export function trackDBQuery(params: {
  operation: string;
  table: string;
  durationSeconds: number;
}): void {
  dbQueryDurationSeconds.observe({ operation: params.operation, table: params.table }, params.durationSeconds);
}

/**
 * Set worker pool utilization (0-1).
 */
export function setWorkerPoolUtilization(utilization: number): void {
  workerPoolUtilization.set(Math.min(1, Math.max(0, utilization)));
}

/**
 * Set cache hit rate (0-1).
 */
export function setCacheHitRate(rate: number): void {
  cacheHitRate.set(Math.min(1, Math.max(0, rate)));
}

/**
 * Get all metrics in Prometheus exposition format.
 * This is the function called by the /api/monitoring/metrics endpoint.
 */
export async function getMetrics(): Promise<string> {
  return registry.metrics();
}

/**
 * Get the content type for the Prometheus response.
 */
export function getMetricsContentType(): string {
  return registry.contentType;
}

/**
 * Get the underlying registry for advanced usage.
 */
export function getRegistry(): Registry {
  return registry;
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

export const metricsRegistry = {
  // Core Prometheus objects
  registry,
  aiRequestsTotal,
  aiRequestDurationSeconds,
  aiTokensTotal,
  aiCostDollarsTotal,
  queueJobsTotal,
  queueJobDurationSeconds,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  activeSessions,
  activeSSEConnections,
  dbQueryDurationSeconds,
  errorsTotal,
  workerPoolUtilization,
  cacheHitRate,
  // Convenience functions
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
  getMetrics,
  getMetricsContentType,
  getRegistry,
};
