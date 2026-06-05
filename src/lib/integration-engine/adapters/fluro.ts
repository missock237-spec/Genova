/**
 * Fluro.IA Adapter — Genova Integration Engine
 *
 * The primary AI orchestrator adapter. Fluro.IA is the single entry point
 * for all AI operations in Genova, dispatching to:
 *   - ComfyUI for image generation
 *   - VideoCrafter/CogVideo for video generation
 *   - SpeechBrain for speech recognition
 *   - z-ai-web-dev-sdk for chat/text (always available)
 *
 * This adapter exposes Fluro's full capability set through the Integration Engine.
 */

import type {
  IntegrationAdapter,
  IntegrationConfig,
  ExecutionResult,
  HealthCheckResult,
} from '../types';
import { createLogger } from '@/lib/logger';
import {
  fluroChat,
  fluroGenerateImage,
  fluroGenerateVideo,
  fluroGetVideoStatus,
  checkFluroHealth,
  type FluroChatOptions,
  type FluroImageOptions,
  type FluroVideoOptions,
} from '@/lib/fluro-ai-client';

const log = createLogger('adapter-fluro');

export class FluroAdapter implements IntegrationAdapter {
  readonly config: IntegrationConfig = {
    id: 'fluro',
    name: 'fluro',
    displayName: 'Fluro.IA — AI Orchestrator',
    description: 'Primary AI orchestrator: ComfyUI (images) + VideoCrafter (videos) + SpeechBrain (ASR) + z-ai-sdk (chat)',
    version: '1.0.0',
    category: 'ai_ml',
    icon: '🧠',
    color: '#8B5CF6',
    homepage: 'https://fluro.ia',
    repository: 'https://fluro.ia',
    status: 'discovered',
    functions: [
      {
        id: 'fluro-chat',
        name: 'chat',
        displayName: 'AI Chat Completion',
        description: 'Generate a text response via Fluro (z-ai-sdk powered)',
        category: 'ai_ml',
        inputSchema: [
          { name: 'messages', type: 'array', required: true, description: 'Array of {role, content} message objects' },
          { name: 'model', type: 'string', required: false, defaultValue: 'default', description: 'Model tier: default, fast, powerful' },
          { name: 'temperature', type: 'number', required: false, description: 'Sampling temperature (0-2)' },
          { name: 'maxTokens', type: 'number', required: false, description: 'Maximum tokens to generate' },
        ],
        outputSchema: [
          { name: 'content', type: 'string', required: true, description: 'Generated text response' },
          { name: 'provider', type: 'string', required: true, description: 'Provider used (fluro)' },
          { name: 'model', type: 'string', required: true, description: 'Model used' },
        ],
        requiresAuth: false,
        timeoutMs: 60_000,
        costPerCall: 0,
        tags: ['chat', 'text', 'ai', 'fluro'],
      },
      {
        id: 'fluro-generate-image',
        name: 'generateImage',
        displayName: 'Generate Image',
        description: 'Generate an image via Fluro (ComfyUI → z-ai-sdk fallback)',
        category: 'media',
        inputSchema: [
          { name: 'prompt', type: 'string', required: true, description: 'Text prompt for image generation' },
          { name: 'negativePrompt', type: 'string', required: false, description: 'Negative prompt' },
          { name: 'width', type: 'number', required: false, defaultValue: 1024, description: 'Image width' },
          { name: 'height', type: 'number', required: false, defaultValue: 1024, description: 'Image height' },
          { name: 'steps', type: 'number', required: false, defaultValue: 20, description: 'Sampling steps' },
          { name: 'seed', type: 'number', required: false, description: 'Random seed' },
          { name: 'sampler', type: 'string', required: false, defaultValue: 'euler', description: 'Sampler name' },
          { name: 'model', type: 'string', required: false, description: 'ComfyUI checkpoint name' },
        ],
        outputSchema: [
          { name: 'imageUrl', type: 'string', required: true, description: 'URL or base64 of generated image' },
          { name: 'provider', type: 'string', required: true, description: 'Provider used (fluro-comfyui or fluro-sdk)' },
        ],
        requiresAuth: false,
        timeoutMs: 120_000,
        costPerCall: 0,
        tags: ['image', 'generation', 'fluro', 'comfyui'],
      },
      {
        id: 'fluro-generate-video',
        name: 'generateVideo',
        displayName: 'Generate Video',
        description: 'Generate a video via Fluro (VideoCrafter/CogVideo → z-ai-sdk fallback)',
        category: 'media',
        inputSchema: [
          { name: 'prompt', type: 'string', required: true, description: 'Text prompt for video generation' },
          { name: 'model', type: 'string', required: false, defaultValue: 'cogvideo', description: 'Model: cogvideo or videocrafter', enum: ['cogvideo', 'videocrafter'] },
          { name: 'duration', type: 'number', required: false, defaultValue: 4, description: 'Duration in seconds' },
          { name: 'fps', type: 'number', required: false, defaultValue: 8, description: 'Frames per second' },
          { name: 'resolution', type: 'string', required: false, defaultValue: '480x480', description: 'Video resolution' },
          { name: 'seed', type: 'number', required: false, description: 'Random seed' },
        ],
        outputSchema: [
          { name: 'videoUrl', type: 'string', required: true, description: 'URL to generated video' },
          { name: 'provider', type: 'string', required: true, description: 'Provider used (fluro-video or fluro-sdk)' },
        ],
        requiresAuth: false,
        timeoutMs: 300_000,
        costPerCall: 0,
        tags: ['video', 'generation', 'fluro', 'videocrafter', 'cogvideo'],
      },
      {
        id: 'fluro-video-status',
        name: 'getVideoStatus',
        displayName: 'Get Video Generation Status',
        description: 'Check the status of an async video generation task via Fluro',
        category: 'media',
        inputSchema: [
          { name: 'taskId', type: 'string', required: true, description: 'Video generation task ID' },
        ],
        outputSchema: [
          { name: 'status', type: 'string', required: true, description: 'Task status' },
          { name: 'progress', type: 'number', required: false, description: 'Progress (0-100)' },
          { name: 'videoUrl', type: 'string', required: false, description: 'Video URL if completed' },
        ],
        requiresAuth: false,
        timeoutMs: 10_000,
        costPerCall: 0,
        tags: ['video', 'status', 'fluro'],
      },
    ],
    dependencies: ['z-ai-web-dev-sdk'],
    envVariables: [
      { name: 'COMFYUI_API_URL', description: 'ComfyUI API URL (Fluro image sub-service)', required: false, defaultValue: 'http://localhost:8188', isSecret: false },
      { name: 'VIDEO_API_URL', description: 'VideoCrafter API URL (Fluro video sub-service)', required: false, defaultValue: 'http://localhost:8189', isSecret: false },
      { name: 'SPEECHBRAIN_API_URL', description: 'SpeechBrain API URL (Fluro ASR sub-service)', required: false, defaultValue: 'http://localhost:8187', isSecret: false },
    ],
    apiBaseUrl: '',
    metadata: {
      fallbackChain: ['fluro-comfyui', 'fluro-video', 'fluro-sdk'],
      isPrimaryProvider: true,
      priority: 1,
    },
  };

