/**
 * Fluro.IA Orchestrator Client — Genova SaaS
 *
 * Central AI orchestration layer that makes Fluro.IA the PRIMARY provider
 * for all AI operations in Genova. Fluro dispatches to local microservices:
 *
 *   Chat/Text     → z-ai-web-dev-sdk (Fluro-powered)
 *   Image Gen     → ComfyUI (localhost:8188) → z-ai-web-dev-sdk (fallback)
 *   Video Gen     → VideoCrafter/CogVideo (localhost:8189) → z-ai-web-dev-sdk (fallback)
 *   Speech/ASR    → SpeechBrain (localhost:8187) → z-ai-web-dev-sdk (fallback)
 *
 * Fluro is ALWAYS tried first. Other providers only activate when Fluro
 * sub-services are unreachable. This ensures maximum uptime while keeping
 * the self-hosted stack as the primary execution path.
 */

import ZAI from 'z-ai-web-dev-sdk';
import { createLogger } from '@/lib/logger';

const log = createLogger('fluro-ai');

// ============================================================
// Configuration
// ============================================================

const FLURO_CONFIG = {
  /** ComfyUI image generation server */
  comfyui: {
    url: process.env.COMFYUI_API_URL || 'http://localhost:8188',
    timeoutMs: 120_000,
    healthEndpoint: '/system_stats',
  },
  /** VideoCrafter/CogVideo video generation server */
  video: {
    url: process.env.VIDEO_API_URL || 'http://localhost:8189',
    timeoutMs: 300_000,
    healthEndpoint: '/health',
  },
  /** SpeechBrain ASR server */
  speechbrain: {
    url: process.env.SPEECHBRAIN_API_URL || 'http://localhost:8187',
    timeoutMs: 60_000,
    healthEndpoint: '/health',
  },
  /** Default timeout for AI chat completions */
  chatTimeoutMs: 60_000,
  /** Maximum retries for transient failures */
  maxRetries: 3,
  /** Base delay between retries (ms), doubles each attempt */
  retryDelayMs: 500,
} as const;

// ============================================================
// Types
// ============================================================

export interface FluroChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface FluroImageOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  sampler?: string;
  model?: string;
  n?: number;
}

export interface FluroVideoOptions {
  prompt: string;
  model?: 'cogvideo' | 'videocrafter';
  duration?: number;
  fps?: number;
  resolution?: string;
  seed?: number;
}

