/**
 * Long AI Call Worker — Processes jobs from the ai:long queue
 *
 * Handles long-running AI completions such as:
 *   - Code generation
 *   - Document analysis
 *   - Multi-step reasoning
 *   - Large-context completions
 *
 * Uses the existing AIRouter with fallback chain (Groq → OpenRouter → z-ai-sdk).
 * Reports progress updates throughout the generation lifecycle.
 */

import { Job } from 'bullmq';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { AIRouter, type AIMessage } from '@/lib/ai-router';
import type { AIJobPayload, JobResult } from '../bullmq-queue';

const log = createLogger('worker-ai');

// ---------------------------------------------------------------------------
// Progress Reporting
// ---------------------------------------------------------------------------

type ProgressStage =
  | 'validating'       // 0-5%
  | 'loading_model'    // 5-15%
  | 'generating'       // 15-85%
  | 'processing'       // 85-90%
  | 'storing'          // 90-95%
  | 'finalizing';      // 95-100%

const PROGRESS_MAP: Record<ProgressStage, number> = {
  validating: 5,
  loading_model: 15,
  generating: 15,
  processing: 85,
  storing: 90,
  finalizing: 95,
};

// ---------------------------------------------------------------------------
// Streaming Progress Simulator
// ---------------------------------------------------------------------------

/**
 * Simulates progress updates during a non-streaming AI call.
 * Since we can't get real progress from a single completion call,
 * we simulate gradual progress to give the user feedback.
 */
class ProgressSimulator {
  private interval: NodeJS.Timeout | null = null;
  private currentProgress: number;
  private readonly targetProgress: number;
  private readonly onProgress: (pct: number) => Promise<void>;

  constructor(
    startProgress: number,
    targetProgress: number,
    onProgress: (pct: number) => Promise<void>,
  ) {
    this.currentProgress = startProgress;
    this.targetProgress = targetProgress;
    this.onProgress = onProgress;
  }

