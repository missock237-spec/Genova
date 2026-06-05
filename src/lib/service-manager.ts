/**
 * Genova Service Manager — Production-Ready Microservice Orchestrator
 *
 * Manages the lifecycle of all Genova microservices as child processes
 * of the Next.js server. Provides health monitoring, auto-restart with
 * exponential backoff, graceful shutdown, dependency-ordered startup,
 * and an event-driven API for the rest of the application.
 *
 * Architecture:
 *   - Singleton pattern (one instance per process)
 *   - EventEmitter for real-time status updates
 *   - Periodic health checks via HTTP
 *   - Dependency-aware startup ordering (topological sort)
 *   - Graceful shutdown with SIGTERM → SIGKILL escalation
 *   - Structured logging via the centralized logger
 *   - Restart budget per service with exponential backoff + jitter
 *
 * Usage:
 *   import { getServiceManager } from '@/lib/service-manager';
 *   const sm = getServiceManager();
 *   await sm.startAll();
 *   sm.on('service:status', (evt) => { ... });
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@/lib/logger';

// ============================================================
// Types
// ============================================================

/** Possible states a managed service can be in */
export type ServiceStatus =
  | 'stopped'      // Not running, not attempted
  | 'starting'     // Spawned but not yet confirmed healthy
  | 'running'      // Process alive AND health check passing
  | 'degraded'     // Process alive but health check failing
  | 'stopping'     // Graceful shutdown in progress
  | 'crashed'      // Process exited unexpectedly
  | 'failed';      // Exhausted restart budget; requires manual intervention

/** Event map emitted by the ServiceManager */
export interface ServiceManagerEvents {
  'service:status': (event: ServiceStatusEvent) => void;
  'service:health': (event: ServiceHealthEvent) => void;
  'service:log': (event: ServiceLogEvent) => void;
  'manager:ready': () => void;
  'manager:shutdown': () => void;
  'manager:error': (error: Error) => void;
}

export interface ServiceStatusEvent {
  serviceId: string;
  previousStatus: ServiceStatus;
  newStatus: ServiceStatus;
  timestamp: Date;
  details?: string;
}

export interface ServiceHealthEvent {
  serviceId: string;
  healthy: boolean;
  responseTimeMs: number;
  timestamp: Date;
  error?: string;
  data?: unknown;
}

export interface ServiceLogEvent {
  serviceId: string;
  stream: 'stdout' | 'stderr';
  data: string;
  timestamp: Date;
}

/** Static definition of a service to manage */
export interface ServiceDefinition {
  /** Unique identifier (kebab-case) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Command to execute (resolved against PATH or absolute) */
  command: string;
  /** Arguments passed to the command */
  args: string[];
  /** Working directory for the child process */
  cwd: string;
  /** Port the service listens on */
  port: number;
  /** HTTP path for health checks (GET) */
  healthPath: string;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** IDs of services that must be running before this one starts */
  dependsOn?: string[];
  /** Whether to auto-restart on unexpected exit */
  autoRestart: boolean;
  /** Maximum restart attempts within the restart window */
  maxRestarts: number;
  /** Window in ms within which maxRestarts is counted */
  restartWindowMs: number;
  /** Base delay in ms for exponential backoff on restart */
  restartDelayMs: number;
  /** Maximum backoff delay in ms */
  maxRestartDelayMs: number;
  /** Grace period in ms after spawn before first health check */
  startupGraceMs: number;
  /** Health check interval in ms */
  healthCheckIntervalMs: number;
  /** Health check request timeout in ms */
  healthCheckTimeoutMs: number;
  /** Time in ms to wait for graceful SIGTERM before SIGKILL */
  shutdownTimeoutMs: number;
  /** Stagger delay in ms between sequential service starts */
  startStaggerMs: number;
  /** Optional category for grouping */
  category?: string;
  /** Optional description */
  description?: string;
  /** Optional icon name for UI */
  icon?: string;
}