export interface FluroChatResult {
  content: string;
  provider: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface FluroImageResult {
  imageUrl: string | null;
  provider: string;
  seed?: number;
  width: number;
  height: number;
  metadata: Record<string, unknown>;
}

export interface FluroVideoResult {
  videoUrl: string | null;
  provider: string;
  taskId?: string;
  status?: string;
  duration?: number;
  fps?: number;
  metadata: Record<string, unknown>;
}

export type FluroServiceStatus = 'online' | 'offline' | 'degraded';

export interface FluroHealthReport {
  overall: FluroServiceStatus;
  comfyui: FluroServiceStatus;
  video: FluroServiceStatus;
  speechbrain: FluroServiceStatus;
  chat: FluroServiceStatus;
  checkedAt: Date;
  details: {
    comfyui?: { responseTimeMs: number; error?: string };
    video?: { responseTimeMs: number; error?: string };
    speechbrain?: { responseTimeMs: number; error?: string };
    chat?: { responseTimeMs: number; error?: string };
  };
}

// ============================================================
// Service Health Checks
// ============================================================

/**
 * Check if a Fluro sub-service is reachable.
 */
async function checkService(
  url: string,
  healthEndpoint: string,
  timeoutMs = 5_000,
): Promise<{ online: boolean; responseTimeMs: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${url}${healthEndpoint}`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return {
      online: res.ok,
      responseTimeMs: Date.now() - start,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      online: false,
      responseTimeMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unreachable',
    };
  }
}

/**
 * Perform a full Fluro health check across all sub-services.
 */
export async function checkFluroHealth(): Promise<FluroHealthReport> {
  const [comfyui, video, speechbrain] = await Promise.all([
    checkService(FLURO_CONFIG.comfyui.url, FLURO_CONFIG.comfyui.healthEndpoint),
    checkService(FLURO_CONFIG.video.url, FLURO_CONFIG.video.healthEndpoint),
    checkService(FLURO_CONFIG.speechbrain.url, FLURO_CONFIG.speechbrain.healthEndpoint),
  ]);

  // Chat via z-ai-sdk is always available (it's a cloud service)
  const chatStart = Date.now();
  let chatOnline = true;
  let chatError: string | undefined;
  try {
    const zai = await ZAI.create();
    await zai.chat.completions.create({
      messages: [{ role: 'user', content: 'ping' }],
      model: 'default',
      stream: false,
      max_tokens: 1,
    });
  } catch (error) {
    chatOnline = false;
    chatError = error instanceof Error ? error.message : 'Unreachable';
  }
  const chat: { online: boolean; responseTimeMs: number; error?: string } = {
    online: chatOnline,
    responseTimeMs: Date.now() - chatStart,
    error: chatError,
  };

  // Determine overall status
  const onlineCount = [comfyui.online, video.online, speechbrain.online, chat.online].filter(Boolean).length;
  let overall: FluroServiceStatus;
  if (onlineCount === 4) {
    overall = 'online';
  } else if (onlineCount >= 2) {
    overall = 'degraded';
  } else if (chat.online) {
    // Chat (z-ai-sdk) is the critical fallback — if it's up, we're at least degraded
    overall = 'degraded';
  } else {
    overall = 'offline';
  }

  return {
    overall,
    comfyui: comfyui.online ? 'online' : 'offline',
    video: video.online ? 'online' : 'offline',
    speechbrain: speechbrain.online ? 'online' : 'offline',
    chat: chat.online ? 'online' : 'offline',
    checkedAt: new Date(),
    details: { comfyui, video, speechbrain, chat },
  };
}

// ============================================================
// Chat — Fluro via z-ai-web-dev-sdk
// ============================================================

/**
 * Chat completion via Fluro (z-ai-web-dev-sdk).
 * This is the primary chat/text AI path for all Genova operations.
 */
export async function fluroChat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: FluroChatOptions = {},
): Promise<FluroChatResult> {
  const zai = await ZAI.create();
  const controller = new AbortController();

  const timeoutMs = options.maxTokens
    ? Math.max(FLURO_CONFIG.chatTimeoutMs, options.maxTokens * 50)
    : FLURO_CONFIG.chatTimeoutMs;

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const completion = await Promise.race([
      zai.chat.completions.create({
        messages,
        model: options.model || 'default',
        stream: false,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      }),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`Fluro chat timed out after ${timeoutMs}ms`));
        }, { once: true });
      }),
    ]);

    const content = completion.choices?.[0]?.message?.content ?? '';
    const usage = completion.usage ?? {};

    return {
      content,
      provider: 'fluro',
      model: options.model || 'default',
      usage: {
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
      },
    };
  } finally {
    clearTimeout(timer);
    if (!controller.signal.aborted) {
      controller.abort();
    }
  }
}

/**
 * Streaming chat completion via Fluro (z-ai-web-dev-sdk).
 */
export async function* fluroChatStream(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: FluroChatOptions = {},
): AsyncGenerator<{ delta: string; done: boolean; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const zai = await ZAI.create();
  const controller = new AbortController();
  const connectionTimer = setTimeout(() => controller.abort(), FLURO_CONFIG.chatTimeoutMs);

  try {
    const completion = await Promise.race([
      zai.chat.completions.create({
        messages,
        model: options.model || 'default',
        stream: true,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      }),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`Fluro stream connection timed out`));
        }, { once: true });
      }),
    ]);

    clearTimeout(connectionTimer);

    for await (const chunk of completion) {
      if (controller.signal.aborted) break;
      const delta = chunk.choices?.[0]?.delta?.content ?? '';
      if (delta) {
        yield { delta, done: false };
      }
    }

    yield {
      delta: '',
      done: true,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  } finally {
    clearTimeout(connectionTimer);
    if (!controller.signal.aborted) {
      controller.abort();
    }
  }
}

// ============================================================
// Image Generation — Fluro via ComfyUI → z-ai-sdk fallback
// ============================================================

/**
 * Generate an image via Fluro's ComfyUI pipeline.
 * Falls back to z-ai-sdk if ComfyUI is unreachable.
 */
export async function fluroGenerateImage(params: FluroImageOptions): Promise<FluroImageResult> {
  const { prompt, negativePrompt, width = 1024, height = 1024, steps = 20, seed, sampler = 'euler', model } = params;

  if (!prompt || prompt.trim().length === 0) {
    throw new Error('Prompt is required for image generation');
  }

  // --- Try ComfyUI first (Fluro's primary image path) ---
  try {
    const result = await generateImageViaComfyUI({
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      seed,
      sampler,
      model,
    });
    if (result.imageUrl) {
      log.info('Image generated via ComfyUI (Fluro)', {
        provider: 'fluro-comfyui',
        width,
        height,
      });
      return result;
    }
  } catch (error) {
    log.info('ComfyUI unavailable, falling back to z-ai-sdk for image generation', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // --- Fallback: z-ai-web-dev-sdk ---
  try {
    const result = await generateImageViaSDK(prompt, width, height);
    log.info('Image generated via z-ai-sdk (Fluro fallback)', {
      provider: 'fluro-sdk',
      width,
      height,
    });
    return result;
  } catch (error) {
    throw new Error(
      `Fluro image generation failed: All providers exhausted. ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Generate image via ComfyUI API.
 */
async function generateImageViaComfyUI(params: {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps: number;
  seed?: number;
  sampler: string;
  model?: string;
}): Promise<FluroImageResult> {
  const { prompt, negativePrompt, width, height, steps, seed, sampler, model } = params;
  const comfyuiUrl = FLURO_CONFIG.comfyui.url;

  const workflowSeed = seed || Math.floor(Math.random() * 2147483647);

  const workflow = {
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: workflowSeed,
        steps,
        cfg: 7,
        sampler_name: sampler,
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
      inputs: {
        ckpt_name: model || 'v1-5-pruned-emaonly.safetensors',
      },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width, height, batch_size: 1 },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: prompt, clip: ['4', 1] },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: negativePrompt || '', clip: ['4', 1] },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'Fluro_Genova', images: ['8', 0] },
    },
  };

  // Submit the workflow to ComfyUI
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FLURO_CONFIG.comfyui.timeoutMs);

  try {
    const res = await fetch(`${comfyuiUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`ComfyUI API error (${res.status}): ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();
    const promptId = data.prompt_id;

    // Poll for result (max 60 iterations × 2s = 120s)
    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2000));

      const statusRes = await fetch(`${comfyuiUrl}/history/${promptId}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const history = statusData[promptId];

        if (history?.status?.completed) {
          const images = history.outputs?.['9']?.images;
          if (images && images.length > 0) {
            const img = images[0];
            const imageUrl = `${comfyuiUrl}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type || 'output'}`;
            return {
              imageUrl,
              provider: 'fluro-comfyui',
              seed: workflowSeed,
              width,
              height,
              metadata: { provider: 'fluro-comfyui', promptId, model: model || 'v1-5-pruned-emaonly.safetensors' },
            };
          }
        }

        if (history?.status?.status_str === 'error') {
          throw new Error('ComfyUI generation error: workflow execution failed');
        }
      }
      attempts++;
    }

    throw new Error('ComfyUI generation timed out');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate image via z-ai-web-dev-sdk (Fluro fallback).
 */
async function generateImageViaSDK(
  prompt: string,
  width: number,
  height: number,
): Promise<FluroImageResult> {
  const zai = await ZAI.create();

  // Determine valid size from supported sizes
  const supportedSizes = [
    '1024x1024', '768x1344', '1344x768',
    '864x1152', '1152x864', '1440x720', '720x1440',
  ] as const;

  type SupportedSize = typeof supportedSizes[number];
  const requestedSize = `${width}x${height}`;
  const size: SupportedSize = supportedSizes.includes(requestedSize as SupportedSize)
    ? (requestedSize as SupportedSize)
    : '1024x1024';

  const result = await zai.images.generations.create({
    prompt,
    size,
  });

  const imageUrl = result.data?.[0]?.base64 || null;

  return {
    imageUrl,
    provider: 'fluro-sdk',
    width,
    height,
    metadata: {
      provider: 'fluro-sdk',
      originalProvider: 'z-ai-web-dev-sdk',
      size,
      fallbackFrom: 'comfyui',
    },
  };
}

// ============================================================
// Video Generation — Fluro via VideoCrafter/CogVideo → z-ai-sdk fallback
// ============================================================

/**
 * Generate a video via Fluro's VideoCrafter/CogVideo pipeline.
 * Falls back to z-ai-sdk if the video server is unreachable.
 */
export async function fluroGenerateVideo(params: FluroVideoOptions): Promise<FluroVideoResult> {
  const { prompt, model = 'cogvideo', duration = 4, fps = 8, resolution = '480x480', seed } = params;

  if (!prompt || prompt.trim().length === 0) {
    throw new Error('Prompt is required for video generation');
  }

  // --- Try VideoCrafter/CogVideo first (Fluro's primary video path) ---
  try {
    const result = await generateVideoViaLocalServer({
      prompt,
      model,
      duration,
      fps,
      resolution,
      seed,
    });
    log.info('Video generated via local server (Fluro)', {
      provider: 'fluro-video',
      model,
    });
    return result;
  } catch (error) {
    log.info('Video server unavailable, falling back to z-ai-sdk for video generation', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // --- Fallback: z-ai-web-dev-sdk ---
  try {
    const result = await generateVideoViaSDK(prompt);
    log.info('Video generated via z-ai-sdk (Fluro fallback)', {
      provider: 'fluro-sdk',
    });
    return result;
  } catch (error) {
    throw new Error(
      `Fluro video generation failed: All providers exhausted. ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Generate video via local VideoCrafter/CogVideo server.
 */