  start(intervalMs: number = 3000): void {
    this.interval = setInterval(async () => {
      if (this.currentProgress < this.targetProgress) {
        // Increment with deceleration as we approach target
        const remaining = this.targetProgress - this.currentProgress;
        const increment = Math.max(1, Math.floor(remaining * 0.15));
        this.currentProgress = Math.min(this.currentProgress + increment, this.targetProgress - 1);
        await this.onProgress(this.currentProgress);
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

// ---------------------------------------------------------------------------
// AI Completion — Via AIRouter (multi-provider fallback)
// ---------------------------------------------------------------------------

interface AICompletionResult {
  content: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

async function callAI(
  userId: string,
  messages: AIMessage[],
  options: {
    model?: string;
    provider?: string;
    maxTokens?: number;
    temperature?: number;
  },
  onProgress: (pct: number) => Promise<void>,
): Promise<AICompletionResult> {
  await onProgress(10);

  const router = new AIRouter(userId, {
    timeoutMs: 250_000, // Slightly less than queue timeout to allow cleanup
  });

  // Determine model tier from options
  const modelTier = options.model === 'fast' ? 'fast' as const
    : options.model === 'powerful' ? 'powerful' as const
    : 'default' as const;

  // Start progress simulator during generation
  const simulator = new ProgressSimulator(15, 85, onProgress);
  simulator.start(2000);

  try {
    const result = await router.chat(messages, {
      model: modelTier,
      provider: options.provider,
    });

    simulator.stop();
    await onProgress(85);

    return {
      content: result.content,
      provider: result.provider,
      model: result.model,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      costUsd: result.costUsd,
    };
  } finally {
    simulator.stop();
  }
}

// ---------------------------------------------------------------------------
// Streaming AI Completion — For better progress feedback
// ---------------------------------------------------------------------------

async function callAIStream(
  userId: string,
  messages: AIMessage[],
  options: {
    model?: string;
    provider?: string;
    maxTokens?: number;
    temperature?: number;
  },
  onProgress: (pct: number) => Promise<void>,
): Promise<AICompletionResult> {
  await onProgress(10);

  const router = new AIRouter(userId, {
    timeoutMs: 250_000,
  });

  const modelTier = options.model === 'fast' ? 'fast' as const
    : options.model === 'powerful' ? 'powerful' as const
    : 'default' as const;

  let content = '';
  let chunkCount = 0;

  try {
    const stream = router.chatStream(messages, {
      model: modelTier,
      provider: options.provider,
    });

    for await (const chunk of stream) {
      if (chunk.delta) {
        content += chunk.delta;
        chunkCount++;

        // Update progress based on chunk count (logarithmic scale)
        // First few chunks get more progress than later ones
        if (chunkCount <= 5) {
          await onProgress(15 + chunkCount * 3);
        } else if (chunkCount % 5 === 0) {
          const progress = Math.min(85, 30 + Math.floor(chunkCount / 2));
          await onProgress(progress);
        }
      }

      if (chunk.done) break;
    }
  } catch (err) {
    // Streaming failed — fall back to non-streaming
    log.info('Streaming failed, falling back to non-streaming', {
      error: err instanceof Error ? err.message : String(err),
    });
    return callAI(userId, messages, options, onProgress);
  }

  await onProgress(85);

  // Approximate token counts from content length
  const approxPromptTokens = Math.ceil(
    messages.reduce((s, m) => s + m.content.length, 0) / 4,
  );
  const approxCompletionTokens = Math.ceil(content.length / 4);

  return {
    content,
    provider: 'multi', // Provider is determined by AIRouter
    model: options.model || 'default',
    promptTokens: approxPromptTokens,
    completionTokens: approxCompletionTokens,
    totalTokens: approxPromptTokens + approxCompletionTokens,
    costUsd: 0, // Cost tracked internally by AIRouter
  };
}

// ---------------------------------------------------------------------------
// Main Worker Processor
// ---------------------------------------------------------------------------

export async function processAIJob(job: Job<AIJobPayload, JobResult>): Promise<JobResult> {
  const startTime = Date.now();
  const { userId, messages, model, provider, maxTokens, temperature } = job.data;

  const reportProgress = async (stage: ProgressStage | number) => {
    const pct = typeof stage === 'number' ? stage : PROGRESS_MAP[stage];
    await job.updateProgress(pct);
  };

  log.info('Processing AI job', {
    jobId: job.id,
    userId,
    messageCount: messages.length,
    totalChars: messages.reduce((s, m) => s + m.content.length, 0),
  });

  // ---- Stage: Validating ----
  await reportProgress('validating');

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return {
      success: false,
      error: 'Messages array is required and must be non-empty',
      durationMs: Date.now() - startTime,
      provider: 'none',
      costUsd: 0,
    };
  }

  // Validate message structure
  const validRoles = new Set(['system', 'user', 'assistant']);
  for (const msg of messages) {
    if (!validRoles.has(msg.role)) {
      return {
        success: false,
        error: `Invalid message role: ${msg.role}. Must be one of: system, user, assistant`,
        durationMs: Date.now() - startTime,
        provider: 'none',
        costUsd: 0,
      };
    }
    if (!msg.content || typeof msg.content !== 'string') {
      return {
        success: false,
        error: 'Each message must have a non-empty content string',
        durationMs: Date.now() - startTime,
        provider: 'none',
        costUsd: 0,
      };
    }
  }

  // Sanitize messages
  const sanitizedMessages: AIMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content.replace(/\0/g, '').slice(0, 100_000), // 100K chars max per message
  }));

  // ---- Stage: Loading model ----
  await reportProgress('loading_model');

  // ---- Stage: Generating ----
  let result: AICompletionResult;

  try {
    // Try streaming first for better progress feedback, then fall back to non-streaming
    result = await callAIStream(
      userId,
      sanitizedMessages,
      { model, provider, maxTokens, temperature },
      reportProgress,
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'AI generation failed';

    log.error('AI job failed', {
      jobId: job.id,
      userId,
      error: errorMsg,
    });

    return {
      success: false,
      error: errorMsg,
      durationMs: Date.now() - startTime,
      provider: 'none',
      costUsd: 0,
    };
  }

  // ---- Stage: Processing ----
  await reportProgress('processing');

  // ---- Stage: Storing ----
  await reportProgress('storing');

  // Store the result in AICost for tracking
  try {
    await db.aICost.create({
      data: {
        userId,
        provider: result.provider,
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        costUsd: result.costUsd,
        requestId: job.id,
      },
    });
  } catch (dbErr) {
    log.warn('Failed to store AI cost record', {
      error: dbErr instanceof Error ? dbErr.message : String(dbErr),
    });
  }

  // ---- Stage: Finalize ----
  await reportProgress('finalizing');

  const durationMs = Date.now() - startTime;

  log.info('AI job completed', {
    jobId: job.id,
    userId,
    provider: result.provider,
    model: result.model,
    tokens: result.totalTokens,
    durationMs,
    contentLength: result.content.length,
  });

  return {
    success: !!result.content,
    data: {
      content: result.content,
      provider: result.provider,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      costUsd: result.costUsd,
    },
    durationMs,
    provider: result.provider,
    costUsd: result.costUsd,
  };
}
