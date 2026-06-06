/**
 * ComfyUI Client — Connect to local ComfyUI instance for image generation
 * 
 * ComfyUI is a powerful and modular Stable Diffusion GUI and backend.
 * This client communicates with ComfyUI's REST API to submit and monitor workflows.
 * 
 * Fallback: If ComfyUI is unavailable, the image-generator falls back to OpenRouter/z-ai-sdk.
 * 
 * Environment variables:
 *   COMFYUI_URL — Base URL of the ComfyUI instance (default: http://localhost:8188)
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('comfyui-client');

// Types
export interface ComfyUIWorkflowNode {
  id: number;
  type: string;
  inputs: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

export interface ComfyUIWorkflow {
  [nodeId: string]: ComfyUIWorkflowNode;
}

export interface ComfyUIQueueItem {
  prompt: ComfyUIWorkflow;
  client_id?: string;
}

export interface ComfyUIQueueResponse {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, unknown>;
}

export interface ComfyUIHistoryItem {
  prompt: ComfyUIQueueResponse;
  outputs: Record<string, {
    images?: Array<{ filename: string; subfolder: string; type: string }>;
  }>;
  status?: {
    status_str: string;
    completed: boolean;
    messages?: string[][];
  };
}

export interface ComfyUIGenerateOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  samplerName?: string;
  scheduler?: string;
  model?: string;
  batchSize?: number;
}

export interface ComfyUIGenerateResult {
  success: boolean;
  images: Array<{
    data: string; // base64 encoded
    filename: string;
    type: string;
  }>;
  promptId: string;
  durationMs: number;
  metadata: Record<string, unknown>;
}

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://localhost:8188';

// Default model checkpoint
const DEFAULT_CHECKPOINT = 'v1-5-pruned-emaonly.safetensors';
const DEFAULT_SAMPLER = 'euler';
const DEFAULT_SCHEDULER = 'normal';
const DEFAULT_STEPS = 20;
const DEFAULT_CFG_SCALE = 7;

/**
 * Build a standard txt2img workflow for ComfyUI API format
 */
function buildTxt2ImgWorkflow(options: ComfyUIGenerateOptions): ComfyUIWorkflow {
  const seed = options.seed ?? Math.floor(Math.random() * 2147483647);
  const width = options.width || 1024;
  const height = options.height || 1024;
  const steps = options.steps || DEFAULT_STEPS;
  const cfgScale = options.cfgScale || DEFAULT_CFG_SCALE;
  const checkpoint = options.model || DEFAULT_CHECKPOINT;
  const sampler = options.samplerName || DEFAULT_SAMPLER;
  const scheduler = options.scheduler || DEFAULT_SCHEDULER;

  return {
    '4': {
      id: 4,
      type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: checkpoint },
      _meta: { title: 'Load Checkpoint' },
    },
    '6': {
      id: 6,
      type: 'CLIPTextEncode',
      inputs: { text: options.prompt, clip: ['4', 1] },
      _meta: { title: 'Positive Prompt' },
    },
    '7': {
      id: 7,
      type: 'CLIPTextEncode',
      inputs: { text: options.negativePrompt || '', clip: ['4', 1] },
      _meta: { title: 'Negative Prompt' },
    },
    '5': {
      id: 5,
      type: 'EmptyLatentImage',
      inputs: { width, height, batch_size: options.batchSize || 1 },
      _meta: { title: 'Empty Latent Image' },
    },
    '3': {
      id: 3,
      type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg: cfgScale,
        sampler_name: sampler,
        scheduler,
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '8': {
      id: 8,
      type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] },
      _meta: { title: 'VAE Decode' },
    },
    '9': {
      id: 9,
      type: 'SaveImage',
      inputs: { filename_prefix: 'Genova', images: ['8', 0] },
      _meta: { title: 'Save Image' },
    },
  };
}

/**
 * Check if ComfyUI is available and healthy
 */
export async function checkComfyUIHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${COMFYUI_URL}/system_stats`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get available checkpoints from ComfyUI
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    const response = await fetch(`${COMFYUI_URL}/object_info/CheckpointLoaderSimple`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
  } catch {
    return [];
  }
}

/**
 * Submit a workflow to the ComfyUI queue
 */
async function queuePrompt(workflow: ComfyUIWorkflow): Promise<ComfyUIQueueResponse> {
  const response = await fetch(`${COMFYUI_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`ComfyUI queue error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Poll for the completion of a queued prompt
 */
async function waitForCompletion(promptId: string, timeoutMs: number = 120_000): Promise<ComfyUIHistoryItem> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${COMFYUI_URL}/history/${promptId}`, {
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const history = await response.json();
        const item = history[promptId];

        if (item && item.status?.completed) {
          return item;
        }
      }
    } catch {
      // Continue polling on transient errors
    }

    await new Promise(r => setTimeout(r, 1000)); // Poll every second
  }

  throw new Error(`ComfyUI generation timed out after ${timeoutMs}ms`);
}

/**
 * Fetch generated image as base64
 */
async function fetchImageAsBase64(filename: string, subfolder: string, type: string): Promise<string> {
  const params = new URLSearchParams({
    filename,
    subfolder: subfolder || '',
    type: type || 'output',
  });

  const response = await fetch(`${COMFYUI_URL}/view?${params}`, {
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString('base64');
}

/**
 * Main: Generate an image using ComfyUI
 */
export async function generateWithComfyUI(options: ComfyUIGenerateOptions): Promise<ComfyUIGenerateResult> {
  const startTime = Date.now();

  log.info('Generating image with ComfyUI', {
    prompt: options.prompt.substring(0, 50),
    width: options.width,
    height: options.height,
  });

  // 1. Build workflow
  const workflow = buildTxt2ImgWorkflow(options);

  // 2. Queue the prompt
  const queueResponse = await queuePrompt(workflow);
  const promptId = queueResponse.prompt_id;

  log.info('ComfyUI prompt queued', { promptId });

  // 3. Wait for completion
  const historyItem = await waitForCompletion(promptId);

  // 4. Extract images
  const images: ComfyUIGenerateResult['images'] = [];

  for (const nodeId of Object.keys(historyItem.outputs)) {
    const nodeOutput = historyItem.outputs[nodeId];
    if (nodeOutput.images) {
      for (const img of nodeOutput.images) {
        const base64 = await fetchImageAsBase64(img.filename, img.subfolder, img.type);
        images.push({
          data: base64,
          filename: img.filename,
          type: img.type,
        });
      }
    }
  }

  const durationMs = Date.now() - startTime;

  log.info('ComfyUI generation completed', {
    promptId,
    imageCount: images.length,
    durationMs,
  });

  return {
    success: true,
    images,
    promptId,
    durationMs,
    metadata: {
      provider: 'comfyui',
      model: options.model || DEFAULT_CHECKPOINT,
      steps: options.steps || DEFAULT_STEPS,
      cfgScale: options.cfgScale || DEFAULT_CFG_SCALE,
      width: options.width || 1024,
      height: options.height || 1024,
    },
  };
}

export function getComfyUIClient() {
  return {
    health: checkComfyUIHealth,
    getModels: getAvailableModels,
    generate: generateWithComfyUI,
  };
}

export { COMFYUI_URL, DEFAULT_CHECKPOINT };
