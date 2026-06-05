/**
 * Video Generation Worker — Processes jobs from the ai:video queue
 *
 * Calls external video API (GPU server endpoint) to generate videos,
 * reports progress, and stores results in DB via Prisma.
 *
 * External API: VIDEO_API_URL (CogVideo / VideoCrafter GPU server)
 */

import { Job } from 'bullmq';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import type { VideoJobPayload, JobResult } from '../bullmq-queue';

const log = createLogger('worker-video');

const VIDEO_API_URL = process.env.VIDEO_API_URL || 'http://localhost:8189';

// ---------------------------------------------------------------------------
// Progress Reporting
// ---------------------------------------------------------------------------

type ProgressStage =
  | 'validating'     // 0-5%
  | 'creating_db'    // 5-10%
  | 'calling_api'    // 10-70%
  | 'polling'        // 70-90%
  | 'storing'        // 90-95%
  | 'finalizing';    // 95-100%

const PROGRESS_MAP: Record<ProgressStage, number> = {
  validating: 5,
  creating_db: 10,
  calling_api: 10,
  polling: 70,
  storing: 90,
  finalizing: 95,
};

// ---------------------------------------------------------------------------
// Video Generation — External GPU Server API
// ---------------------------------------------------------------------------

interface VideoAPIResult {
  videoUrl: string;
  duration: number;
  fps: number;
  provider: string;
}

async function generateViaExternalAPI(
  prompt: string,
  options: {
    model?: string;
    duration?: number;
    fps?: number;
    resolution?: string;
    seed?: number;
  },
  onProgress: (pct: number) => Promise<void>,
): Promise<VideoAPIResult> {
  await onProgress(20);

  const model = options.model || 'cogvideo';
  const duration = options.duration || 4;
  const fps = options.fps || 8;
  const resolution = options.resolution || '480x480';

  const res = await fetch(`${VIDEO_API_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model,
      duration,
      fps,
      resolution,
      seed: options.seed,
    }),
  });

  await onProgress(40);

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Video API error (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();

  // If the API returns a task ID (async processing), poll for completion
  if (data.taskId) {
    return pollForVideoResult(data.taskId, model, onProgress);
  }

  // If synchronous, return directly
  await onProgress(80);

  return {
    videoUrl: data.videoUrl || data.url,
    duration: data.duration || duration,
    fps: data.fps || fps,
    provider: model,
  };
}

async function pollForVideoResult(
  taskId: string,
  model: string,
  onProgress: (pct: number) => Promise<void>,
): Promise<VideoAPIResult> {
  let attempts = 0;
  const maxAttempts = 150; // 5 minutes max (2s per attempt)

  while (attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 2000));
    attempts++;

    try {
      const statusRes = await fetch(`${VIDEO_API_URL}/status/${taskId}`);
      if (!statusRes.ok) {
        log.warn('Video status check failed', { taskId, status: statusRes.status });
        continue;
      }

      const statusData = await statusRes.json();

      // Report progress based on API progress if available
      if (typeof statusData.progress === 'number') {
        const pct = 40 + Math.floor(statusData.progress * 0.4);
        await onProgress(pct);
      } else {
        const pollProgress = 40 + Math.floor((attempts / maxAttempts) * 40);
        await onProgress(pollProgress);
      }

      if (statusData.status === 'completed' || statusData.status === 'success') {
        await onProgress(80);
        return {
          videoUrl: statusData.videoUrl || statusData.url,
          duration: statusData.duration || 4,
          fps: statusData.fps || 8,
          provider: model,
        };
      }

      if (statusData.status === 'failed' || statusData.status === 'error') {
        throw new Error(`Video generation failed: ${statusData.error || 'Unknown error'}`);
      }

      // Still processing — continue polling
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Video generation failed')) {
        throw err;
      }
      log.warn('Video status poll error, retrying', { taskId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  throw new Error('Video generation timed out (5 minutes)');
}

// ---------------------------------------------------------------------------
// Video Generation — Replicate API (alternative fallback)
// ---------------------------------------------------------------------------

async function generateViaReplicate(
  prompt: string,
  options: {
    model?: string;
    duration?: number;
    fps?: number;
    resolution?: string;
  },
  onProgress: (pct: number) => Promise<void>,
): Promise<VideoAPIResult> {
  const replicateToken = process.env.REPLICATE_API_TOKEN;
  if (!replicateToken) {
    throw new Error('REPLICATE_API_TOKEN not configured');
  }

  await onProgress(20);

  const modelVersion = options.model === 'videocrafter'
    ? 'anotherjesse/zeroscope-v2-xl:9f7356719f40a38d5c89e3f6d9c6c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5'
    : 'anotherjesse/zeroscope-v2-xl:9f7356719f40a38d5c89e3f6d9c6c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5';

  // Create prediction
  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${replicateToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: modelVersion.split(':')[1],
      input: {
        prompt,
        num_frames: (options.duration || 4) * (options.fps || 8),
      },
    }),
  });

  if (!createRes.ok) {
    const errBody = await createRes.text().catch(() => '');
    throw new Error(`Replicate API error (${createRes.status}): ${errBody.slice(0, 200)}`);
  }

  const prediction = await createRes.json();
  const predictionId = prediction.id;

  await onProgress(40);

  // Poll for result
  let attempts = 0;
  const maxAttempts = 150;

  while (attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 2000));
    attempts++;

    const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${replicateToken}` },
    });

    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();

    const pollProgress = 40 + Math.floor((attempts / maxAttempts) * 40);
    await onProgress(pollProgress);

    if (statusData.status === 'succeeded') {
      await onProgress(80);
      const output = Array.isArray(statusData.output) ? statusData.output[0] : statusData.output;
      return {
        videoUrl: output,
        duration: options.duration || 4,
        fps: options.fps || 8,
        provider: 'replicate',
      };
    }

    if (statusData.status === 'failed' || statusData.status === 'canceled') {
      throw new Error(`Replicate generation failed: ${statusData.error || 'Unknown error'}`);
    }
  }

  throw new Error('Replicate generation timed out (5 minutes)');
}