/** Runtime state of a managed service */
export interface ServiceRuntime {
  definition: ServiceDefinition;
  process: ChildProcess | null;
  status: ServiceStatus;
  pid: number | undefined;
  startedAt: Date | null;
  lastHealthCheckAt: Date | null;
  lastHealthyAt: Date | null;
  restartCount: number;
  restartTimestamps: Date[];
  lastExitCode: number | null;
  lastExitSignal: string | null;
  lastError: string | null;
  uptimeMs: number;
  /** Backoff state */
  currentBackoffMs: number;
}

/** Summary snapshot of all services for API responses */
export interface ServiceManagerSnapshot {
  services: ServiceSummary[];
  totalServices: number;
  healthyCount: number;
  degradedCount: number;
  stoppedCount: number;
  failedCount: number;
  timestamp: Date;
}

export interface ServiceSummary {
  id: string;
  name: string;
  status: ServiceStatus;
  pid: number | undefined;
  port: number;
  uptimeMs: number;
  restartCount: number;
  lastHealthCheckAt: Date | null;
  lastHealthyAt: Date | null;
  lastError: string | null;
  category?: string;
  description?: string;
  icon?: string;
}

// ============================================================
// Constants
// ============================================================

const BASE_DIR = process.cwd();
const LOG_DIR = path.join(BASE_DIR, 'logs', 'services');

const DEFAULT_SERVICE_OPTIONS: Pick<
  ServiceDefinition,
  | 'autoRestart'
  | 'maxRestarts'
  | 'restartWindowMs'
  | 'restartDelayMs'
  | 'maxRestartDelayMs'
  | 'startupGraceMs'
  | 'healthCheckIntervalMs'
  | 'healthCheckTimeoutMs'
  | 'shutdownTimeoutMs'
  | 'startStaggerMs'
  | 'dependsOn'
> = {
  autoRestart: true,
  maxRestarts: 10,
  restartWindowMs: 10 * 60 * 1000,   // 10 minutes
  restartDelayMs: 2000,                // 2 seconds base
  maxRestartDelayMs: 60_000,           // 1 minute cap
  startupGraceMs: 5000,                // 5 seconds before first health check
  healthCheckIntervalMs: 15_000,       // 15 seconds between checks
  healthCheckTimeoutMs: 5000,          // 5 second health check timeout
  shutdownTimeoutMs: 10_000,           // 10 second SIGTERM → SIGKILL
  startStaggerMs: 2000,                // 2 second stagger between starts
  dependsOn: [],
};

// ============================================================
// Service Registry — All Genova microservices
// ============================================================

