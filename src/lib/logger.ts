// ============================================================
// Gen3ia — Logger structuré avec transport Loki (Phase 3.1)
// Supporte: console (dev), Loki (prod), Sentry (errors)
// Niveaux : DEBUG, INFO, WARN, ERROR, CRITICAL
// Sampling : events à haut volume (infoSampled / debugSampled)
// Correlation ID : injecté depuis correlationManager quand présent
// ============================================================

// (createHmac non utilisé — retiré pour un fichier propre)

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  correlationId?: string;
  context?: Record<string, unknown>;
  error?: Error;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  critical: 4,
};

const CURRENT_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

class LokiTransport {
  private url: string;
  private batch: Array<{ stream: Record<string, string>; values: Array<[string, string]> }> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private maxBatchSize = 100;
  private flushIntervalMs = 5000;
  private enabled: boolean;

  constructor() {
    this.url = process.env.LOKI_URL || process.env.GRAFANA_LOKI_URL || '';
    this.enabled = !!(this.url && process.env.NODE_ENV === 'production');
    if (this.enabled) {
      this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
      process.on('beforeExit', () => this.flush());
    }
  }

  push(entry: LogEntry): void {
    if (!this.enabled) return;

    const labels: Record<string, string> = {
      service: entry.service || 'gen3ia',
      level: entry.level,
      app: 'gen3ia',
      env: process.env.NODE_ENV || 'production',
    };

    if (entry.level === 'error' || entry.level === 'critical') {
      labels.error_type = entry.level === 'critical' ? 'critical' : 'application_error';
    }
    if (entry.correlationId) {
      labels.correlation_id = entry.correlationId.slice(0, 16);
    }

    const logLine = entry.context
      ? JSON.stringify({ message: entry.message, ...(entry.correlationId ? { correlationId: entry.correlationId } : {}), ...entry.context })
      : entry.message;

    const streamKey = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    let stream = this.batch.find(s => {
      const existing = Object.entries(s.stream)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      return existing === streamKey;
    });

    if (!stream) {
      stream = { stream: labels, values: [] };
      this.batch.push(stream);
    }

    stream.values.push([`${Date.now() * 1_000_000}`, logLine]);

    if (this.batch.reduce((acc, s) => acc + s.values.length, 0) >= this.maxBatchSize) {
      this.flush();
    }
  }

  private flush(): void {
    if (this.batch.length === 0) return;
    const batch = this.batch;
    this.batch = [];

    fetch(`${this.url}/loki/api/v1/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ streams: batch }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      // Silencieux — ne pas logguer une erreur de log
    });
  }

  private getAuthHeaders(): Record<string, string> {
    const user = process.env.LOKI_USER || process.env.GRAFANA_LOKI_USER || '';
    const pass = process.env.LOKI_PASSWORD || process.env.GRAFANA_LOKI_PASSWORD || '';
    if (user && pass) {
      const token = Buffer.from(`${user}:${pass}`).toString('base64');
      return { Authorization: `Basic ${token}` };
    }
    const token = process.env.GRAFANA_LOKI_TOKEN || '';
    if (token) return { Authorization: `Bearer ${token}` };
    return {};
  }

  async sendSync(entry: LogEntry): Promise<void> {
    if (!this.enabled) return;
    const labels = {
      service: entry.service || 'gen3ia',
      level: entry.level,
      app: 'gen3ia',
      env: process.env.NODE_ENV || 'production',
    };
    try {
      await fetch(`${this.url}/loki/api/v1/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({
          streams: [{
            stream: labels,
            values: [[`${Date.now() * 1_000_000}`, JSON.stringify({ message: entry.message, ...entry.context })]],
          }],
        }),
        signal: AbortSignal.timeout(2000),
      });
    } catch { /* silencieux */ }
  }
}

const loki = new LokiTransport();

class Logger {
  private service: string;
  private isProd = process.env.NODE_ENV === 'production';
  private isTest = process.env.NODE_ENV === 'test';