// ---------------------------------------------------------------------------
// Main Worker Processor
// ---------------------------------------------------------------------------

export async function processVideoJob(job: Job<VideoJobPayload, JobResult>): Promise<JobResult> {
  const startTime = Date.now();
  const { userId, prompt, model, duration, fps, resolution, seed } = job.data;

  const reportProgress = async (stage: ProgressStage | number) => {
    const pct = typeof stage === 'number' ? stage : PROGRESS_MAP[stage];
    await job.updateProgress(pct);
  };

  log.info('Processing video job', { jobId: job.id, userId, prompt: prompt.slice(0, 100) });

  // ---- Stage: Validating ----
  await reportProgress('validating');

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return {
      success: false,
      error: 'Prompt is required and must be a non-empty string',
      durationMs: Date.now() - startTime,
      provider: 'none',
      costUsd: 0,
    };
  }

  const sanitizedPrompt = prompt.replace(/<[^>]*>/g, '').replace(/\0/g, '').trim().slice(0, 2000);

  if (sanitizedPrompt.length === 0) {
    return {
      success: false,
      error: 'Prompt is empty after sanitization',
      durationMs: Date.now() - startTime,
      provider: 'none',
      costUsd: 0,
    };
  }

  // ---- Stage: Create DB record (pending) ----
  await reportProgress('creating_db');

  // Use a raw approach since VideoGeneration model may not be in Prisma client yet
  let generationId: string;
  try {
    const generation = await db.videoGeneration.create({
      data: {
        userId,
        prompt: sanitizedPrompt,
        model: model || 'cogvideo',
        provider: 'pending',
        status: 'pending',
        costUsd: 0,
        duration: duration || 4,
        fps: fps || 8,
        resolution: resolution || '480x480',
        metadata: JSON.stringify({
          jobId: job.id,
          requestedAt: new Date().toISOString(),
          seed,
        }),
      },
    });
    generationId = generation.id;
  } catch (dbErr) {
    log.warn('VideoGeneration table not available, proceeding without DB tracking', {
      error: dbErr instanceof Error ? dbErr.message : String(dbErr),
    });
    generationId = `tmp_${job.id}`;
  }

  // ---- Stage: Call API (with fallback chain) ----
  await reportProgress('calling_api');

  let result: VideoAPIResult;
  let usedProvider = 'none';
  let costUsd = 0;

  try {
    result = await generateViaExternalAPI(
      sanitizedPrompt,
      { model, duration, fps, resolution, seed },
      reportProgress,
    );
    usedProvider = result.provider;
  } catch (apiErr) {
    log.info('External video API failed, trying Replicate fallback', {
      error: apiErr instanceof Error ? apiErr.message : String(apiErr),
    });

    try {
      result = await generateViaReplicate(
        sanitizedPrompt,
        { model, duration, fps, resolution },
        reportProgress,
      );
      usedProvider = result.provider;
      costUsd = 0.05; // Replicate approximate cost
    } catch (replicateErr) {
      const finalError = replicateErr instanceof Error
        ? replicateErr.message
        : 'All video generation providers failed';

      // Update DB with failure
      try {
        await db.videoGeneration.update({
          where: { id: generationId },
          data: {
            status: 'failed',
            provider: usedProvider || 'none',
            metadata: JSON.stringify({
              jobId: job.id,
              error: finalError,
              failedAt: new Date().toISOString(),
              externalApiError: apiErr instanceof Error ? apiErr.message : String(apiErr),
              replicateError: replicateErr instanceof Error ? replicateErr.message : String(replicateErr),
            }),
          },
        });
      } catch {
        // DB table might not exist
      }

      return {
        success: false,
        error: finalError,
        durationMs: Date.now() - startTime,
        provider: usedProvider,
        costUsd: 0,
      };
    }
  }

  // ---- Stage: Store result ----
  await reportProgress('storing');

  const videoUrl = result.videoUrl;

  try {
    await db.videoGeneration.update({
      where: { id: generationId },
      data: {
        videoUrl,
        status: videoUrl ? 'completed' : 'failed',
        provider: usedProvider,
        costUsd,
        duration: result.duration,
        fps: result.fps,
        metadata: JSON.stringify({
          jobId: job.id,
          provider: usedProvider,
          completedAt: new Date().toISOString(),
        }),
      },
    });
  } catch (dbErr) {
    log.warn('Failed to update VideoGeneration record', {
      error: dbErr instanceof Error ? dbErr.message : String(dbErr),
    });
  }

  // Track cost
  if (costUsd > 0) {
    try {
      await db.aICost.create({
        data: {
          userId,
          provider: usedProvider,
          model: model || 'cogvideo',
          costUsd,
          requestId: generationId,
        },
      });
    } catch {
      // Non-critical
    }
  }

  // ---- Stage: Finalize ----
  await reportProgress('finalizing');

  const durationMs = Date.now() - startTime;

  log.info('Video job completed', {
    jobId: job.id,
    userId,
    provider: usedProvider,
    durationMs,
    hasVideo: !!videoUrl,
  });

  return {
    success: !!videoUrl,
    data: {
      generationId,
      videoUrl: videoUrl || undefined,
      provider: usedProvider,
      duration: result.duration,
      fps: result.fps,
    },
    durationMs,
    provider: usedProvider,
    costUsd,
  };
}
