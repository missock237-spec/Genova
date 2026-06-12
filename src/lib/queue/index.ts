/**
 * AIJobQueue — Unified interface for the Genova.AI BullMQ job queue system
 *
 * Provides a clean API for adding jobs, checking status, and managing
 * the Redis-backed BullMQ queues. Workers are registered on first use.
 *
 * Usage:
 *   const queue = getAIJobQueue();
 *
 *   // Add an image generation job
 *   const jobId = await queue.addImageJob('user_123', 'A sunset over mountains', {
 *     width: 1024,
 *     height: 1024,
 *     priority: JobPriority.HIGH,
 *   });
 *
 *   // Check job status
 *   const status = await queue.getJobStatus(jobId);
 *
 *   // Get stats for all queues
 *   const stats = await queue.getQueueStats();
 *
 *   // Graceful shutdown
 *   await queue.shutdown();
 */

import {
  BullMQQueue,
  JobPriority,
  getBullMQQueue,
  resetBullMQQueue,
  type QueueName,
  type ImageJobPayload,
  type VideoJobPayload,
  type AIJobPayload,
  type JobResult,
  type JobStatusResult,
  type QueueStats,
  type AnyJobPayload,
} from './bullmq-queue';

import { Job } from 'bullmq';

import { processImageJob } from './workers/image-worker';
import { processVideoJob } from './workers/video-worker';
import { processAIJob } from './workers/ai-worker';
import { resetDailyCredits } from '@/lib/credits-cron';

import { createLogger } from '@/lib/logger';

const log = createLogger('ai-job-queue');

// ---------------------------------------------------------------------------
// Options Types
// ---------------------------------------------------------------------------

export interface AddImageJobOptions {
  model?: string;
  width?: number;
  height?: number;
  negativePrompt?: string;
  steps?: number;
  seed?: number;
  sampler?: string;
  priority?: JobPriority;
  delay?: number;
}

export interface AddVideoJobOptions {
  model?: string;
  duration?: number;
  fps?: number;
  resolution?: string;
  seed?: number;
  priority?: JobPriority;
  delay?: number;
}

export interface AddAIJobOptions {
  model?: string;
  provider?: string;
  maxTokens?: number;
  temperature?: number;
  priority?: JobPriority;
  delay?: number;
}

// ---------------------------------------------------------------------------
// AIJobQueue Class
// ---------------------------------------------------------------------------

export class AIJobQueue {
  private bullMQ: BullMQQueue;
  private workersRegistered = false;

  constructor() {
    this.bullMQ = getBullMQQueue();
    this.ensureWorkersRegistered();
  }

  // -------------------------------------------------------------------------
  // Worker Registration (idempotent)
  // -------------------------------------------------------------------------

  private ensureWorkersRegistered(): void {
    if (this.workersRegistered) return;

    // Register repeatable job for daily credit reset (runs every day at midnight)
    const systemQueue = this.bullMQ.getQueue('ai:long'); // Use an existing queue for system tasks
    if (systemQueue) {
      systemQueue.add(
        'system:daily-credit-reset',
        {},
        {
          repeat: { pattern: '0 0 * * *' }, // Midnight every day
          jobId: 'system:daily-credit-reset',
        }
      ).catch(err => log.error('Failed to schedule daily credit reset', { error: err.message }));
    }

    // Register image worker on ai:image queue
    this.bullMQ.registerWorker('ai:image', async (job) => {
      return processImageJob(job as Job<ImageJobPayload, JobResult>);
    });

    // Register video worker on ai:video queue
    this.bullMQ.registerWorker('ai:video', async (job) => {
      return processVideoJob(job as Job<VideoJobPayload, JobResult>);
    });

    // Register AI worker on ai:long queue
    this.bullMQ.registerWorker('ai:long', async (job) => {
      if (job.name === 'system:daily-credit-reset') {
        log.info('Executing scheduled daily credit reset');
        await resetDailyCredits();
        return { success: true, durationMs: 0, provider: 'system', costUsd: 0 };
      }
      return processAIJob(job as Job<AIJobPayload, JobResult>);
    });

    this.workersRegistered = true;
    log.info('All workers registered');
  }

  // -------------------------------------------------------------------------
  // Add Image Job
  // -------------------------------------------------------------------------