async function generateVideoViaLocalServer(params: {
  prompt: string;
  model: string;
  duration: number;
  fps: number;
  resolution: string;
  seed?: number;
}): Promise<FluroVideoResult> {
  const { prompt, model, duration, fps, resolution, seed } = params;
  const videoUrl = FLURO_CONFIG.video.url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FLURO_CONFIG.video.timeoutMs);

  try {
    const res = await fetch(`${videoUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model, duration, fps, resolution, seed }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Video API error (${res.status}): ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();

    // If async, return task ID for polling
    if (data.taskId) {
      return {
        videoUrl: null,
        provider: 'fluro-video',
        taskId: data.taskId,
        status: 'processing',
        duration,
        fps,
        metadata: { async: true, taskId: data.taskId, model },
      };
    }

    // If sync, return video URL
    return {
      videoUrl: data.videoUrl || data.url || null,
      provider: 'fluro-video',
      duration: data.duration || duration,
      fps: data.fps || fps,
      metadata: { model, sync: true },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate video via z-ai-web-dev-sdk (Fluro fallback).
 * The SDK currently supports image generation — for video we use
 * image generation as a frame and note the limitation.
 */
async function generateVideoViaSDK(prompt: string): Promise<FluroVideoResult> {
  // Use z-ai-sdk image generation as the best available fallback
  // This generates a representative image since video isn't available via SDK
  const zai = await ZAI.create();

  const result = await zai.images.generations.create({
    prompt: `Cinematic still frame: ${prompt}`,
    size: '1024x1024',
  });

  const imageUrl = result.data?.[0]?.base64 || null;

  return {
    videoUrl: imageUrl, // Image as fallback when video unavailable
    provider: 'fluro-sdk',
    status: 'image_fallback',
    metadata: {
      provider: 'fluro-sdk',
      originalProvider: 'z-ai-web-dev-sdk',
      fallbackFrom: 'videocrafter',
      note: 'Video server unavailable — generated representative image instead',
    },
  };
}

/**
 * Check the status of a video generation task.
 */
export async function fluroGetVideoStatus(taskId: string): Promise<{
  status: string;
  progress: number;
  videoUrl?: string;
}> {
  const videoUrl = FLURO_CONFIG.video.url;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(`${videoUrl}/status/${taskId}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`Status check error: ${res.status}`);
    }

    const data = await res.json();
    return {
      status: data.status || 'unknown',
      progress: data.progress || 0,
      videoUrl: data.videoUrl || data.url,
    };
  } catch (error) {
    return {
      status: 'error',
      progress: 0,
    };
  }
}

// ============================================================
// Retry Helper
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Execute a Fluro operation with automatic retry on transient errors.
 */
export async function fluroWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries = FLURO_CONFIG.maxRetries,
  baseDelayMs = FLURO_CONFIG.retryDelayMs,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if error is transient (429, 5xx, network)
      const msg = error instanceof Error ? error.message.toLowerCase() : '';
      const isTransient =
        msg.includes('timeout') ||
        msg.includes('econnreset') ||
        msg.includes('econnrefused') ||
        msg.includes('network') ||
        msg.includes('rate limit') ||
        msg.includes('overloaded') ||
        msg.includes('503') ||
        msg.includes('502') ||
        msg.includes('500') ||
        msg.includes('429');

      if (!isTransient || attempt === maxRetries) {
        break;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      log.info(`Fluro retry in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, {
        error: msg,
      });
      await sleep(delay);
    }
  }

  throw lastError;
}

// ============================================================
// Exports
// ============================================================

export { FLURO_CONFIG };
