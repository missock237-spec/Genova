/**
 * CogVideo/VideoCrafter Adapter — Genova Integration Engine
 *
 * Integrates video generation (CogVideo + VideoCrafter) into Genova.
 * Provides AI video generation from text prompts.
 */

import type {
  IntegrationAdapter,
  IntegrationConfig,
  ExecutionResult,
  HealthCheckResult,
} from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('adapter-cogvideo');

const VIDEO_API_URL = process.env.VIDEO_API_URL || 'http://localhost:8189';

export class CogVideoAdapter implements IntegrationAdapter {
  readonly config: IntegrationConfig = {
    id: 'cogvideo-videocrafter',
    name: 'cogvideo-videocrafter',
    displayName: 'CogVideo + VideoCrafter',
    description: 'AI video generation engine using CogVideo and VideoCrafter models',
    version: '1.0.0',
    category: 'ai_ml',
    icon: '🎬',
    color: '#EF4444',
    homepage: 'https://github.com/THUDM/CogVideo',
    repository: 'https://github.com/THUDM/CogVideo',
    status: 'discovered',
    functions: [
      {
        id: 'cogvideo-generate',
        name: 'generateVideo',
        displayName: 'Generate Video',
        description: 'Generate a video from a text prompt using CogVideo or VideoCrafter',
        category: 'ai_ml',
        inputSchema: [
          { name: 'prompt', type: 'string', required: true, description: 'Text prompt for video generation' },
          { name: 'model', type: 'string', required: false, defaultValue: 'cogvideo', description: 'Model to use', enum: ['cogvideo', 'videocrafter'] },
          { name: 'duration', type: 'number', required: false, defaultValue: 4, description: 'Duration in seconds' },
          { name: 'fps', type: 'number', required: false, defaultValue: 8, description: 'Frames per second' },
          { name: 'resolution', type: 'string', required: false, defaultValue: '480x480', description: 'Video resolution' },
          { name: 'seed', type: 'number', required: false, description: 'Random seed for reproducibility' },
        ],
        outputSchema: [
          { name: 'videoUrl', type: 'string', required: true, description: 'URL to generated video' },
          { name: 'duration', type: 'number', required: true, description: 'Actual video duration' },
          { name: 'fps', type: 'number', required: true, description: 'Actual FPS' },
          { name: 'provider', type: 'string', required: true, description: 'Model used' },
        ],
        requiresAuth: false,
        timeoutMs: 300_000,
        costPerCall: 0,
        tags: ['video', 'generation', 'ai', 'cogvideo', 'videocrafter'],
      },
      {
        id: 'cogvideo-status',
        name: 'getGenerationStatus',
        displayName: 'Get Generation Status',
        description: 'Check the status of a video generation task',
        category: 'ai_ml',
        inputSchema: [
          { name: 'taskId', type: 'string', required: true, description: 'Generation task ID' },
        ],
        outputSchema: [
          { name: 'status', type: 'string', required: true, description: 'Task status' },
          { name: 'progress', type: 'number', required: false, description: 'Progress percentage (0-100)' },
          { name: 'videoUrl', type: 'string', required: false, description: 'Video URL if completed' },
        ],
        requiresAuth: false,
        timeoutMs: 10_000,
        costPerCall: 0,
        tags: ['video', 'status', 'task'],
      },
    ],
    dependencies: ['torch', 'diffusers', 'transformers', 'accelerate'],
    envVariables: [
      { name: 'VIDEO_API_URL', description: 'Video generation API server URL', required: false, defaultValue: 'http://localhost:8189', isSecret: false },
    ],
    apiBaseUrl: VIDEO_API_URL,
    metadata: { models: ['cogvideo', 'videocrafter'] },
  };

  async initialize(): Promise<void> {
    log.info('CogVideo adapter initializing');
  }

  async execute(functionId: string, params: Record<string, unknown>, _userId: string): Promise<ExecutionResult> {
    switch (functionId) {
      case 'cogvideo-generate':
      case 'generateVideo':
        return this.generateVideo(params);
      case 'cogvideo-status':
      case 'getGenerationStatus':
        return this.getGenerationStatus(params);
      default:
        return { success: false, error: `Unknown function: ${functionId}`, executionTimeMs: 0, provider: 'cogvideo', costUsd: 0, metadata: {} };
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${VIDEO_API_URL}/health`, { signal: controller.signal });
      clearTimeout(timer);
      return { healthy: res.ok, responseTimeMs: Date.now() - start, checkedAt: new Date() };
    } catch {
      return { healthy: false, responseTimeMs: Date.now() - start, error: 'Video API not reachable', checkedAt: new Date() };
    }
  }

  async shutdown(): Promise<void> {
    log.info('CogVideo adapter shutting down');
  }

  private async generateVideo(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { prompt, model, duration, fps, resolution, seed } = params as {
      prompt: string; model?: string; duration?: number; fps?: number;
      resolution?: string; seed?: number;
    };

    if (!prompt) {
      return { success: false, error: 'Prompt is required', executionTimeMs: 0, provider: 'cogvideo', costUsd: 0, metadata: {} };
    }

    try {
      const res = await fetch(`${VIDEO_API_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: model || 'cogvideo',
          duration: duration || 4,
          fps: fps || 8,
          resolution: resolution || '480x480',
          seed,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Video API error (${res.status}): ${errBody.slice(0, 200)}`);
      }

      const data = await res.json();

      // If async, return task ID
      if (data.taskId) {
        return {
          success: true,
          data: {
            taskId: data.taskId,
            status: 'processing',
            provider: model || 'cogvideo',
          },
          executionTimeMs: Date.now() - startTime,
          provider: model || 'cogvideo',
          costUsd: 0,
          metadata: { async: true, taskId: data.taskId },
        };
      }

      // If sync, return video URL
      return {
        success: true,
        data: {
          videoUrl: data.videoUrl || data.url,
          duration: data.duration || duration || 4,
          fps: data.fps || fps || 8,
          provider: model || 'cogvideo',
        },
        executionTimeMs: Date.now() - startTime,
        provider: model || 'cogvideo',
        costUsd: 0,
        metadata: {},
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Video generation failed',
        executionTimeMs: Date.now() - startTime,
        provider: 'cogvideo',
        costUsd: 0,
        metadata: {},
      };
    }
  }

  private async getGenerationStatus(params: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const { taskId } = params as { taskId: string };

    try {
      const res = await fetch(`${VIDEO_API_URL}/status/${taskId}`);
      if (!res.ok) throw new Error(`Status check error: ${res.status}`);

      const data = await res.json();
      return {
        success: true,
        data: {
          status: data.status || 'unknown',
          progress: data.progress || 0,
          videoUrl: data.videoUrl || data.url,
        },
        executionTimeMs: Date.now() - startTime,
        provider: 'cogvideo',
        costUsd: 0,
        metadata: {},
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Status check failed',
        executionTimeMs: Date.now() - startTime,
        provider: 'cogvideo',
        costUsd: 0,
        metadata: {},
      };
    }
  }
}
