// Image Generation Engine — Generate images via ComfyUI, OpenRouter, or z-ai-web-dev-sdk
// Fallback chain: ComfyUI (P1) → OpenRouter (P2) → z-ai-sdk (P3)
// ComfyUI is the primary provider when available; others serve as fallbacks.

import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/security';
import { checkComfyUIHealth, generateWithComfyUI, COMFYUI_URL } from '@/lib/comfyui-client';
import { createLogger } from '@/lib/logger';

const log = createLogger('image-generator');

// ============================================================
// Types
// ============================================================

interface GenerateImageOptions {
  model?: string;
  width?: number;
  height?: number;
  n?: number;
}

interface ImageGenerationResult {
  id: string;
  imageUrl: string | null;
  status: string;
  model: string;
  provider: string;
  costUsd: number;
  width?: number;
  height?: number;
  metadata: Record<string, unknown>;
}

// ============================================================
// Constants
// ============================================================

const MAX_PROMPT_LENGTH = 2000;
const MAX_IMAGES_PER_HOUR = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Free image models available on OpenRouter + ComfyUI
const FREE_IMAGE_MODELS: Record<string, { id: string; costUsd: number }> = {
  // ComfyUI models (P1 — local, free)
  'comfyui-sd': {
    id: 'comfyui/stable-diffusion',
    costUsd: 0,
  },
  'comfyui-sdxl': {
    id: 'comfyui/stable-diffusion-xl',
    costUsd: 0,
  },
  'comfyui-flux': {
    id: 'comfyui/flux',
    costUsd: 0,
  },
  // OpenRouter free models (P2)
  'flux-1-schnell-free': {
    id: 'black-forest-labs/flux-1-schnell:free',
    costUsd: 0,
  },
  'stable-diffusion-xl-free': {
    id: 'stabilityai/stable-diffusion-xl:free',
    costUsd: 0,
  },
};

// Default to ComfyUI if COMFYUI_URL is configured, otherwise OpenRouter
const DEFAULT_MODEL = COMFYUI_URL ? 'comfyui-sd' : 'flux-1-schnell-free';

const SUPPORTED_SIZES = [
  '1024x1024',
  '768x1344',
  '1344x768',
  '512x512',
  '768x512',
  '512x768',
];

// ============================================================
// Input Validation & Sanitization
// ============================================================

function sanitizePrompt(prompt: string): string {
  // Strip HTML tags
  let sanitized = prompt.replace(/<[^>]*>/g, '');
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  // Trim whitespace
  sanitized = sanitized.trim();
  // Limit length
  if (sanitized.length > MAX_PROMPT_LENGTH) {
    sanitized = sanitized.substring(0, MAX_PROMPT_LENGTH);
  }
  return sanitized;
}

function validateSize(width?: number, height?: number): { width: number; height: number } {
  // Default to 1024x1024
  const w = width || 1024;
  const h = height || 1024;

  // Validate dimensions
  const validWidths = [512, 768, 1024, 1344];
  const validHeights = [512, 768, 1024, 1344];

  return {
    width: validWidths.includes(w) ? w : 1024,
    height: validHeights.includes(h) ? h : 1024,
  };
}

// ============================================================
// Rate Limiting
// ============================================================

async function checkUserRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  // Check against our in-memory rate limiter
  const rateLimitResult = checkRateLimit(
    `image_gen:${userId}`,
    MAX_IMAGES_PER_HOUR,
    RATE_LIMIT_WINDOW_MS
  );

  // Also check against DB for more accurate tracking
  const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentGenerations = await db.imageGeneration.count({
    where: {
      userId,
      createdAt: { gte: oneHourAgo },
    },
  });

  if (recentGenerations >= MAX_IMAGES_PER_HOUR) {
    return { allowed: false, remaining: 0 };
  }

  return {
    allowed: rateLimitResult.allowed,
    remaining: Math.max(0, MAX_IMAGES_PER_HOUR - recentGenerations - 1),
  };
}

// ============================================================
// Image Generation — ComfyUI (P1 — Primary)
// ============================================================

function isComfyUIModel(model: string): boolean {
  return model.startsWith('comfyui-');
}

const COMFYUI_MODEL_MAP: Record<string, string> = {
  'comfyui-sd': 'v1-5-pruned-emaonly.safetensors',
  'comfyui-sdxl': 'sd_xl_base_1.0.safetensors',
  'comfyui-flux': 'flux1-dev.safetensors',
};

async function generateWithComfyUIAdapter(
  prompt: string,
  model: string,
  width: number,
  height: number
): Promise<{ imageUrl: string | null; costUsd: number; metadata: Record<string, unknown> }> {
  const checkpoint = COMFYUI_MODEL_MAP[model] || COMFYUI_MODEL_MAP['comfyui-sd'];

  const result = await generateWithComfyUI({
    prompt,
    width,
    height,
    model: checkpoint,
  });

  // Convert the first image to a data URI for compatibility
  let imageUrl: string | null = null;
  if (result.images.length > 0) {
    const img = result.images[0];
    imageUrl = `data:image/png;base64,${img.data}`;
  }

  return {
    imageUrl,
    costUsd: 0,
    metadata: {
      ...result.metadata,
      promptId: result.promptId,
      durationMs: result.durationMs,
    },
  };
}

