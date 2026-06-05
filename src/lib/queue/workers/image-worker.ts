/**
 * Image Generation Worker — Processes jobs from the ai:image queue
 *
 * Calls external GPU server APIs (ComfyUI, OpenRouter, Replicate, or z-ai-sdk)
 * to generate images, reports progress, and stores results in DB via Prisma.
 *
 * IMPORTANT: This worker does NOT run ComfyUI locally — it calls an EXTERNAL
 * GPU server API endpoint. The fallback chain is:
 *   1. External ComfyUI server (COMFYUI_API_URL)
 *   2. OpenRouter images API
 *   3. z-ai-web-dev-sdk
 */

import { Job } from 'bullmq';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import type { ImageJobPayload, JobResult } from '../bullmq-queue';

const log = createLogger('worker-image');

const COMFYUI_API_URL = process.env.COMFYUI_API_URL || 'http://localhost:8188';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// ---------------------------------------------------------------------------
// Progress Reporting
// ---------------------------------------------------------------------------

type ProgressStage =
  | 'validating'     // 0-5%
  | 'deduplicating'  // 5-10%
  | 'calling_api'    // 10-80%
  | 'processing'     // 80-90%
  | 'storing'        // 90-95%
  | 'finalizing';    // 95-100%

const PROGRESS_MAP: Record<ProgressStage, number> = {
  validating: 5,
  deduplicating: 10,
  calling_api: 10,
  processing: 80,
  storing: 90,
  finalizing: 95,
};

// ---------------------------------------------------------------------------
// Image Generation — External ComfyUI Server
// ---------------------------------------------------------------------------

interface ComfyUIResult {
  imageUrl: string;
  seed: number;
  provider: 'comfyui';
  costUsd?: number;
}

async function generateViaComfyUI(
  prompt: string,
  options: {
    negativePrompt?: string;
    width?: number;
    height?: number;
    steps?: number;
    seed?: number;
    sampler?: string;
    model?: string;
  },
  onProgress: (pct: number) => Promise<void>,
): Promise<ComfyUIResult> {
  const workflow = {
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: options.seed || Math.floor(Math.random() * 2147483647),
        steps: options.steps || 20,
        cfg: 7,
        sampler_name: options.sampler || 'euler',
        scheduler: 'normal',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: options.model || 'v1-5-pruned-emaonly.safetensors' },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width: options.width || 512, height: options.height || 512, batch_size: 1 },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: prompt, clip: ['4', 1] },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: options.negativePrompt || '', clip: ['4', 1] },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'Genova', images: ['8', 0] },
    },
  };

  await onProgress(15);

  const res = await fetch(`${COMFYUI_API_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`ComfyUI API error (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const promptId = data.prompt_id;

  await onProgress(30);

  // Poll for result with progress reporting
  let attempts = 0;
  const maxAttempts = 60; // 2 minutes max

  while (attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 2000));
    attempts++;

    const statusRes = await fetch(`${COMFYUI_API_URL}/history/${promptId}`);
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      const history = statusData[promptId];

      if (history?.status?.completed) {
        const images = history.outputs?.['9']?.images;
        if (images && images.length > 0) {
          const img = images[0];
          const imageUrl = `${COMFYUI_API_URL}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type || 'output'}`;

          await onProgress(80);
          return { imageUrl, seed: workflow['3'].inputs.seed as number, provider: 'comfyui', costUsd: 0 };
        }
      }

      if (history?.status?.status_str === 'error') {
        throw new Error('ComfyUI generation failed: server reported error');
      }
    }

    // Report incremental progress during polling
    const pollProgress = 30 + Math.floor((attempts / maxAttempts) * 50);
    await onProgress(pollProgress);
  }

  throw new Error('ComfyUI generation timed out (120s)');
}

// ---------------------------------------------------------------------------
// Image Generation — OpenRouter
// ---------------------------------------------------------------------------

interface OpenRouterResult {
  imageUrl: string | null;
  provider: 'openrouter';
  costUsd: number;
}

async function generateViaOpenRouter(
  prompt: string,
  options: { width?: number; height?: number; model?: string },
  onProgress: (pct: number) => Promise<void>,
): Promise<OpenRouterResult> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  await onProgress(20);

  const modelId = options.model || 'black-forest-labs/flux-1-schnell:free';
  const sizeStr = `${options.width || 1024}x${options.height || 1024}`;

  const res = await fetch('https://openrouter.ai/api/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Genova.AI',
    },
    body: JSON.stringify({
      model: modelId,
      prompt,
      n: 1,
      size: sizeStr,
    }),
  });

  await onProgress(60);

  if (!res.ok) {
    const errorBody = await res.text().catch(() => 'Unknown error');
    throw new Error(`OpenRouter API error (${res.status}): ${errorBody.slice(0, 200)}`);
  }

  const data = await res.json();

  let imageUrl: string | null = null;
  if (data.data && Array.isArray(data.data) && data.data.length > 0) {
    imageUrl = data.data[0].url || data.data[0].b64_json || null;
  }

  await onProgress(80);

  return {
    imageUrl,
    provider: 'openrouter',
    costUsd: modelId.includes(':free') ? 0 : 0.01,
  };
}

// ---------------------------------------------------------------------------
// Image Generation — z-ai-web-dev-sdk (final fallback)
// ---------------------------------------------------------------------------

interface SDKResult {
  imageUrl: string | null;
  provider: 'z-ai-sdk';
  costUsd: number;
}