  async addImageJob(
    userId: string,
    prompt: string,
    options: AddImageJobOptions = {},
  ): Promise<string> {
    const payload: ImageJobPayload = {
      userId,
      prompt,
      model: options.model,
      width: options.width,
      height: options.height,
      negativePrompt: options.negativePrompt,
      steps: options.steps,
      seed: options.seed,
      sampler: options.sampler,
      priority: options.priority ?? JobPriority.NORMAL,
    };

    const jobId = await this.bullMQ.addJob('ai:image', payload, {
      priority: options.priority,
      delay: options.delay,
    });

    log.info('Image job added', { jobId, userId, prompt: prompt.slice(0, 50) });
    return jobId;
  }

  // -------------------------------------------------------------------------
  // Add Video Job
  // -------------------------------------------------------------------------

  async addVideoJob(
    userId: string,
    prompt: string,
    options: AddVideoJobOptions = {},
  ): Promise<string> {
    const payload: VideoJobPayload = {
      userId,
      prompt,
      model: options.model,
      duration: options.duration,
      fps: options.fps,
      resolution: options.resolution,
      seed: options.seed,
      priority: options.priority ?? JobPriority.NORMAL,
    };

    const jobId = await this.bullMQ.addJob('ai:video', payload, {
      priority: options.priority,
      delay: options.delay,
    });

    log.info('Video job added', { jobId, userId, prompt: prompt.slice(0, 50) });
    return jobId;
  }

  // -------------------------------------------------------------------------
  // Add AI (Long) Job
  // -------------------------------------------------------------------------

  async addAIJob(
    userId: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: AddAIJobOptions = {},
  ): Promise<string> {
    const payload: AIJobPayload = {
      userId,
      messages,
      model: options.model,
      provider: options.provider,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      priority: options.priority ?? JobPriority.NORMAL,
    };

    const jobId = await this.bullMQ.addJob('ai:long', payload, {
      priority: options.priority,
      delay: options.delay,
    });

    log.info('AI job added', {
      jobId,
      userId,
      messageCount: messages.length,
      totalChars: messages.reduce((s, m) => s + m.content.length, 0),
    });
    return jobId;
  }

  // -------------------------------------------------------------------------
  // Get Job Status
  // -------------------------------------------------------------------------

  async getJobStatus(jobId: string): Promise<JobStatusResult | null> {
    return this.bullMQ.getJobStatus(jobId);
  }

  // -------------------------------------------------------------------------
  // Get Queue Stats
  // -------------------------------------------------------------------------

  async getQueueStats(): Promise<QueueStats[]> {
    return this.bullMQ.getQueueStats();
  }

  // -------------------------------------------------------------------------
  // Cancel Job
  // -------------------------------------------------------------------------

  async cancelJob(jobId: string): Promise<boolean> {
    return this.bullMQ.cancelJob(jobId);
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
    return this.bullMQ.healthCheck();
  }

  // -------------------------------------------------------------------------
  // Pause / Resume Queue
  // -------------------------------------------------------------------------

  async pauseQueue(queueName: QueueName): Promise<void> {
    return this.bullMQ.pauseQueue(queueName);
  }

  async resumeQueue(queueName: QueueName): Promise<void> {
    return this.bullMQ.resumeQueue(queueName);
  }

  // -------------------------------------------------------------------------
  // Drain Queue (admin)
  // -------------------------------------------------------------------------

  async drainQueue(queueName: QueueName): Promise<void> {
    return this.bullMQ.drainQueue(queueName);
  }

  // -------------------------------------------------------------------------
  // Graceful Shutdown
  // -------------------------------------------------------------------------

  async shutdown(timeoutMs: number = 30_000): Promise<void> {
    log.info('AIJobQueue shutting down...');
    await this.bullMQ.shutdown(timeoutMs);
    resetBullMQQueue();
    this.workersRegistered = false;
    log.info('AIJobQueue shutdown complete');
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let aiJobQueueInstance: AIJobQueue | null = null;

export function getAIJobQueue(): AIJobQueue {
  if (!aiJobQueueInstance) {
    aiJobQueueInstance = new AIJobQueue();
  }
  return aiJobQueueInstance;
}

export function resetAIJobQueue(): void {
  aiJobQueueInstance = null;
  resetBullMQQueue();
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export {
  BullMQQueue,
  JobPriority,
  getBullMQQueue,
  resetBullMQQueue,
  type QueueName,
  type ImageJobPayload,
  type VideoJobPayload,
  type AIJobPayload,
  type JobResult,
  type JobStatusResult,
  type QueueStats,
  type AnyJobPayload,
} from './bullmq-queue';

export { processImageJob } from './workers/image-worker';
export { processVideoJob } from './workers/video-worker';
export { processAIJob } from './workers/ai-worker';

// Keep the legacy in-memory JobQueue available for backward compatibility
export { JobQueue, type Job } from './job-queue';