const SERVICE_REGISTRY: ServiceDefinition[] = [
  {
    ...DEFAULT_SERVICE_OPTIONS,
    id: 'pocketbase',
    name: 'PocketBase',
    description: 'Backend-as-a-Service with auth, DB, and file storage',
    category: 'database',
    icon: 'Database',
    command: path.join(BASE_DIR, 'services', 'pocketbase', 'pocketbase'),
    args: ['serve', '--http=0.0.0.0:8090'],
    cwd: path.join(BASE_DIR, 'services', 'pocketbase'),
    port: 8090,
    healthPath: '/api/health',
    dependsOn: [],
    startupGraceMs: 4000,
    maxRestarts: 5,
  },
  {
    ...DEFAULT_SERVICE_OPTIONS,
    id: 'baileys',
    name: 'Baileys WhatsApp',
    description: 'WhatsApp Web API for messaging and call automation',
    category: 'communication',
    icon: 'MessageCircle',
    command: 'node',
    args: ['server.js'],
    cwd: path.join(BASE_DIR, 'services', 'baileys'),
    port: 8186,
    healthPath: '/health',
    dependsOn: [],
    startupGraceMs: 6000,
    maxRestarts: 10,
  },
  {
    ...DEFAULT_SERVICE_OPTIONS,
    id: 'ruflo',
    name: 'Ruflo MCP',
    description: 'MCP protocol orchestrator for tool integration',
    category: 'infrastructure',
    icon: 'Plug',
    command: 'node',
    args: ['server.mjs'],
    cwd: path.join(BASE_DIR, 'services', 'ruflo'),
    port: 8190,
    healthPath: '/health',
    dependsOn: [],
    startupGraceMs: 5000,
  },
  {
    ...DEFAULT_SERVICE_OPTIONS,
    id: 'n8n',
    name: 'n8n Workflows',
    description: 'Workflow automation engine with visual editor',
    category: 'automation',
    icon: 'GitBranch',
    command: `${process.env.HOME || '/root'}/.npm-global/bin/n8n`,
    args: ['start'],
    cwd: path.join(BASE_DIR, 'services'),
    port: 5678,
    healthPath: '/healthz',
    env: {
      N8N_BASIC_AUTH_ACTIVE: 'true',
      N8N_BASIC_AUTH_USER: 'admin',
      N8N_BASIC_AUTH_PASSWORD: 'genova_admin',
      N8N_HOST: 'localhost',
      N8N_PORT: '5678',
      N8N_PROTOCOL: 'http',
      WEBHOOK_URL: 'http://localhost:5678/',
      GENERIC_TIMEZONE: 'Africa/Douala',
      TZ: 'Africa/Douala',
    },
    dependsOn: ['pocketbase'],
    startupGraceMs: 15_000,
    restartDelayMs: 5000,
    maxRestarts: 5,
  },
  {
    ...DEFAULT_SERVICE_OPTIONS,
    id: 'speechbrain',
    name: 'SpeechBrain ASR',
    description: 'Speech-to-text engine powered by SpeechBrain models',
    category: 'ai_ml',
    icon: 'Mic',
    command: 'python3',
    args: [path.join(BASE_DIR, 'services', 'speechbrain_api_server.py')],
    cwd: path.join(BASE_DIR, 'services'),
    port: 8187,
    healthPath: '/health',
    dependsOn: [],
    startupGraceMs: 20_000,
    restartDelayMs: 5000,
    maxRestarts: 5,
  },
];

// ============================================================
// ServiceManager Class
// ============================================================

const log = createLogger('service-manager');

