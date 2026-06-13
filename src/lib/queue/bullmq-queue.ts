/**
 * BullMQ Job Queue — Production-ready Redis-backed job queue for Genova.AI
 *
 * Replaces the in-memory JobQueue with a distributed, persistent BullMQ system
 * that survives server restarts and scales across processes.
 *
 * Queues:
 *   ai:image  — Image generation (120s timeout, 3 concurrent workers)
 *   ai:video  — Video generation (600s timeout, 2 concurrent workers)
 *   ai:long   — Long-running AI calls (300s timeout, 5 concurrent workers)
 *
 * Features:
 *   - Redis-backed persistence via ioredis
 *   - Job priorities: critical (1), high (2), normal (3), low (4)
 *   - Exponential backoff retries (max 3)
 *   - Progress tracking (0-100%)
 *   - Job deduplication by userId+prompt hash
 *   - Per-user rate limiting
 *   - Queue health checks
 *   - Graceful shutdown
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { createLogger } from '@/lib/logger';
import { createHash } from 'crypto';

const log = createLogger('bullmq-queue');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export enum JobPriority {
  CRITICAL = 1,
  HIGH = 2,
  NORMAL = 3,
  LOW = 4,
}

export type QueueName = "ai-image" | "ai-video" | "ai-long";

export interface BaseJobPayload {
  userId: string;
  /** Unique deduplication key (auto-generated if not provided) */
  dedupKey?: string;
  /** Priority level (defaults to NORMAL) */
  priority?: JobPriority;
  /** Custom job ID (for deduplication) */
  jobId?: string;
}

export interface ImageJobPayload extends BaseJobPayload {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  negativePrompt?: string;
  steps?: number;
  seed?: number;
  sampler?: string;
}

export interface VideoJobPayload extends BaseJobPayload {
  prompt: string;
  model?: string;
  duration?: number;
  fps?: number;
  resolution?: string;
  seed?: number;
}

export interface AIJobPayload extends BaseJobPayload {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model?: string;
  provider?: string;
  maxTokens?: number;
  temperature?: number;
}

export type AnyJobPayload = ImageJobPayload | VideoJobPayload | AIJobPayload;

export interface JobResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  durationMs: number;
  provider: string;
  costUsd: number;
}

export interface QueueStats {
  queue: QueueName;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface JobStatusResult {
  id: string;
  queue: QueueName;
  status: string;
  progress: number;
  attemptsMade: number;
  data: Record<string, unknown>;
  returnvalue?: unknown;
  failedReason?: string;
  timestamp?: number;
  finishedOn?: number;
  processedOn?: number;
}

// ---------------------------------------------------------------------------
// Queue Configuration
// ---------------------------------------------------------------------------

interface QueueConfig {
  name: QueueName;
  concurrency: number;
  timeoutMs: number;
  maxRetries: number;
  backoffType: 'exponential' | 'fixed';
  backoffDelayMs: number;
}

const QUEUE_CONFIGS: Record<QueueName, QueueConfig> = {
  'ai-image': {
    name: 'ai-image',
    concurrency: 5,
    timeoutMs: 180_000,
    maxRetries: 5,
    backoffType: 'exponential',
    backoffDelayMs: 5_000,
  },
  'ai-video': {
    name: 'ai-video',
    concurrency: 2,
    timeoutMs: 900_000,
    maxRetries: 3,
    backoffType: 'exponential',
    backoffDelayMs: 10_000,
  },
  'ai-long': {
    name: 'ai-long',
    concurrency: 10,
    timeoutMs: 600_000,
    maxRetries: 3,
    backoffType: 'exponential',
    backoffDelayMs: 3_000,
  },
};

// ---------------------------------------------------------------------------
// Rate Limiting (Redis-based)
// ---------------------------------------------------------------------------

const USER_RATE_LIMITS: Record<QueueName, { maxJobs: number; windowMs: number }> = {
  'ai-image': { maxJobs: 20, windowMs: 60 * 60 * 1000 },       // 20 images/hour
  'ai-video': { maxJobs: 5, windowMs: 60 * 60 * 1000 },         // 5 videos/hour
  'ai-long':  { maxJobs: 30, windowMs: 60 * 60 * 1000 },        // 30 long AI calls/hour
};

const RATE_LIMIT_PREFIX = 'genova:ratelimit:';

// ---------------------------------------------------------------------------
// Redis Connection
// ---------------------------------------------------------------------------

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let sharedConnection: Redis | null = null;

function getRedisConnection(): Redis {
  if (!sharedConnection || sharedConnection.status === 'end') {
    sharedConnection = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null, // BullMQ requires this
      enableReadyCheck: false,
      retryStrategy(times) {
        const delay = Math.min(times * 500, 10_000);
        log.warn(`Redis reconnecting (attempt ${times}), next retry in ${delay}ms`);
        return delay;
      },
    });

