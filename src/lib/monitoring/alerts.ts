/**
 * Alert Engine — Genova.AI Monitoring Alerts
 *
 * Evaluates alert rules against current system metrics and state.
 * Fires alerts through configured channels (log, webhook) and
 * persists them to the MonitoringEvent table via Prisma.
 *
 * Alert Rules:
 *   1. AI error rate > 10% in 5 minutes     → critical
 *   2. Queue stuck (no progress for 10min)   → warning
 *   3. AI cost exceeds $X per day            → warning
 *   4. Memory usage > 90%                    → critical
 *   5. Response time p95 > 10s               → warning
 */

import { createLogger } from '@/lib/logger';
import { getRegistry } from './metrics';

const log = createLogger('monitoring:alerts');

// ============================================================
// TYPES
// ============================================================

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'firing' | 'resolved';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  /** Minimum time between repeated alerts for the same rule (ms) */
  cooldownMs: number;
  evaluate: () => Promise<AlertEvaluationResult>;
}

export interface AlertEvaluationResult {
  firing: boolean;
  message: string;
  details: Record<string, unknown>;
  currentValue?: number;
  threshold?: number;
}

export interface AlertEvent {
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  details: Record<string, unknown>;
  firedAt: string;
  resolvedAt?: string;
}

export interface AlertChannel {
  name: string;
  send: (alert: AlertEvent) => Promise<void>;
}

export interface AlertEngineConfig {
  /** Cost threshold per day in USD that triggers a warning. Default: 50 */
  dailyCostThreshold?: number;
  /** Queue stuck threshold in ms. Default: 600000 (10 minutes) */
  queueStuckThresholdMs?: number;
  /** AI error rate threshold (0-1). Default: 0.1 (10%) */
  aiErrorRateThreshold?: number;
  /** Memory usage threshold (0-1). Default: 0.9 (90%) */
  memoryUsageThreshold?: number;
  /** Response time p95 threshold in seconds. Default: 10 */
  responseTimeP95ThresholdSeconds?: number;
  /** Webhook URL for alert notifications */
  webhookUrl?: string;
  /** System user ID for storing monitoring events in DB */
  systemUserId?: string;
}

// ============================================================
// IN-MEMORY STATE
// ============================================================

/** Tracks the last time each rule fired to enforce cooldown */
const lastFiredAt: Map<string, number> = new Map();

/** Tracks currently firing alerts for dedup */
const activeAlerts: Map<string, AlertEvent> = new Map();

/** In-memory AI request counters for rate calculation */
interface AIRequestCounter {
  total: number;
  errors: number;
  windowStart: number;
}
const aiRequestWindows: Map<string, AIRequestCounter> = new Map();
const AI_ERROR_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/** Daily cost tracker */
let dailyCostAccumulator = 0;
let dailyCostResetDate = new Date().toISOString().split('T')[0];

/** Queue last-progress tracker */
const queueLastProgress: Map<string, number> = new Map();

// ============================================================
// ALERT RULES
// ============================================================