export class ServiceManager extends EventEmitter {
  private runtimes: Map<string, ServiceRuntime> = new Map();
  private healthCheckTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private shutdownTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private restartTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private startupGraceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private _isShuttingDown = false;
  private _isInitialized = false;
  private globalHealthTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    // Ensure log directory exists
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    } catch {
      // May already exist or be in a read-only FS; best-effort
    }
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  /** Get the singleton ServiceManager instance */
  static #instance: ServiceManager | null = null;

  /**
   * Not used directly — prefer `getServiceManager()` which returns the singleton.
   * Kept as a class for type-checking and testability.
   */

  /** Initialize and start all services in dependency order */
  async startAll(): Promise<void> {
    if (this._isInitialized) {
      log.warn('ServiceManager already initialized; skipping startAll()');
      return;
    }
    this._isInitialized = true;
    log.info('Starting Genova Service Manager', { serviceCount: SERVICE_REGISTRY.length });

    // Initialize runtimes
    for (const def of SERVICE_REGISTRY) {
      this.runtimes.set(def.id, {
        definition: def,
        process: null,
        status: 'stopped',
        pid: undefined,
        startedAt: null,
        lastHealthCheckAt: null,
        lastHealthyAt: null,
        restartCount: 0,
        restartTimestamps: [],
        lastExitCode: null,
        lastExitSignal: null,
        lastError: null,
        uptimeMs: 0,
        currentBackoffMs: def.restartDelayMs,
      });
    }

    // Topological sort for dependency ordering
    const startOrder = this.resolveStartOrder();

    for (const serviceId of startOrder) {
      if (this._isShuttingDown) break;

      const runtime = this.runtimes.get(serviceId)!;

      // Check if already running (e.g., started externally)
      const alreadyHealthy = await this.checkHealth(runtime.definition);
      if (alreadyHealthy.healthy) {
        log.info(`[${serviceId}] Already running and healthy on port ${runtime.definition.port}`);
        this.setStatus(runtime, 'running');
        this.startHealthMonitoring(serviceId);
        continue;
      }

      await this.startService(serviceId);

      // Stagger between service starts
      const stagger = runtime.definition.startStaggerMs;
      if (stagger > 0) {
        await this.sleep(stagger);
      }
    }

    // Start global health monitoring
    this.startGlobalHealthMonitoring();

    // Register process signal handlers for graceful shutdown
    this.registerSignalHandlers();

    log.info('All services started');
    this.emit('manager:ready');
  }

  /** Start a single service by ID */
  async startService(serviceId: string): Promise<boolean> {
    const runtime = this.runtimes.get(serviceId);
    if (!runtime) {
      log.error(`Unknown service: ${serviceId}`);
      return false;
    }

    if (runtime.status === 'running' || runtime.status === 'starting') {
      log.warn(`[${serviceId}] Already in state: ${runtime.status}`);
      return true;
    }

    // Check dependencies
    const deps = runtime.definition.dependsOn || [];
    for (const depId of deps) {
      const depRuntime = this.runtimes.get(depId);
      if (!depRuntime || (depRuntime.status !== 'running' && depRuntime.status !== 'degraded')) {
        log.error(`[${serviceId}] Dependency not running: ${depId} (status: ${depRuntime?.status || 'unknown'})`);
        this.setStatus(runtime, 'failed', `Dependency ${depId} not available`);
        return false;
      }
    }

    return this.spawnProcess(runtime);
  }

  /** Stop a single service by ID */
  async stopService(serviceId: string): Promise<boolean> {
    const runtime = this.runtimes.get(serviceId);
    if (!runtime) {
      log.error(`Unknown service: ${serviceId}`);
      return false;
    }

    if (!runtime.process || runtime.status === 'stopped') {
      log.warn(`[${serviceId}] Not running`);
      return true;
    }

    return this.gracefulStop(runtime);
  }

  /** Restart a single service by ID */
  async restartService(serviceId: string): Promise<boolean> {
    log.info(`[${serviceId}] Restart requested`);
    await this.stopService(serviceId);
    // Brief pause to let the port free
    await this.sleep(1000);
    // Reset restart budget
    const runtime = this.runtimes.get(serviceId);
    if (runtime) {
      runtime.restartCount = 0;
      runtime.restartTimestamps = [];
      runtime.currentBackoffMs = runtime.definition.restartDelayMs;
      runtime.lastError = null;
    }
    return this.startService(serviceId);
  }

  /** Gracefully shut down all services */
  async shutdown(): Promise<void> {
    if (this._isShuttingDown) return;
    this._isShuttingDown = true;

    log.info('Shutting down all services...');
    this.emit('manager:shutdown');

    // Clear all timers
    this.clearAllTimers();

    // Stop services in reverse dependency order
    const stopOrder = this.resolveStartOrder().reverse();

    const stopPromises = stopOrder.map(async (serviceId) => {
      try {
        await this.stopService(serviceId);
      } catch (err) {
        log.error(`[${serviceId}] Error during shutdown`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    await Promise.allSettled(stopPromises);
    log.info('All services shut down');
  }

  /** Get the current status of a specific service */
  getStatus(serviceId: string): ServiceSummary | null {
    const runtime = this.runtimes.get(serviceId);
    if (!runtime) return null;
    return this.runtimeToSummary(runtime);
  }

  /** Get a snapshot of all services */
  getSnapshot(): ServiceManagerSnapshot {
    const services = Array.from(this.runtimes.values()).map((r) =>
      this.runtimeToSummary(r)
    );

    return {
      services,
      totalServices: services.length,
      healthyCount: services.filter((s) => s.status === 'running').length,
      degradedCount: services.filter((s) => s.status === 'degraded').length,
      stoppedCount: services.filter(
        (s) => s.status === 'stopped' || s.status === 'crashed'
      ).length,
      failedCount: services.filter((s) => s.status === 'failed').length,
      timestamp: new Date(),
    };
  }

  /** Get all service definitions */
  getDefinitions(): ServiceDefinition[] {
    return SERVICE_REGISTRY;
  }

  /** Get runtime details for a service (more detailed than summary) */
  getRuntime(serviceId: string): ServiceRuntime | undefined {
    return this.runtimes.get(serviceId);
  }

  /** Check if a specific service is healthy right now */
  async checkServiceHealth(serviceId: string): Promise<ServiceHealthEvent> {
    const runtime = this.runtimes.get(serviceId);
    if (!runtime) {
      return {
        serviceId,
        healthy: false,
        responseTimeMs: 0,
        timestamp: new Date(),
        error: 'Unknown service',
      };
    }
    return this.checkHealth(runtime.definition);
  }

  /** Get service logs from the log file */
  getServiceLogs(serviceId: string, lines: number = 100): string[] {
    const logFile = path.join(LOG_DIR, `${serviceId}.log`);
    try {
      if (!fs.existsSync(logFile)) return [];
      const content = fs.readFileSync(logFile, 'utf-8');
      const allLines = content.split('\n').filter(Boolean);
      return allLines.slice(-lines);
    } catch {
      return [];
    }
  }

  /** Check if the manager is shutting down */
  get isShuttingDown(): boolean {
    return this._isShuttingDown;
  }

  /** Check if the manager has been initialized */
  get isInitialized(): boolean {
    return this._isInitialized;
  }

  // ----------------------------------------------------------
  // Private — Process Management
  // ----------------------------------------------------------

  private spawnProcess(runtime: ServiceRuntime): boolean {
    const def = runtime.definition;

    try {
      // Open log file descriptors
      const logFd = this.openLogStream(def.id, 'stdout');
      const errFd = this.openLogStream(def.id, 'stderr');

      // Build environment
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PORT: String(def.port),
        ...(def.env || {}),
      };

      // Spawn child process
      const childProcess: ChildProcess = spawn(def.command, def.args, {
        cwd: def.cwd,
        env,
        stdio: ['ignore', logFd, errFd],
        detached: false,
      });

      runtime.process = childProcess;
      runtime.pid = childProcess.pid;
      runtime.startedAt = new Date();
      runtime.lastError = null;
      runtime.lastExitCode = null;
      runtime.lastExitSignal = null;

      this.setStatus(runtime, 'starting');

      log.info(`[${def.id}] Spawned process`, {
        pid: childProcess.pid,
        port: def.port,
        command: def.command,
        args: def.args.join(' '),
      });

      // Handle process events
      childProcess.on('exit', (code, signal) => {
        this.handleProcessExit(runtime, code, signal);
      });

      childProcess.on('error', (err) => {
        this.handleProcessError(runtime, err);
      });

      // Schedule the first health check after the grace period
      const graceTimer = setTimeout(() => {
        this.startHealthMonitoring(def.id);
        this.startupGraceTimers.delete(def.id);
      }, def.startupGraceMs);

      this.startupGraceTimers.set(def.id, graceTimer);

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`[${def.id}] Failed to spawn process`, { error: message });
      runtime.lastError = message;
      this.setStatus(runtime, 'failed', message);
      return false;
    }
  }

  private async gracefulStop(runtime: ServiceRuntime): Promise<boolean> {
    const def = runtime.definition;
    const proc = runtime.process;

    if (!proc || runtime.status === 'stopped') {
      return true;
    }

    this.setStatus(runtime, 'stopping');
    this.stopHealthMonitoring(def.id);

    // Clear any pending restart
    const restartTimer = this.restartTimers.get(def.id);
    if (restartTimer) {
      clearTimeout(restartTimer);
      this.restartTimers.delete(def.id);
    }

    // Clear grace period timer
    const graceTimer = this.startupGraceTimers.get(def.id);
    if (graceTimer) {
      clearTimeout(graceTimer);
      this.startupGraceTimers.delete(def.id);
    }

    return new Promise<boolean>((resolve) => {
      let resolved = false;

      const finish = (success: boolean) => {
        if (resolved) return;
        resolved = true;
        const timeout = this.shutdownTimeouts.get(def.id);
        if (timeout) {
          clearTimeout(timeout);
          this.shutdownTimeouts.delete(def.id);
        }
        runtime.process = null;
        runtime.pid = undefined;
        runtime.uptimeMs = runtime.startedAt
          ? Date.now() - runtime.startedAt.getTime()
          : 0;
        this.setStatus(runtime, 'stopped');
        resolve(success);
      };

      // Set a hard kill timeout
      const killTimer = setTimeout(() => {
        if (!proc.killed && proc.pid) {
          log.warn(`[${def.id}] SIGKILL after timeout`, { pid: proc.pid });
          try {
            proc.kill('SIGKILL');
          } catch {
            // Process may have already exited
          }
        }
        finish(true);
      }, def.shutdownTimeoutMs);

      this.shutdownTimeouts.set(def.id, killTimer);

      // Handle graceful exit
      proc.once('exit', () => {
        log.info(`[${def.id}] Process exited during graceful stop`);
        finish(true);
      });

      // Send SIGTERM
      try {
        proc.kill('SIGTERM');
        log.info(`[${def.id}] Sent SIGTERM`, { pid: proc.pid });
      } catch {
        // Process may have already exited
        finish(true);
      }
    });
  }

  private handleProcessExit(
    runtime: ServiceRuntime,
    code: number | null,
    signal: string | null
  ): void {
    const def = runtime.definition;

    runtime.lastExitCode = code;
    runtime.lastExitSignal = signal;
    runtime.process = null;
    runtime.pid = undefined;
    runtime.uptimeMs = runtime.startedAt
      ? Date.now() - runtime.startedAt.getTime()
      : 0;

    this.stopHealthMonitoring(def.id);

    const exitInfo = { code, signal, uptimeMs: runtime.uptimeMs };
    log.warn(`[${def.id}] Process exited`, exitInfo);

    // If we're shutting down, just mark as stopped
    if (this._isShuttingDown || runtime.status === 'stopping') {
      this.setStatus(runtime, 'stopped');
      return;
    }

    // Unexpected exit — attempt auto-restart
    if (def.autoRestart) {
      this.setStatus(runtime, 'crashed', `Exited with code=${code} signal=${signal}`);
      this.scheduleRestart(runtime);
    } else {
      this.setStatus(runtime, 'crashed', `Exited with code=${code} signal=${signal}`);
    }
  }

  private handleProcessError(runtime: ServiceRuntime, err: Error): void {
    const def = runtime.definition;
    log.error(`[${def.id}] Process error`, { error: err.message });
    runtime.lastError = err.message;

    this.emit('service:status', {
      serviceId: def.id,
      previousStatus: runtime.status,
      newStatus: runtime.status,
      timestamp: new Date(),
      details: err.message,
    });
  }

  // ----------------------------------------------------------
  // Private — Auto-Restart with Exponential Backoff + Jitter
  // ----------------------------------------------------------

  private scheduleRestart(runtime: ServiceRuntime): void {
    const def = runtime.definition;
    const now = new Date();

    // Prune timestamps outside the restart window
    runtime.restartTimestamps = runtime.restartTimestamps.filter(
      (ts) => now.getTime() - ts.getTime() < def.restartWindowMs
    );

    // Check if we've exceeded the restart budget
    if (runtime.restartTimestamps.length >= def.maxRestarts) {
      log.error(`[${def.id}] Restart budget exhausted`, {
        restarts: runtime.restartTimestamps.length,
        maxRestarts: def.maxRestarts,
        windowMs: def.restartWindowMs,
      });
      this.setStatus(runtime, 'failed', 'Restart budget exhausted');
      return;
    }

    // Calculate backoff with jitter
    const jitter = Math.random() * 0.3 * runtime.currentBackoffMs;
    const delay = Math.min(runtime.currentBackoffMs + jitter, def.maxRestartDelayMs);

    runtime.restartCount++;
    runtime.restartTimestamps.push(now);

    // Increase backoff for next time (exponential)
    runtime.currentBackoffMs = Math.min(
      runtime.currentBackoffMs * 2,
      def.maxRestartDelayMs
    );

    log.info(`[${def.id}] Scheduling restart`, {
      attempt: runtime.restartCount,
      maxRestarts: def.maxRestarts,
      delayMs: Math.round(delay),
      backoffMs: runtime.currentBackoffMs,
    });

    // Clear any existing restart timer
    const existingTimer = this.restartTimers.get(def.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.restartTimers.delete(def.id);
      if (this._isShuttingDown) return;

      log.info(`[${def.id}] Executing scheduled restart`);
      const success = await this.startService(def.id);
      if (!success) {
        log.error(`[${def.id}] Scheduled restart failed`);
      }
    }, delay);

    this.restartTimers.set(def.id, timer);
  }

  // ----------------------------------------------------------
  // Private — Health Monitoring
  // ----------------------------------------------------------

  private startHealthMonitoring(serviceId: string): void {
    // Don't start duplicate timers
    if (this.healthCheckTimers.has(serviceId)) return;

    const runtime = this.runtimes.get(serviceId);
    if (!runtime) return;

    const interval = runtime.definition.healthCheckIntervalMs;

    // Perform an immediate check
    this.performHealthCheck(serviceId);

    // Schedule periodic checks
    const timer = setInterval(() => {
      this.performHealthCheck(serviceId);
    }, interval);

    this.healthCheckTimers.set(serviceId, timer);
  }

  private stopHealthMonitoring(serviceId: string): void {
    const timer = this.healthCheckTimers.get(serviceId);
    if (timer) {
      clearInterval(timer);
      this.healthCheckTimers.delete(serviceId);
    }
  }

  private async performHealthCheck(serviceId: string): Promise<void> {
    const runtime = this.runtimes.get(serviceId);
    if (!runtime || !runtime.process) return;

    const result = await this.checkHealth(runtime.definition);

    runtime.lastHealthCheckAt = new Date();

    if (result.healthy) {
      runtime.lastHealthyAt = new Date();
      // Reset backoff on successful health check
      runtime.currentBackoffMs = runtime.definition.restartDelayMs;

      if (runtime.status === 'starting' || runtime.status === 'degraded') {
        this.setStatus(runtime, 'running');
      }
    } else {
      // Only transition to degraded if we were previously running or starting
      if (runtime.status === 'running' || runtime.status === 'starting') {
        this.setStatus(runtime, 'degraded', result.error || 'Health check failed');
      }
    }

    this.emit('service:health', result);
  }

  private checkHealth(def: ServiceDefinition): Promise<ServiceHealthEvent> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const request = http.get(
        `http://localhost:${def.port}${def.healthPath}`,
        { timeout: def.healthCheckTimeoutMs },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => {
            body += chunk;
          });
          res.on('end', () => {
            const responseTime = Date.now() - startTime;
            let data: unknown = body;

            try {
              data = JSON.parse(body);
            } catch {
              // Non-JSON response is fine (e.g., n8n returns plain text)
            }

            const healthy = res.statusCode !== undefined &&
              res.statusCode >= 200 &&
              res.statusCode < 400;

            resolve({
              serviceId: def.id,
              healthy,
              responseTimeMs: responseTime,
              timestamp: new Date(),
              data,
            });
          });
        }
      );

      request.on('error', (err) => {
        resolve({
          serviceId: def.id,
          healthy: false,
          responseTimeMs: Date.now() - startTime,
          timestamp: new Date(),
          error: err.message,
        });
      });

      request.on('timeout', () => {
        request.destroy();
        resolve({
          serviceId: def.id,
          healthy: false,
          responseTimeMs: Date.now() - startTime,
          timestamp: new Date(),
          error: 'Health check timeout',
        });
      });
    });
  }

  private startGlobalHealthMonitoring(): void {
    // Periodic sweep to catch services that are unhealthy but not being monitored
    if (this.globalHealthTimer) return;

    this.globalHealthTimer = setInterval(() => {
      if (this._isShuttingDown) return;

      for (const [serviceId, runtime] of this.runtimes) {
        if (
          runtime.status === 'degraded' &&
          !this.healthCheckTimers.has(serviceId)
        ) {
          this.startHealthMonitoring(serviceId);
        }

        // Check for zombie processes (process reference but no PID)
        if (runtime.process && !runtime.process.pid && runtime.status !== 'stopping') {
          log.warn(`[${serviceId}] Zombie process detected; cleaning up`);
          runtime.process = null;
          runtime.pid = undefined;
          this.setStatus(runtime, 'crashed', 'Zombie process');
          if (runtime.definition.autoRestart) {
            this.scheduleRestart(runtime);
          }
        }
      }
    }, 30_000);
  }

  // ----------------------------------------------------------
  // Private — Dependency Resolution
  // ----------------------------------------------------------

  /**
   * Topological sort of services based on their `dependsOn` field.
   * Services with no dependencies come first.
   * Throws if a circular dependency is detected.
   */
  private resolveStartOrder(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new Error(`Circular dependency detected involving service: ${id}`);
      }

      visiting.add(id);

      const runtime = this.runtimes.get(id);
      if (runtime) {
        const deps = runtime.definition.dependsOn || [];
        for (const depId of deps) {
          visit(depId);
        }
      }

      visiting.delete(id);
      visited.add(id);
      result.push(id);
    };

    for (const def of SERVICE_REGISTRY) {
      visit(def.id);
    }

    return result;
  }

  // ----------------------------------------------------------
  // Private — Utility
  // ----------------------------------------------------------

  private setStatus(
    runtime: ServiceRuntime,
    newStatus: ServiceStatus,
    details?: string
  ): void {
    const previousStatus = runtime.status;
    if (previousStatus === newStatus) return;

    runtime.status = newStatus;

    log.info(`[${runtime.definition.id}] Status: ${previousStatus} → ${newStatus}`, {
      details: details || '',
    });

    this.emit('service:status', {
      serviceId: runtime.definition.id,
      previousStatus,
      newStatus,
      timestamp: new Date(),
      details,
    });
  }

  private openLogStream(serviceId: string, stream: 'stdout' | 'stderr'): number {
    const filename =
      stream === 'stdout'
        ? `${serviceId}.log`
        : `${serviceId}-error.log`;
    const filePath = path.join(LOG_DIR, filename);

    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      return fs.openSync(filePath, 'a');
    } catch {
      // Fallback to /dev/null if we can't open the log file
      return fs.openSync('/dev/null', 'w');
    }
  }

  private runtimeToSummary(runtime: ServiceRuntime): ServiceSummary {
    const def = runtime.definition;
    return {
      id: def.id,
      name: def.name,
      status: runtime.status,
      pid: runtime.pid,
      port: def.port,
      uptimeMs: runtime.startedAt ? Date.now() - runtime.startedAt.getTime() : 0,
      restartCount: runtime.restartCount,
      lastHealthCheckAt: runtime.lastHealthCheckAt,
      lastHealthyAt: runtime.lastHealthyAt,
      lastError: runtime.lastError,
      category: def.category,
      description: def.description,
      icon: def.icon,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private clearAllTimers(): void {
    for (const timer of this.healthCheckTimers.values()) {
      clearInterval(timer);
    }
    this.healthCheckTimers.clear();

    for (const timer of this.restartTimers.values()) {
      clearTimeout(timer);
    }
    this.restartTimers.clear();

    for (const timer of this.shutdownTimeouts.values()) {
      clearTimeout(timer);
    }
    this.shutdownTimeouts.clear();

    for (const timer of this.startupGraceTimers.values()) {
      clearTimeout(timer);
    }
    this.startupGraceTimers.clear();

    if (this.globalHealthTimer) {
      clearInterval(this.globalHealthTimer);
      this.globalHealthTimer = null;
    }
  }

  private registerSignalHandlers(): void {
    // Only register once
    if ((ServiceManager as any)._signalsRegistered) return;
    (ServiceManager as any)._signalsRegistered = true;

    const handler = async (signal: string) => {
      log.info(`Received ${signal}; initiating graceful shutdown`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', () => handler('SIGTERM'));
    process.on('SIGINT', () => handler('SIGINT'));
  }
}

// ============================================================
// Singleton Accessor
// ============================================================

let instance: ServiceManager | null = null;

/**
 * Get the global ServiceManager singleton.
 * Creates it on first call; returns the same instance thereafter.
 */
export function getServiceManager(): ServiceManager {
  if (!instance) {
    instance = new ServiceManager();
  }
  return instance;
}

/**
 * Reset the singleton (for testing only).
 * Must call `shutdown()` first in production scenarios.
 */
export function resetServiceManager(): void {
  instance = null;
}