    sharedConnection.on('error', (err) => {
      log.error('Redis connection error', { error: err.message });
    });

    sharedConnection.on('connect', () => {
      log.info('Redis connected', { url: REDIS_URL.replace(/\/\/.*@/, '//***@') });
    });
  }
  return sharedConnection;
}

/** Create a separate Redis connection for subscribers (BullMQ requirement) */
function getSubscriberConnection(): Redis {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function generateDedupKey(queueName: QueueName, userId: string, payload: AnyJobPayload): string {
  const hashInput = `${queueName}:${userId}:${JSON.stringify(payload)}`;
  return createHash('sha256').update(hashInput).digest('hex').slice(0, 24);
}

// ---------------------------------------------------------------------------
// BullMQQueue — Core queue manager
// ---------------------------------------------------------------------------

export class BullMQQueue {
  private queues: Map<QueueName, Queue> = new Map();
  private workers: Map<QueueName, Worker> = new Map();
  private queueEvents: Map<QueueName, QueueEvents> = new Map();
  private connection: Redis;
  private isShuttingDown = false;

  constructor() {
    this.connection = getRedisConnection() as unknown as Redis;
    this.initializeQueues();
    this.registerSignalHandlers();
  }

  // -------------------------------------------------------------------------
  // Queue Initialization
  // -------------------------------------------------------------------------

  private initializeQueues(): void {
    for (const [name, config] of Object.entries(QUEUE_CONFIGS) as [QueueName, QueueConfig][]) {
      // Create the queue
      const queue = new Queue(name, {
        connection: this.connection as any,
        defaultJobOptions: {
          removeOnComplete: { count: 1000 },     // Keep last 1000 completed jobs
          removeOnFail: { count: 5000 },          // Keep last 5000 failed jobs
          attempts: config.maxRetries + 1,        // First attempt + retries
          backoff: {
            type: config.backoffType,
            delay: config.backoffDelayMs,
          },
        },
      });

      this.queues.set(name, queue);

      // Create queue events listener
      const events = new QueueEvents(name, {
        connection: getSubscriberConnection() as any,
      });

      this.setupEventListeners(name, events);
      this.queueEvents.set(name, events);

      log.info(`Queue initialized: ${name}`, {
        concurrency: config.concurrency,
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Event Listeners
  // -------------------------------------------------------------------------

  private setupEventListeners(queueName: QueueName, events: QueueEvents): void {
    events.on('completed', ({ jobId, returnvalue }) => {
      log.info(`Job completed`, { queue: queueName, jobId, result: String(returnvalue).slice(0, 200) });
    });

    events.on('failed', ({ jobId, failedReason }) => {
      log.error(`Job failed`, { queue: queueName, jobId, reason: failedReason?.slice(0, 500) });
    });

    events.on('progress', ({ jobId, data }) => {
      log.debug(`Job progress`, { queue: queueName, jobId, progress: data });
    });

    events.on('stalled', ({ jobId }) => {
      log.warn(`Job stalled`, { queue: queueName, jobId });
    });
  }

  // -------------------------------------------------------------------------
  // Add Job
  // -------------------------------------------------------------------------

  async addJob<T extends AnyJobPayload>(
    queueName: QueueName,
    payload: T,
    options?: {
      priority?: JobPriority;
      delay?: number;
      jobId?: string;
    },
  ): Promise<string> {
    if (this.isShuttingDown) {
      throw new Error('Queue is shutting down — cannot accept new jobs');
    }

    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const config = QUEUE_CONFIGS[queueName];

    // Rate limit check
    const rateLimitOk = await this.checkRateLimit(queueName, payload.userId);
    if (!rateLimitOk.allowed) {
      throw new Error(
        `Rate limit exceeded for ${queueName}: ${rateLimitOk.remaining} jobs remaining in current window`,
      );
    }

    // Deduplication check
    const dedupKey = options?.jobId || payload.jobId || generateDedupKey(queueName, payload.userId, payload as AnyJobPayload);
    const existingJob = await queue.getJob(dedupKey);
    if (existingJob && !['completed', 'failed'].includes(await existingJob.getState())) {
      log.info(`Duplicate job rejected`, { queue: queueName, dedupKey, userId: payload.userId });
      throw new Error(`Duplicate job already in queue: ${dedupKey}`);
    }

    const job = await queue.add(queueName, payload, {
      jobId: dedupKey,
      priority: options?.priority ?? payload.priority ?? JobPriority.NORMAL,
      delay: options?.delay,
      attempts: config.maxRetries + 1,
      backoff: {
        type: config.backoffType,
        delay: config.backoffDelayMs,
      },
    });

    // Track rate limit
    await this.incrementRateLimit(queueName, payload.userId);

    log.info(`Job added`, {
      queue: queueName,
      jobId: job.id,
      userId: payload.userId,
      priority: options?.priority ?? payload.priority ?? JobPriority.NORMAL,
    });

    return job.id!;
  }

  // -------------------------------------------------------------------------
  // Register Worker
  // -------------------------------------------------------------------------

  registerWorker(
    queueName: QueueName,
    processor: (job: Job<AnyJobPayload, JobResult>) => Promise<JobResult>,
  ): Worker<AnyJobPayload, JobResult> {
    const config = QUEUE_CONFIGS[queueName];
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const worker = new Worker<AnyJobPayload, JobResult>(queueName, processor, {
      connection: this.connection as any,
      concurrency: config.concurrency,
      lockDuration: config.timeoutMs + 30_000, // Lock longer than timeout
    });

    // Worker-level event listeners
    worker.on('completed', (job) => {
      log.info(`Worker completed job`, {
        queue: queueName,
        jobId: job.id,
        durationMs: job.returnvalue?.durationMs,
        provider: job.returnvalue?.provider,
      });
    });

    worker.on('failed', (job, err) => {
      log.error(`Worker job failed`, {
        queue: queueName,
        jobId: job?.id,
        error: err.message,
        attemptsMade: job?.attemptsMade,
      });
    });

    worker.on('progress', (job, progress) => {
      log.debug(`Worker job progress`, {
        queue: queueName,
        jobId: job.id,
        progress,
      });
    });

    worker.on('stalled', (jobId) => {
      log.warn(`Worker job stalled`, { queue: queueName, jobId });
    });

    worker.on('error', (err) => {
      log.error(`Worker error`, { queue: queueName, error: err.message });
    });

    this.workers.set(queueName, worker);

    log.info(`Worker registered for queue: ${queueName}`, {
      concurrency: config.concurrency,
      timeoutMs: config.timeoutMs,
    });

    return worker;
  }

  // -------------------------------------------------------------------------
  // Get Job Status
  // -------------------------------------------------------------------------

  async getJobStatus(jobId: string, queueName?: QueueName): Promise<JobStatusResult | null> {
    const queues = queueName
      ? [[queueName, this.queues.get(queueName)!] as [QueueName, Queue]]
      : (Array.from(this.queues.entries()) as [QueueName, Queue][]);

    for (const [name, queue] of queues) {
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        const progress = typeof job.progress === 'number' ? job.progress : 0;

        return {
          id: job.id!,
          queue: name,
          status: state,
          progress,
          attemptsMade: job.attemptsMade,
          data: job.data as Record<string, unknown>,
          returnvalue: job.returnvalue,
          failedReason: job.failedReason,
          timestamp: job.timestamp,
          finishedOn: job.finishedOn ?? undefined,
          processedOn: job.processedOn ?? undefined,
        };
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Get Queue Stats
  // -------------------------------------------------------------------------

  async getQueueStats(): Promise<QueueStats[]> {
    const stats: QueueStats[] = [];

    const entries = Array.from(this.queues.entries());
    for (const [name, queue] of entries) {
      try {
        const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
          queue.isPaused(),
        ]);

        stats.push({
          queue: name,
          waiting,
          active,
          completed,
          failed,
          delayed,
          paused: isPaused,
        });
      } catch (err) {
        log.error(`Failed to get stats for queue ${name}`, {
          error: err instanceof Error ? err.message : String(err),
        });
        stats.push({
          queue: name,
          waiting: -1,
          active: -1,
          completed: -1,
          failed: -1,
          delayed: -1,
          paused: false,
        });
      }
    }

    return stats;
  }

  // -------------------------------------------------------------------------
  // Health Check
  // -------------------------------------------------------------------------

  async healthCheck(): Promise<{
    healthy: boolean;
    redis: 'connected' | 'disconnected' | 'error';
    queues: QueueStats[];
    uptime: number;
  }> {
    let redisStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';

    try {
      if (this.connection.status === 'ready') {
        await this.connection.ping();
        redisStatus = 'connected';
      }
    } catch {
      redisStatus = 'error';
    }

    const queues = await this.getQueueStats();
    const healthy = redisStatus === 'connected';

    return {
      healthy,
      redis: redisStatus,
      queues,
      uptime: process.uptime(),
    };
  }

  // -------------------------------------------------------------------------
  // Cancel Job
  // -------------------------------------------------------------------------

  async cancelJob(jobId: string, queueName?: QueueName): Promise<boolean> {
    const queues = queueName
      ? [[queueName, this.queues.get(queueName)!] as [QueueName, Queue]]
      : (Array.from(this.queues.entries()) as [QueueName, Queue][]);

    for (const [, queue] of queues) {
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        if (['waiting', 'delayed', 'priority'].includes(state)) {
          await job.remove();
          log.info(`Job cancelled`, { jobId, state });
          return true;
        }
        // Active or stalled jobs cannot be simply removed
        log.warn(`Cannot cancel job in state: ${state}`, { jobId });
        return false;
      }
    }

    log.warn(`Job not found for cancellation`, { jobId });
    return false;
  }

  // -------------------------------------------------------------------------
  // Rate Limiting
  // -------------------------------------------------------------------------

  private async checkRateLimit(
    queueName: QueueName,
    userId: string,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const limit = USER_RATE_LIMITS[queueName];
    if (!limit) return { allowed: true, remaining: Infinity };

    const key = `${RATE_LIMIT_PREFIX}${queueName}:${userId}`;
    try {
      const current = await this.connection.incr(key);
      if (current === 1) {
        // First request in window — set TTL
        await this.connection.pexpire(key, limit.windowMs);
      }
      const remaining = Math.max(0, limit.maxJobs - current);
      return { allowed: current <= limit.maxJobs, remaining };
    } catch (err) {
      log.error('Rate limit check failed, allowing request', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { allowed: true, remaining: Infinity };
    }
  }

  private async incrementRateLimit(queueName: QueueName, userId: string): Promise<void> {
    // Already incremented in checkRateLimit via incr
    // This method exists for future explicit increment if check and increment are separated
  }

  // -------------------------------------------------------------------------
  // Pause / Resume Queue
  // -------------------------------------------------------------------------

  async pauseQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.pause();
      log.info(`Queue paused`, { queue: queueName });
    }
  }

  async resumeQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.resume();
      log.info(`Queue resumed`, { queue: queueName });
    }
  }

  // -------------------------------------------------------------------------
  // Drain / Obliterate Queue (admin operations)
  // -------------------------------------------------------------------------

  async drainQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.drain();
      log.info(`Queue drained`, { queue: queueName });
    }
  }

  // -------------------------------------------------------------------------
  // Graceful Shutdown
  // -------------------------------------------------------------------------

  async shutdown(timeoutMs: number = 30_000): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    log.info('Starting graceful shutdown...', { timeoutMs });

    const shutdownPromises: Promise<void>[] = [];

    // Close workers first (wait for current jobs to finish)
    for (const [name, worker] of Array.from(this.workers.entries())) {
      shutdownPromises.push(
        worker.close(true).then(() => {
          log.info(`Worker closed`, { queue: name });
        }),
      );
    }

    // Close queue events
    for (const [name, events] of Array.from(this.queueEvents.entries())) {
      shutdownPromises.push(
        events.close().then(() => {
          log.info(`Queue events closed`, { queue: name });
        }),
      );
    }

    // Close queues
    for (const [name, queue] of Array.from(this.queues.entries())) {
      shutdownPromises.push(
        queue.close().then(() => {
          log.info(`Queue closed`, { queue: name });
        }),
      );
    }

    try {
      await Promise.allSettled(shutdownPromises);
    } catch (err) {
      log.error('Error during shutdown', { error: err instanceof Error ? err.message : String(err) });
    }

    // Close shared Redis connection
    try {
      await this.connection.quit();
    } catch {
      // Ignore — connection might already be closed
    }

    log.info('Graceful shutdown complete');
  }

  // -------------------------------------------------------------------------
  // Signal Handlers
  // -------------------------------------------------------------------------

  private registerSignalHandlers(): void {
    const shutdown = async (signal: string) => {
      log.info(`Received ${signal}, initiating graceful shutdown...`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  getQueue(queueName: QueueName): Queue | undefined {
    return this.queues.get(queueName);
  }

  getWorker(queueName: QueueName): Worker | undefined {
    return this.workers.get(queueName);
  }

  getQueueEvents(queueName: QueueName): QueueEvents | undefined {
    return this.queueEvents.get(queueName);
  }

  get redisConnection(): Redis {
    return this.connection;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let bullMQInstance: BullMQQueue | null = null;

export function getBullMQQueue(): BullMQQueue {
  if (!bullMQInstance) {
    bullMQInstance = new BullMQQueue();
  }
  return bullMQInstance;
}

export function resetBullMQQueue(): void {
  bullMQInstance = null;
}