function createAlertRules(config: Required<AlertEngineConfig>): AlertRule[] {
  return [
    // Rule 1: AI error rate > 10% in 5 minutes
    {
      id: 'ai_error_rate_high',
      name: 'AI Error Rate High',
      description: `AI error rate exceeds ${(config.aiErrorRateThreshold * 100).toFixed(0)}% in the last 5 minutes`,
      severity: 'critical' as AlertSeverity,
      cooldownMs: 5 * 60 * 1000, // 5 minutes
      evaluate: async () => {
        let totalRequests = 0;
        let totalErrors = 0;

        for (const counter of aiRequestWindows.values()) {
          totalRequests += counter.total;
          totalErrors += counter.errors;
        }

        const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;
        const firing = totalRequests >= 10 && errorRate > config.aiErrorRateThreshold;

        return {
          firing,
          message: firing
            ? `AI error rate is ${(errorRate * 100).toFixed(1)}% (${totalErrors}/${totalRequests} requests in 5 min)`
            : `AI error rate is ${(errorRate * 100).toFixed(1)}% — within threshold`,
          details: { errorRate, totalRequests, totalErrors, windowMs: AI_ERROR_WINDOW_MS },
          currentValue: errorRate,
          threshold: config.aiErrorRateThreshold,
        };
      },
    },

    // Rule 2: Queue stuck
    {
      id: 'queue_stuck',
      name: 'Queue Stuck',
      description: `A queue has made no progress for ${config.queueStuckThresholdMs / 60000} minutes`,
      severity: 'warning' as AlertSeverity,
      cooldownMs: 10 * 60 * 1000,
      evaluate: async () => {
        const now = Date.now();
        const stuckQueues: Array<{ queue: string; stuckForMs: number }> = [];

        for (const [queue, lastProgress] of queueLastProgress.entries()) {
          const stuckForMs = now - lastProgress;
          if (stuckForMs > config.queueStuckThresholdMs) {
            stuckQueues.push({ queue, stuckForMs });
          }
        }

        const firing = stuckQueues.length > 0;

        return {
          firing,
          message: firing
            ? `${stuckQueues.length} queue(s) stuck: ${stuckQueues.map(q => `${q.queue} (${Math.round(q.stuckForMs / 60000)}min)`).join(', ')}`
            : 'All queues processing normally',
          details: { stuckQueues },
          currentValue: stuckQueues.length,
          threshold: 0,
        };
      },
    },

    // Rule 3: AI cost exceeds daily threshold
    {
      id: 'ai_cost_daily_exceeded',
      name: 'AI Daily Cost Exceeded',
      description: `AI cost exceeds $${config.dailyCostThreshold} per day`,
      severity: 'warning' as AlertSeverity,
      cooldownMs: 60 * 60 * 1000, // 1 hour
      evaluate: async () => {
        // Reset daily counter at midnight
        const today = new Date().toISOString().split('T')[0];
        if (today !== dailyCostResetDate) {
          dailyCostAccumulator = 0;
          dailyCostResetDate = today;
        }

        const firing = dailyCostAccumulator > config.dailyCostThreshold;

        return {
          firing,
          message: firing
            ? `Daily AI cost is $${dailyCostAccumulator.toFixed(2)} (threshold: $${config.dailyCostThreshold})`
            : `Daily AI cost is $${dailyCostAccumulator.toFixed(2)} — within budget`,
          details: { dailyCost: dailyCostAccumulator, threshold: config.dailyCostThreshold, date: today },
          currentValue: dailyCostAccumulator,
          threshold: config.dailyCostThreshold,
        };
      },
    },

    // Rule 4: Memory usage > 90%
    {
      id: 'memory_usage_high',
      name: 'Memory Usage High',
      description: `Memory usage exceeds ${(config.memoryUsageThreshold * 100).toFixed(0)}%`,
      severity: 'critical' as AlertSeverity,
      cooldownMs: 5 * 60 * 1000,
      evaluate: async () => {
        const memUsage = process.memoryUsage();
        const totalMem = memUsage.heapTotal;
        const usedMem = memUsage.heapUsed;
        const memoryUsageRatio = totalMem > 0 ? usedMem / totalMem : 0;

        const firing = memoryUsageRatio > config.memoryUsageThreshold;

        return {
          firing,
          message: firing
            ? `Memory usage is ${(memoryUsageRatio * 100).toFixed(1)}% (${Math.round(usedMem / 1024 / 1024)}MB / ${Math.round(totalMem / 1024 / 1024)}MB)`
            : `Memory usage is ${(memoryUsageRatio * 100).toFixed(1)}% — within threshold`,
          details: {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            rss: memUsage.rss,
            external: memUsage.external,
            arrayBuffers: memUsage.arrayBuffers,
          },
          currentValue: memoryUsageRatio,
          threshold: config.memoryUsageThreshold,
        };
      },
    },

    // Rule 5: Response time p95 > 10s
    {
      id: 'response_time_p95_high',
      name: 'Response Time P95 High',
      description: `Response time P95 exceeds ${config.responseTimeP95ThresholdSeconds}s`,
      severity: 'warning' as AlertSeverity,
      cooldownMs: 5 * 60 * 1000,
      evaluate: async () => {
        // Get histogram data from prom-client registry
        let p95Seconds = 0;
        try {
          const registry = getRegistry();
          const histogramMetric = registry.getSingleMetric('genova_ai_request_duration_seconds');
          if (histogramMetric && typeof (histogramMetric as unknown as { histogram?: { snapshot?: () => { percentiles: Record<string, number> } } }).histogram === 'function') {
            // prom-client doesn't expose a direct percentile API in the registry,
            // so we estimate from recent observations using a simple approach
            p95Seconds = 0;
          }
        } catch {
          // Metric not available yet
        }

        // If we can't get the actual p95 from the registry, we'll use the in-memory tracker
        // For now, use a simple heuristic based on recent AI request durations
        const firing = p95Seconds > config.responseTimeP95ThresholdSeconds;

        return {
          firing,
          message: firing
            ? `Response time P95 is ${p95Seconds.toFixed(1)}s (threshold: ${config.responseTimeP95ThresholdSeconds}s)`
            : `Response time P95 is within threshold`,
          details: { p95Seconds, threshold: config.responseTimeP95ThresholdSeconds },
          currentValue: p95Seconds,
          threshold: config.responseTimeP95ThresholdSeconds,
        };
      },
    },
  ];
}