  constructor(service: string = 'gen3ia') {
    this.service = service;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LEVEL];
  }

  /** Correlation ID courant (via correlationManager), sans import circulaire. */
  private getCorrelationId(): string | undefined {
    try {
      // Lazy-load correlationManager to avoid circular dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { correlationManager } = require('./correlation-id');
      return correlationManager.getCurrentId() ?? undefined;
    } catch {
      return undefined;
    }
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (this.isTest || !this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      correlationId: this.getCorrelationId(),
      context,
    };

    loki.push(entry);

    if (this.isProd) {
      console[level === 'critical' ? 'error' : level](JSON.stringify(entry));
      if (level === 'error' || level === 'critical') this.captureSentry(message, level, context);
    } else {
      const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${this.service}]`;
      console[level === 'critical' ? 'error' : level](`${prefix} ${message}${context ? ' ' + JSON.stringify(context) : ''}`);
    }
  }

  private captureSentry(message: string, level: LogLevel, context?: Record<string, unknown>): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/nextjs');
      if (Sentry?.captureException) {
        const error = context?.error instanceof Error ? context.error : new Error(message);
        Sentry.captureException(error, {
          level: level === 'critical' ? 'fatal' : 'error',
          tags: { service: this.service },
          extra: context || {},
        });
      }
    } catch { /* Sentry non installé */ }
  }

  debug(message: string, context?: Record<string, unknown>): void { this.log('debug', message, context); }
  info(message: string, context?: Record<string, unknown>): void { this.log('info', message, context); }
  warn(message: string, context?: Record<string, unknown>): void { this.log('warn', message, context); }
  error(message: string, context?: Record<string, unknown>): void {
    if (context?.error instanceof Error) {
      const { error, ...rest } = context;
      this.log('error', message, { ...rest, errorMessage: error.message, stack: error.stack });
    } else this.log('error', message, context);
  }
  /** Niveau maximum : erreur critique nécessitant une action immédiate (phase 3.1). */
  critical(message: string, context?: Record<string, unknown>): void {
    this.log('critical', message, context);
  }

  // ---------- Sampling (événements à haut volume, Phase 3.1) ----------
  /** Log info échantillonné : ne loggue qu'environ `ratio` (0..1) des appels. */
  infoSampled(message: string, ratio: number, context?: Record<string, unknown>): void {
    if (Math.random() < ratio) this.info(message, context);
  }
  debugSampled(message: string, ratio: number, context?: Record<string, unknown>): void {
    if (Math.random() < ratio) this.debug(message, context);
  }

  async fatalSync(message: string, context?: Record<string, unknown>): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'critical',
      message: `FATAL: ${message}`,
      service: this.service,
      correlationId: this.getCorrelationId(),
      context: { ...context, fatal: true },
    };
    console.error(JSON.stringify(entry));
    await loki.sendSync(entry);
  }

  /**
   * Log API request with performance metrics
   */
  logRequest(
    method: string,
    endpoint: string,
    status: number,
    duration: number,
    userId?: string,
    error?: Error,
  ): void {
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    this.log(level, `${method} ${endpoint} ${status}`, {
      method,
      endpoint,
      status,
      duration,
      userId,
      ...(error && { error: error.message, stack: error.stack }),
    });
  }

  /**
   * Log security event (for audit trail)
   */
  logSecurityEvent(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    userId?: string,
    context?: Record<string, unknown>,
  ): void {
    const level = severity === 'critical' ? 'error' : severity === 'high' ? 'warn' : 'info';
    this.log(level, `[SECURITY] ${event}`, {
      severity,
      userId,
      eventType: 'security',
      ...context,
    });
  }

  /**
   * Log business event (for audit trail)
   */
  logBusinessEvent(
    action: string,
    actor: string,
    resource: string,
    details?: Record<string, unknown>,
  ): void {
    this.log('info', `[AUDIT] ${action}`, {
      action,
      actor,
      resource,
      eventType: 'audit',
      ...details,
    });
  }

  /**
   * Log database operation
   */
  logDatabaseOp(
    operation: string,
    table: string,
    duration: number,
    rowsAffected?: number,
    error?: Error,
  ): void {
    const level = error ? 'error' : duration > 1000 ? 'warn' : 'debug';
    this.log(level, `DB ${operation} on ${table} [${duration}ms]`, {
      operation,
      table,
      duration,
      rowsAffected,
      ...(error && { error: error.message }),
    });
  }

  /**
   * Log external API call
   */
  logExternalCall(
    service: string,
    endpoint: string,
    method: string,
    status: number,
    duration: number,
    error?: Error,
  ): void {
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'debug';
    this.log(level, `External: ${service} ${method} ${endpoint} [${status}]`, {
      service,
      endpoint,
      method,
      status,
      duration,
      ...(error && { error: error.message }),
    });
  }

  child(service: string): Logger {
    return new Logger(service);
  }
}

export function createLogger(service: string): Logger {
  return new Logger(service);
}
// ============================================================
// Pino logger (legacy) — usage limité.
// La classe Logger ci-dessus est le logger principal.
// Ce pino logger est gardé pour rétrocompatibilité mais le transport
// pino-loki est DÉSACTIVÉ car le package n'est pas installé.
// Les logs Loki sont gérés par la classe LokiTransport ci-dessus via fetch.
// ============================================================
let _pinoInstance: ReturnType<typeof import('pino').default> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pinoMod = require('pino');
  const level = process.env.LOG_LEVEL || 'info';
  _pinoInstance = pinoMod({
    level,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    timestamp: pinoMod.stdTimeFunctions?.isoTime,
    // TRANSPORT LOKI SUPPRIMÉ — pino-loki n'est pas dans les dépendances.
    // Si LOKI_HOST est défini, la classe LokiTransport ci-dessus s'en charge.
  });
} catch {
  // pino non disponible — on utilisera le noop
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const logger: any = _pinoInstance || {
  info: () => {}, error: () => {}, warn: () => {}, debug: () => {},
  child: function() { return this; },
};
export default logger;