async function generateViaSDK(
  prompt: string,
  options: { width?: number; height?: number; model?: string },
  onProgress: (pct: number) => Promise<void>,
): Promise<SDKResult> {
  await onProgress(20);

  const { default: ZAI } = await import('z-ai-web-dev-sdk');
  const client = await ZAI.create();

  await onProgress(40);

  const size = `${options.width || 1024}x${options.height || 1024}` as '1024x1024';

  const result = await client.images.generations.create({
    model: options.model || 'flux-1-schnell-free',
    prompt,
    size,
  });

  await onProgress(80);

  let imageUrl: string | null = null;
  if (result.data && Array.isArray(result.data) && result.data.length > 0) {
    const img = result.data[0] as Record<string, unknown>;
    imageUrl = (img.base64 as string) || (img.url as string) || null;
  }

  return {
    imageUrl,
    provider: 'z-ai-sdk',
    costUsd: 0,
  };
}

// ---------------------------------------------------------------------------
// Main Worker Processor
// ---------------------------------------------------------------------------

export async function processImageJob(job: Job<ImageJobPayload, JobResult>): Promise<JobResult> {
  const startTime = Date.now();
  const { userId, prompt, model, width, height, negativePrompt, steps, seed, sampler } = job.data;

  const reportProgress = async (stage: ProgressStage | number) => {
    const pct = typeof stage === 'number' ? stage : PROGRESS_MAP[stage];
    await job.updateProgress(pct);
  };

  log.info('Processing image job', { jobId: job.id, userId, prompt: prompt.slice(0, 100) });

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
  await reportProgress('deduplicating');

  const generation = await db.imageGeneration.create({
    data: {
      userId,
      prompt: sanitizedPrompt,
      model: model || 'flux-1-schnell-free',
      provider: 'pending',
      status: 'pending',
      costUsd: 0,
      width: width || 1024,
      height: height || 1024,
      metadata: JSON.stringify({
        jobId: job.id,
        requestedAt: new Date().toISOString(),
        negativePrompt,
        steps,
        seed,
        sampler,
      }),
    },
  });

  // ---- Stage: Call API (with fallback chain) ----
  await reportProgress('calling_api');

  let result: {
    imageUrl: string | null;
    provider: string;
    costUsd?: number;
    seed?: number;
  };

  let usedProvider = 'none';
  let costUsd = 0;

  // Fallback chain: ComfyUI → OpenRouter → z-ai-sdk
  try {
    result = await generateViaComfyUI(
      sanitizedPrompt,
      { negativePrompt, width, height, steps, seed, sampler, model },
      reportProgress,
    );
    usedProvider = result.provider;
    costUsd = result.costUsd ?? 0;
  } catch (comfyuiErr) {
    log.info('ComfyUI failed, trying OpenRouter fallback', {
      error: comfyuiErr instanceof Error ? comfyuiErr.message : String(comfyuiErr),
    });

    try {
      result = await generateViaOpenRouter(
        sanitizedPrompt,
        { width, height, model },
        reportProgress,
      );
      usedProvider = result.provider;
      costUsd = result.costUsd ?? 0;
    } catch (openrouterErr) {
      log.info('OpenRouter failed, trying z-ai-sdk fallback', {
        error: openrouterErr instanceof Error ? openrouterErr.message : String(openrouterErr),
      });

      try {
        result = await generateViaSDK(
          sanitizedPrompt,
          { width, height, model },
          reportProgress,
        );
        usedProvider = result.provider;
        costUsd = result.costUsd ?? 0;
      } catch (sdkErr) {
        const finalError = sdkErr instanceof Error ? sdkErr.message : 'All image generation providers failed';

        // Update DB with failure
        await db.imageGeneration.update({
          where: { id: generation.id },
          data: {
            status: 'failed',
            provider: usedProvider || 'none',
            metadata: JSON.stringify({
              jobId: job.id,
              error: finalError,
              failedAt: new Date().toISOString(),
              comfyuiError: comfyuiErr instanceof Error ? comfyuiErr.message : String(comfyuiErr),
              openrouterError: openrouterErr instanceof Error ? openrouterErr.message : String(openrouterErr),
              sdkError: sdkErr instanceof Error ? sdkErr.message : String(sdkErr),
            }),
          },
        });

        return {
          success: false,
          error: finalError,
          durationMs: Date.now() - startTime,
          provider: usedProvider,
          costUsd: 0,
        };
      }
    }
  }

  // ---- Stage: Store result ----
  await reportProgress('storing');

  const imageUrl = result.imageUrl;

  await db.imageGeneration.update({
    where: { id: generation.id },
    data: {
      imageUrl,
      status: imageUrl ? 'completed' : 'failed',
      provider: usedProvider,
      costUsd,
      metadata: JSON.stringify({
        jobId: job.id,
        provider: usedProvider,
        completedAt: new Date().toISOString(),
        seed: result.seed,
      }),
    },
  });

  // Track cost in AICost table
  if (costUsd > 0) {
    await db.aICost.create({
      data: {
        userId,
        provider: usedProvider,
        model: model || 'flux-1-schnell-free',
        costUsd,
        requestId: generation.id,
      },
    }).catch((err) => {
      log.warn('Failed to track AI cost', { error: err instanceof Error ? err.message : String(err) });
    });
  }

  // ---- Stage: Finalize ----
  await reportProgress('finalizing');

  const durationMs = Date.now() - startTime;

  log.info('Image job completed', {
    jobId: job.id,
    userId,
    provider: usedProvider,
    durationMs,
    hasImage: !!imageUrl,
  });

  return {
    success: !!imageUrl,
    data: {
      generationId: generation.id,
      imageUrl: imageUrl || undefined,
      provider: usedProvider,
      seed: result.seed,
      width: width || 1024,
      height: height || 1024,
    },
    durationMs,
    provider: usedProvider,
    costUsd,
  };
}