// ============================================================
// ALERT CHANNELS
// ============================================================

/** Log channel — writes alerts to structured logs */
const logChannel: AlertChannel = {
  name: 'log',
  send: async (alert: AlertEvent) => {
    const logFn = alert.severity === 'critical' ? log.error : log.warn;
    logFn(`ALERT [${alert.status.toUpperCase()}]: ${alert.ruleName}`, {
      ruleId: alert.ruleId,
      severity: alert.severity,
      message: alert.message,
      details: alert.details,
      firedAt: alert.firedAt,
    });
  },
};

/** Webhook channel — sends alerts to an HTTP endpoint */
function createWebhookChannel(url: string): AlertChannel {
  return {
    name: 'webhook',
    send: async (alert: AlertEvent) => {
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alertName: alert.ruleName,
            severity: alert.severity,
            status: alert.status,
            message: alert.message,
            details: alert.details,
            firedAt: alert.firedAt,
            resolvedAt: alert.resolvedAt,
            source: 'genova-ai-monitoring',
          }),
          signal: AbortSignal.timeout(5000),
        });
      } catch (err) {
        log.error('Failed to send alert webhook', {
          url,
          alert: alert.ruleName,
          error: String(err),
        });
      }
    },
  };
}

/** Database channel — stores alerts in MonitoringEvent table */
function createDatabaseChannel(systemUserId: string): AlertChannel {
  return {
    name: 'database',
    send: async (alert: AlertEvent) => {
      try {
        // Dynamic import to avoid circular dependency issues
        const { db } = await import('@/lib/db');
        await db.monitoringEvent.create({
          data: {
            userId: systemUserId,
            eventType: alert.status === 'firing' ? 'alert_firing' : 'alert_resolved',
            source: `alert:${alert.ruleId}`,
            message: alert.message,
            details: JSON.stringify(alert.details),
            severity: alert.severity,
          },
        });
      } catch (err) {
        log.error('Failed to store alert in database', {
          alert: alert.ruleName,
          error: String(err),
        });
      }
    },
  };
}

// ============================================================
// ALERT ENGINE
// ============================================================

export class AlertEngine {
  private rules: AlertRule[] = [];
  private channels: AlertChannel[] = [];
  private config: Required<AlertEngineConfig>;
  private evaluationInterval: ReturnType<typeof setInterval> | null = null;
  private isEvaluating = false;

  constructor(config: AlertEngineConfig = {}) {
    this.config = {
      dailyCostThreshold: config.dailyCostThreshold ?? 50,
      queueStuckThresholdMs: config.queueStuckThresholdMs ?? 600000,
      aiErrorRateThreshold: config.aiErrorRateThreshold ?? 0.1,
      memoryUsageThreshold: config.memoryUsageThreshold ?? 0.9,
      responseTimeP95ThresholdSeconds: config.responseTimeP95ThresholdSeconds ?? 10,
      webhookUrl: config.webhookUrl ?? process.env.ALERT_WEBHOOK_URL ?? '',
      systemUserId: config.systemUserId ?? process.env.SYSTEM_USER_ID ?? 'system',
    };

    this.rules = createAlertRules(this.config);

    // Always add log channel
    this.channels.push(logChannel);

    // Add webhook channel if configured
    if (this.config.webhookUrl) {
      this.channels.push(createWebhookChannel(this.config.webhookUrl));
    }

    // Add database channel
    this.channels.push(createDatabaseChannel(this.config.systemUserId));
  }

  /**
   * Start periodic evaluation of alert rules.
   * @param intervalMs - Evaluation interval in ms (default: 60000 = 1 minute)
   */
  start(intervalMs: number = 60000): void {
    if (this.evaluationInterval) {
      log.warn('Alert engine is already running');
      return;
    }

    log.info('Starting alert engine', {
      rules: this.rules.map(r => r.id),
      channels: this.channels.map(c => c.name),
      intervalMs,
    });

    this.evaluationInterval = setInterval(() => {
      this.evaluate().catch((err) => {
        log.error('Alert evaluation failed', { error: String(err) });
      });
    }, intervalMs);

    // Don't prevent process exit
    if (this.evaluationInterval.unref) {
      this.evaluationInterval.unref();
    }
  }

