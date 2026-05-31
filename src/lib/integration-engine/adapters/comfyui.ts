/**
 * ComfyUI Adapter — Genova Integration Engine
 *
 * Integrates ComfyUI image generation into Genova.
 * Provides AI image generation with OpenRouter and SDK fallback.
 */

import type {
  IntegrationAdapter,
  IntegrationConfig,
  ExecutionResult,
  HealthCheckResult,
} from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('adapter-comfyui');

const COMFYUI_API_URL = process.env.COMFYUI_API_URL || 'http://localhost:8188';

export class ComfyUIAdapter implements IntegrationAdapter {
  readonly config: IntegrationConfig = {
    id: 'comfyui',
    name: 'comfyui',
    displayName: 'ComfyUI Image Gen',
    description: 'AI image generation via ComfyUI with OpenRouter and SDK fallback chain',
    version: '1.0.0',
    category: 'media',
    icon: '🎨',
    color: '#F59E0B',
    homepage: 'https://github.com/comfyanonymous/ComfyUI',
    repository: 'https://github.com/comfyanonymous/ComfyUI',
    status: 'discovered',
    functions: [
      {
        id: 'comfyui-generate-image',
        name: 'generateImage',
        displayName: 'Generate Image',
        description: 'Generate an image from a text prompt with multi-provider fallback',
        category: 'media',
        inputSchema: [
          { name: 'prompt', type: 'string', required: true, description: 'Text prompt for image generation' },
          { name: 'negativePrompt', type: 'string', required: false, description: 'Negative prompt' },
          { name: 'width', type: 'number', required: false, defaultValue: 512, description: 'Image width' },
          { name: 'height', type: 'number', required: false, defaultValue: 512, description: 'Image height' },
          { name: 'steps', type: 'number', required: false, defaultValue: 20, description: 'Sampling steps' },
          { name: 'seed', type: 'number', required: false, description: 'Random seed for reproducibility' },
          { name: 'sampler', type: 'string', required: false, defaultValue: 'euler', description: 'Sampler name' },
          { name: 'model', type: 'string', required: false, description: 'Model checkpoint name' },
        ],
        outputSchema: [
          { name: 'imageUrl', type: 'string', required: true, description: 'URL or base64 of generated image' },
          { name: 'seed', type: 'number', required: false, description: 'Seed used' },
          { name: 'provider', type: 'string', required: true, description: 'Provider used' },
        ],
        requiresAuth: false,
        timeoutMs: 120_000,
        costPerCall: 0,
        tags: ['image', 'generation', 'diffusion', 'ai'],
      },
      {
        id: 'comfyui-get-models',
        name: 'getModels',
        displayName: 'List Available Models',
        description: 'List available ComfyUI model checkpoints',
        category: 'media',
        inputSchema: [],
        outputSchema: [
          { name: 'models', type: 'array', required: true, description: 'List of model names' },
        ],
        requiresAuth: false,
        timeoutMs: 10_000,
        costPerCall: 0,
        tags: ['image', 'models', 'list'],
      },
    ],
    dependencies: ['comfyui', 'torch', 'torchvision'],
    envVariables: [
      { name: 'COMFYUI_API_URL', description: 'ComfyUI API URL', required: false, defaultValue: 'http://localhost:8188', isSecret: false },
      { name: 'OPENROUTER_API_KEY', description: 'OpenRouter API key (fallback)', required: false, isSecret: true },
    ],
    apiBaseUrl: COMFYUI_API_URL,
    metadata: { fallbackChain: ['comfyui', 'openrouter', 'z-ai-sdk'] },
  };

  async initialize(): Promise<void> {
    log.info('ComfyUI adapter initializing');
  }