// ============================================================
// Image Generation — OpenRouter API (P2)
// ============================================================

async function generateWithOpenRouter(
  prompt: string,
  model: string,
  width: number,
  height: number
): Promise<{ imageUrl: string | null; costUsd: number; metadata: Record<string, unknown> }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const modelInfo = FREE_IMAGE_MODELS[model] || FREE_IMAGE_MODELS[DEFAULT_MODEL];
  const sizeStr = `${width}x${height}`;

  const response = await fetch('https://openrouter.ai/api/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Genova AgentOS',
    },
    body: JSON.stringify({
      model: modelInfo.id,
      prompt,
      n: 1,
      size: sizeStr,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();

  // Extract image URL or base64 from response
  let imageUrl: string | null = null;
  if (data.data && Array.isArray(data.data) && data.data.length > 0) {
    imageUrl = data.data[0].url || data.data[0].b64_json || null;
  }

  return {
    imageUrl,
    costUsd: modelInfo.costUsd,
    metadata: {
      model: modelInfo.id,
      size: sizeStr,
      rawResponse: { model: data.model, created: data.created },
    },
  };
}

// ============================================================
// Image Generation — z-ai-web-dev-sdk Fallback (P3)
// ============================================================

async function generateWithSDK(
  prompt: string,
  model: string,
  width: number,
  height: number
): Promise<{ imageUrl: string | null; costUsd: number; metadata: Record<string, unknown> }> {
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk');
    const client = await ZAI.create();

    const result = await client.images.generations.create({
      model: model || 'flux-1-schnell-free',
      prompt,
      size: `${width}x${height}` as '1024x1024' | '768x1344' | '1344x768' | '864x1152' | '1152x864' | '1440x720' | '720x1440',
    });

    let imageUrl: string | null = null;
    if (result.data && Array.isArray(result.data) && result.data.length > 0) {
      const base64Data = result.data[0].base64;
      imageUrl = base64Data ? `data:image/png;base64,${base64Data}` : null;
    }

    return {
      imageUrl,
      costUsd: 0,
      metadata: {
        model: model || 'flux-1-schnell-free',
        size: `${width}x${height}`,
        provider: 'z-ai-sdk',
      },
    };
  } catch (sdkError) {
    throw new Error(`SDK image generation failed: ${sdkError instanceof Error ? sdkError.message : 'Unknown error'}`);
  }
}

// ============================================================
// Helper — OpenRouter + SDK fallback chain (P2 → P3)
// ============================================================

async function attemptOpenRouterOrSDK(
  prompt: string,
  model: string,
  width: number,
  height: number
): Promise<{ imageUrl: string | null; costUsd: number; metadata: Record<string, unknown> }> {
  // For ComfyUI-specific models, remap to a compatible OpenRouter model
  const openRouterModel = isComfyUIModel(model) ? 'flux-1-schnell-free' : model;

  if (process.env.OPENROUTER_API_KEY) {
    try {
      log.info('Attempting image generation with OpenRouter (P2)', { model: openRouterModel });
      const result = await generateWithOpenRouter(prompt, openRouterModel, width, height);
      result.metadata.provider = 'openrouter';
      return result;
    } catch (openRouterError) {
      log.warn('OpenRouter generation failed, falling back to z-ai-sdk (P3)', {
        error: openRouterError instanceof Error ? openRouterError.message : 'Unknown error',
      });
      // OpenRouter failed — try SDK as fallback
      try {
        const result = await generateWithSDK(prompt, openRouterModel, width, height);
        result.metadata.provider = 'z-ai-sdk';
        return result;
      } catch (sdkError) {
        throw openRouterError; // Throw original OpenRouter error
      }
    }
  } else {
    log.info('No OPENROUTER_API_KEY configured, using z-ai-sdk (P3)');
    const result = await generateWithSDK(prompt, openRouterModel, width, height);
    result.metadata.provider = 'z-ai-sdk';
    return result;
  }
}

// ============================================================
// Main Export — generateImage
// ============================================================