  async initialize(): Promise<void> {
    log.info('Fluro.IA adapter initializing — primary AI orchestrator');
  }

  async execute(functionId: string, params: Record<string, unknown>, _userId: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    switch (functionId) {
      case 'fluro-chat':
      case 'chat':
        return this.executeChat(params, startTime);

      case 'fluro-generate-image':
      case 'generateImage':
        return this.executeImageGeneration(params, startTime);

      case 'fluro-generate-video':
      case 'generateVideo':
        return this.executeVideoGeneration(params, startTime);

      case 'fluro-video-status':
      case 'getVideoStatus':
        return this.executeVideoStatus(params, startTime);

      default:
        return {
          success: false,
          error: `Unknown Fluro function: ${functionId}`,
          executionTimeMs: Date.now() - startTime,
          provider: 'fluro',
          costUsd: 0,
          metadata: {},
        };
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const health = await checkFluroHealth();
      return {
        healthy: health.overall !== 'offline',
        responseTimeMs: Date.now() - start,
        details: {
          chat: health.chat,
          comfyui: health.comfyui,
          video: health.video,
          speechbrain: health.speechbrain,
          overall: health.overall,
        },
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        responseTimeMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Fluro health check failed',
        checkedAt: new Date(),
      };
    }
  }

  async shutdown(): Promise<void> {
    log.info('Fluro.IA adapter shutting down');
  }

  // -----------------------------------------------------------------------
  // Chat Execution
  // -----------------------------------------------------------------------