  async execute(functionId: string, params: Record<string, unknown>, _userId: string): Promise<ExecutionResult> {
    switch (functionId) {
      case 'comfyui-generate-image':
      case 'generateImage':
        return this.generateImage(params);
      case 'comfyui-get-models':
      case 'getModels':
        return this.getModels();
      default:
        return { success: false, error: `Unknown function: ${functionId}`, executionTimeMs: 0, provider: 'comfyui', costUsd: 0, metadata: {} };
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${COMFYUI_API_URL}/system_stats`, { signal: controller.signal });
      clearTimeout(timer);
      return { healthy: res.ok, responseTimeMs: Date.now() - start, checkedAt: new Date() };
    } catch {
      return { healthy: false, responseTimeMs: Date.now() - start, error: 'ComfyUI not reachable', checkedAt: new Date() };
    }
  }

  async shutdown(): Promise<void> {
    log.info('ComfyUI adapter shutting down');
  }

  private async generateImage(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { prompt, negativePrompt, width, height, steps, seed, sampler, model } = params as {
      prompt: string; negativePrompt?: string; width?: number; height?: number;
      steps?: number; seed?: number; sampler?: string; model?: string;
    };

    if (!prompt) {
      return { success: false, error: 'Prompt is required', executionTimeMs: 0, provider: 'comfyui', costUsd: 0, metadata: {} };
    }

    // Try ComfyUI first
    try {
      const result = await this.generateViaComfyUI(prompt, negativePrompt, width, height, steps, seed, sampler, model);
      if (result.success) {
        result.executionTimeMs = Date.now() - startTime;
        return result;
      }
    } catch {
      log.info('ComfyUI unavailable, trying OpenRouter fallback');
    }

    // Fallback: OpenRouter image generation
    try {
      const result = await this.generateViaOpenRouter(prompt, width, height);
      if (result.success) {
        result.executionTimeMs = Date.now() - startTime;
        return result;
      }
    } catch {
      log.info('OpenRouter image gen failed, trying SDK fallback');
    }

    // Fallback: z-ai-web-dev-sdk
    try {
      const result = await this.generateViaSDK(prompt, width, height);
      result.executionTimeMs = Date.now() - startTime;
      return result;
    } catch (error) {
      return {
        success: false,
        error: `All image generation providers failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTimeMs: Date.now() - startTime,
        provider: 'comfyui',
        costUsd: 0,
        metadata: {},
      };
    }
  }

  private async generateViaComfyUI(
    prompt: string, negativePrompt?: string, width?: number, height?: number,
    steps?: number, seed?: number, sampler?: string, model?: string,
  ): Promise<ExecutionResult> {
    const workflow = {
      '3': {
        class_type: 'KSampler',
        inputs: {
          seed: seed || Math.floor(Math.random() * 2147483647),
          steps: steps || 20,
          cfg: 7,
          sampler_name: sampler || 'euler',
          scheduler: 'normal',
          denoise: 1,
          model: ['4', 0],
          positive: ['6', 0],
          negative: ['7', 0],
          latent_image: ['5', 0],
        },
      },
      '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model || 'v1-5-pruned-emaonly.safetensors' } },
      '5': { class_type: 'EmptyLatentImage', inputs: { width: width || 512, height: height || 512, batch_size: 1 } },
      '6': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['4', 1] } },
      '7': { class_type: 'CLIPTextEncode', inputs: { text: negativePrompt || '', clip: ['4', 1] } },
      '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
      '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'Genova', images: ['8', 0] } },
    };

    const res = await fetch(`${COMFYUI_API_URL}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
    });

    if (!res.ok) throw new Error(`ComfyUI API error: ${res.status}`);
    const data = await res.json();

    // Poll for result
    const promptId = data.prompt_id;
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes max

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`${COMFYUI_API_URL}/history/${promptId}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const history = statusData[promptId];
        if (history?.status?.completed) {
          const images = history.outputs?.['9']?.images;
          if (images && images.length > 0) {
            const img = images[0];
            const imageUrl = `${COMFYUI_API_URL}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type || 'output'}`;
            return {
              success: true,
              data: { imageUrl, seed: workflow['3'].inputs.seed, provider: 'comfyui' },
              executionTimeMs: 0,
              provider: 'comfyui',
              costUsd: 0,
              metadata: { provider: 'comfyui', promptId },
            };
          }
        }
        if (history?.status?.status_str === 'error') {
          throw new Error('ComfyUI generation error');
        }
      }
      attempts++;
    }

    throw new Error('ComfyUI generation timed out');
  }

  private async generateViaOpenRouter(prompt: string, width?: number, height?: number): Promise<ExecutionResult> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');

    const res = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/flux-1-schnell:free',
        prompt,
        n: 1,
        size: `${width || 1024}x${height || 1024}`,
      }),
    });

    if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
    const data = await res.json();
    const imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json;

    return {
      success: true,
      data: { imageUrl, provider: 'openrouter' },
      executionTimeMs: 0,
      provider: 'openrouter',
      costUsd: 0,
      metadata: { provider: 'openrouter', fallbackFrom: 'comfyui' },
    };
  }

  private async generateViaSDK(prompt: string, width?: number, height?: number): Promise<ExecutionResult> {
    const { default: ZAI } = await import('z-ai-web-dev-sdk');
    const client = await ZAI.create();
    const size = `${width || 1024}x${height || 1024}` as '1024x1024';

    const result = await client.images.generations.create({
      prompt,
      size,
    });

    const imageUrl = result.data?.[0]?.base64 || null;

    return {
      success: true,
      data: { imageUrl, provider: 'z-ai-sdk' },
      executionTimeMs: 0,
      provider: 'z-ai-sdk',
      costUsd: 0,
      metadata: { provider: 'z-ai-sdk', fallbackFrom: 'comfyui' },
    };
  }

  private async getModels(): Promise<ExecutionResult> {
    const startTime = Date.now();
    try {
      const res = await fetch(`${COMFYUI_API_URL}/object_info/CheckpointLoaderSimple`);
      if (!res.ok) throw new Error(`ComfyUI API error: ${res.status}`);

      const data = await res.json();
      const models = data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];

      return {
        success: true,
        data: { models },
        executionTimeMs: Date.now() - startTime,
        provider: 'comfyui',
        costUsd: 0,
        metadata: {},
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get models',
        executionTimeMs: Date.now() - startTime,
        provider: 'comfyui',
        costUsd: 0,
        metadata: {},
      };
    }
  }
}