export async function generateImage(
  userId: string,
  prompt: string,
  options: GenerateImageOptions = {}
): Promise<ImageGenerationResult> {
  // 1. Validate and sanitize prompt
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('Prompt is required');
  }

  const sanitizedPrompt = sanitizePrompt(prompt);

  if (sanitizedPrompt.length === 0) {
    throw new Error('Prompt is empty after sanitization');
  }

  // 2. Validate size
  const { width, height } = validateSize(options.width, options.height);

  // 3. Validate model
  const model = options.model || DEFAULT_MODEL;
  if (!FREE_IMAGE_MODELS[model]) {
    throw new Error(
      `Invalid model. Available models: ${Object.keys(FREE_IMAGE_MODELS).join(', ')}`
    );
  }

  // 4. Check rate limit
  const rateCheck = await checkUserRateLimit(userId);
  if (!rateCheck.allowed) {
    throw new Error(`Rate limit exceeded. Maximum ${MAX_IMAGES_PER_HOUR} images per hour. Try again later.`);
  }

  // 5. Create DB record with pending status
  const generation = await db.imageGeneration.create({
    data: {
      userId,
      prompt: sanitizedPrompt,
      model,
      provider: isComfyUIModel(model) ? 'comfyui' : 'openrouter',
      status: 'pending',
      costUsd: 0,
      width,
      height,
      metadata: JSON.stringify({ requestedAt: new Date().toISOString() }),
    },
  });

  try {
    // 6. Attempt generation with fallback chain: ComfyUI → OpenRouter → z-ai-sdk
    let result: { imageUrl: string | null; costUsd: number; metadata: Record<string, unknown> };
    let usedProvider = 'openrouter'; // Default provider for DB tracking

    // P1: Try ComfyUI first if COMFYUI_URL is set and ComfyUI is healthy
    const comfyUIAvailable = COMFYUI_URL && await checkComfyUIHealth().catch(() => false);

    if (comfyUIAvailable && (isComfyUIModel(model) || COMFYUI_URL)) {
      try {
        log.info('Attempting image generation with ComfyUI (P1)', { model });
        result = await generateWithComfyUIAdapter(sanitizedPrompt, model, width, height);
        usedProvider = 'comfyui';
      } catch (comfyUIError) {
        log.warn('ComfyUI generation failed, falling back to OpenRouter (P2)', {
          error: comfyUIError instanceof Error ? comfyUIError.message : 'Unknown error',
        });
        // Fall through to OpenRouter
        result = await attemptOpenRouterOrSDK(sanitizedPrompt, model, width, height);
        usedProvider = result.metadata.provider as string || 'openrouter';
      }
    } else {
      // ComfyUI not available — try OpenRouter / SDK
      if (!comfyUIAvailable && COMFYUI_URL) {
        log.warn('ComfyUI is configured but not healthy, skipping to OpenRouter (P2)');
      }
      result = await attemptOpenRouterOrSDK(sanitizedPrompt, model, width, height);
      usedProvider = result.metadata.provider as string || 'openrouter';
    }

    // 7. Update DB record with completed status
    const updated = await db.imageGeneration.update({
      where: { id: generation.id },
      data: {
        imageUrl: result.imageUrl,
        status: 'completed',
        costUsd: result.costUsd,
        provider: usedProvider,
        metadata: JSON.stringify(result.metadata),
      },
    });

    // 8. Track cost in AICost table
    await db.aICost.create({
      data: {
        userId,
        provider: usedProvider,
        model,
        costUsd: result.costUsd,
        requestId: generation.id,
      },
    });

    return {
      id: updated.id,
      imageUrl: updated.imageUrl,
      status: updated.status,
      model: updated.model,
      provider: updated.provider,
      costUsd: updated.costUsd,
      width: updated.width || undefined,
      height: updated.height || undefined,
      metadata: JSON.parse(updated.metadata || '{}'),
    };
  } catch (error) {
    // Update DB record with failed status
    await db.imageGeneration.update({
      where: { id: generation.id },
      data: {
        status: 'failed',
        metadata: JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
          failedAt: new Date().toISOString(),
        }),
      },
    });

    throw error;
  }
}

// ============================================================
// Helper — Get user's generated images
// ============================================================

export async function getUserImages(
  userId: string,
  options: { limit?: number; offset?: number; status?: string } = {}
) {
  const limit = Math.min(Math.max(options.limit || 20, 1), 100);
  const offset = Math.max(options.offset || 0, 0);

  const where: Record<string, unknown> = { userId };
  if (options.status) {
    where.status = options.status;
  }

  const [images, total] = await Promise.all([
    db.imageGeneration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.imageGeneration.count({ where }),
  ]);

  return { images, total, limit, offset };
}

// ============================================================
// Helper — Get a specific image generation
// ============================================================

export async function getImageGeneration(id: string, userId: string) {
  const image = await db.imageGeneration.findUnique({
    where: { id },
  });

  if (!image || image.userId !== userId) {
    return null;
  }

  return image;
}

// ============================================================
// Helper — Delete an image generation
// ============================================================

export async function deleteImageGeneration(id: string, userId: string): Promise<boolean> {
  const image = await db.imageGeneration.findUnique({
    where: { id },
  });

  if (!image || image.userId !== userId) {
    return false;
  }

  await db.imageGeneration.delete({
    where: { id },
  });

  return true;
}

// ============================================================
// Exports
// ============================================================

export { FREE_IMAGE_MODELS, DEFAULT_MODEL, SUPPORTED_SIZES, MAX_PROMPT_LENGTH, MAX_IMAGES_PER_HOUR };