  private async executeChat(params: Record<string, unknown>, startTime: number): Promise<ExecutionResult> {
    const { messages, model, temperature, maxTokens } = params as {
      messages: Array<{ role: string; content: string }>;
      model?: string;
      temperature?: number;
      maxTokens?: number;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return {
        success: false,
        error: 'Messages array is required for chat',
        executionTimeMs: Date.now() - startTime,
        provider: 'fluro',
        costUsd: 0,
        metadata: {},
      };
    }

    try {
      const result = await fluroChat(
        messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        { model, temperature, maxTokens },
      );

      return {
        success: true,
        data: {
          content: result.content,
          provider: result.provider,
          model: result.model,
          usage: result.usage,
        },
        executionTimeMs: Date.now() - startTime,
        provider: result.provider,
        model: result.model,
        costUsd: 0,
        metadata: { usage: result.usage },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Fluro chat failed',
        executionTimeMs: Date.now() - startTime,
        provider: 'fluro',
        costUsd: 0,
        metadata: {},
      };
    }
  }

  // -----------------------------------------------------------------------
  // Image Generation Execution
  // -----------------------------------------------------------------------

  private async executeImageGeneration(params: Record<string, unknown>, startTime: number): Promise<ExecutionResult> {
    const { prompt, negativePrompt, width, height, steps, seed, sampler, model } = params as unknown as FluroImageOptions;

    if (!prompt) {
      return {
        success: false,
        error: 'Prompt is required for image generation',
        executionTimeMs: Date.now() - startTime,
        provider: 'fluro',
        costUsd: 0,
        metadata: {},
      };
    }

    try {
      const result = await fluroGenerateImage({
        prompt,
        negativePrompt,
        width: width || 1024,
        height: height || 1024,
        steps: steps || 20,
        seed,
        sampler: sampler || 'euler',
        model,
      });

      return {
        success: true,
        data: {
          imageUrl: result.imageUrl,
          provider: result.provider,
          seed: result.seed,
          width: result.width,
          height: result.height,
        },
        executionTimeMs: Date.now() - startTime,
        provider: result.provider,
        costUsd: 0,
        metadata: result.metadata,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Fluro image generation failed',
        executionTimeMs: Date.now() - startTime,
        provider: 'fluro',
        costUsd: 0,
        metadata: {},
      };
    }
  }

  // -----------------------------------------------------------------------
  // Video Generation Execution
  // -----------------------------------------------------------------------

  private async executeVideoGeneration(params: Record<string, unknown>, startTime: number): Promise<ExecutionResult> {
    const { prompt, model, duration, fps, resolution, seed } = params as unknown as FluroVideoOptions;

    if (!prompt) {
      return {
        success: false,
        error: 'Prompt is required for video generation',
        executionTimeMs: Date.now() - startTime,
        provider: 'fluro',
        costUsd: 0,
        metadata: {},
      };
    }

    try {
      const result = await fluroGenerateVideo({
        prompt,
        model: (model as 'cogvideo' | 'videocrafter') || 'cogvideo',
        duration: duration || 4,
        fps: fps || 8,
        resolution: resolution || '480x480',
        seed,
      });

      return {
        success: true,
        data: {
          videoUrl: result.videoUrl,
          taskId: result.taskId,
          status: result.status,
          duration: result.duration,
          fps: result.fps,
          provider: result.provider,
        },
        executionTimeMs: Date.now() - startTime,
        provider: result.provider,
        costUsd: 0,
        metadata: result.metadata,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Fluro video generation failed',
        executionTimeMs: Date.now() - startTime,
        provider: 'fluro',
        costUsd: 0,
        metadata: {},
      };
    }
  }

  // -----------------------------------------------------------------------
  // Video Status Execution
  // -----------------------------------------------------------------------

  private async executeVideoStatus(params: Record<string, unknown>, startTime: number): Promise<ExecutionResult> {
    const { taskId } = params as { taskId: string };

    if (!taskId) {
      return {
        success: false,
        error: 'Task ID is required',
        executionTimeMs: Date.now() - startTime,
        provider: 'fluro',
        costUsd: 0,
        metadata: {},
      };
    }

    try {
      const result = await fluroGetVideoStatus(taskId);

      return {
        success: true,
        data: {
          status: result.status,
          progress: result.progress,
          videoUrl: result.videoUrl,
        },
        executionTimeMs: Date.now() - startTime,
        provider: 'fluro-video',
        costUsd: 0,
        metadata: {},
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Fluro video status check failed',
        executionTimeMs: Date.now() - startTime,
        provider: 'fluro-video',
        costUsd: 0,
        metadata: {},
      };
    }
  }
}