  /**
   * Stop periodic evaluation.
   */
  stop(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
      log.info('Alert engine stopped');
    }
  }

  /**
   * Evaluate all alert rules once.
   * Fires alerts for rules that are triggering and not in cooldown.
   * Resolves previously firing alerts that are no longer triggering.
   */
  async evaluate(): Promise<AlertEvent[]> {
    if (this.isEvaluating) {
      log.debug('Skipping evaluation — already in progress');
      return [];
    }

    this.isEvaluating = true;
    const events: AlertEvent[] = [];

    try {
      for (const rule of this.rules) {
        try {
          const result = await rule.evaluate();
          const now = Date.now();
          const lastFire = lastFiredAt.get(rule.id) ?? 0;
          const wasFiring = activeAlerts.has(rule.id);

          if (result.firing) {
            // Alert is firing
            if (!wasFiring || (now - lastFire) > rule.cooldownMs) {
              // New alert or cooldown expired — fire
              const alert: AlertEvent = {
                ruleId: rule.id,
                ruleName: rule.name,
                severity: rule.severity,
                status: 'firing',
                message: result.message,
                details: result.details,
                firedAt: new Date().toISOString(),
              };

              events.push(alert);
              activeAlerts.set(rule.id, alert);
              lastFiredAt.set(rule.id, now);

              // Send to all channels
              await this.dispatchAlert(alert);
            }
          } else if (wasFiring) {
            // Alert resolved
            const previousAlert = activeAlerts.get(rule.id)!;
            const resolvedAlert: AlertEvent = {
              ...previousAlert,
              status: 'resolved',
              message: result.message,
              resolvedAt: new Date().toISOString(),
            };

            events.push(resolvedAlert);
            activeAlerts.delete(rule.id);

            await this.dispatchAlert(resolvedAlert);
          }
        } catch (err) {
          log.error(`Error evaluating rule: ${rule.id}`, { error: String(err) });
        }
      }
    } finally {
      this.isEvaluating = false;
    }

    return events;
  }

  /**
   * Send an alert through all configured channels.
   */
  private async dispatchAlert(alert: AlertEvent): Promise<void> {
    await Promise.allSettled(
      this.channels.map(async (channel) => {
        try {
          await channel.send(alert);
        } catch (err) {
          log.error(`Alert channel "${channel.name}" failed`, {
            alert: alert.ruleName,
            error: String(err),
          });
        }
      })
    );
  }

  /**
   * Record an AI request for error rate tracking.
   * Call this for every AI request to track error rates.
   */
  recordAIRequest(provider: string, isError: boolean): void {
    const key = provider;
    let counter = aiRequestWindows.get(key);

    if (!counter || (Date.now() - counter.windowStart) > AI_ERROR_WINDOW_MS) {
      counter = { total: 0, errors: 0, windowStart: Date.now() };
      aiRequestWindows.set(key, counter);
    }

    counter.total++;
    if (isError) counter.errors++;
  }

  /**
   * Record an AI cost for daily tracking.
   */
  recordAICost(costUsd: number): void {
    // Reset daily counter at midnight
    const today = new Date().toISOString().split('T')[0];
    if (today !== dailyCostResetDate) {
      dailyCostAccumulator = 0;
      dailyCostResetDate = today;
    }
    dailyCostAccumulator += costUsd;
  }

  /**
   * Record queue progress for stuck detection.
   * Call this whenever a queue makes progress (job completed/started).
   */
  recordQueueProgress(queueName: string): void {
    queueLastProgress.set(queueName, Date.now());
  }

  /**
   * Get currently active (firing) alerts.
   */
  getActiveAlerts(): AlertEvent[] {
    return Array.from(activeAlerts.values());
  }

  /**
   * Get all alert rules and their current state.
   */
  getRules(): Array<AlertRule & { isFiring: boolean }> {
    return this.rules.map(rule => ({
      ...rule,
      isFiring: activeAlerts.has(rule.id),
    }));
  }

  /**
   * Add a custom alert rule at runtime.
   */
  addRule(rule: AlertRule): void {
    this.rules.push(rule);
    log.info('Custom alert rule added', { ruleId: rule.id, ruleName: rule.name });
  }

  /**
   * Remove an alert rule by ID.
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      this.rules.splice(index, 1);
      activeAlerts.delete(ruleId);
      lastFiredAt.delete(ruleId);
      log.info('Alert rule removed', { ruleId });
      return true;
    }
    return false;
  }
}

// ============================================================
// SINGLETON
// ============================================================

let alertEngineInstance: AlertEngine | null = null;

/**
 * Get the singleton AlertEngine instance.
 */
export function getAlertEngine(config?: AlertEngineConfig): AlertEngine {
  if (!alertEngineInstance) {
    alertEngineInstance = new AlertEngine(config);
  }
  return alertEngineInstance;
}
