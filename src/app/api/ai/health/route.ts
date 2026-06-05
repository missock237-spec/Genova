/**
 * GET /api/ai/health — Fluro.IA Health Check
 *
 * Returns the health status of the Fluro.IA orchestrator and all
 * its sub-services (Ollama, ComfyUI, VideoCrafter, Baileys, SpeechBrain).
 *
 * Fluro.IA is the primary AI provider. Health check covers:
 *   - Ollama (local LLM inference engine)
 *   - ComfyUI (image generation)
 *   - VideoCrafter/CogVideo (video generation)
 *   - Baileys (WhatsApp integration)
 *   - SpeechBrain (speech recognition)
 *   - z-ai-sdk (cloud fallback)
 */

import { NextResponse } from 'next/server';
import { checkFluroHealth, type FluroHealthReport } from '@/lib/fluro-ai-client';
import { isFluroHealthy, checkFluroHealth as checkOllamaHealth, listFluroModels } from '@/lib/fluro-client';
import { checkComfyUIHealth } from '@/lib/comfyui-client';

export async function GET() {
  const start = Date.now();

  try {
    // Run all health checks in parallel
    const [fluroHealth, ollamaHealthy, ollamaDetails, comfyuiHealthy] = await Promise.all([
      checkFluroHealth().catch(() => null),
      isFluroHealthy().catch(() => false),
      checkOllamaHealth().catch(() => ({ healthy: false, error: 'Unreachable' })),
      checkComfyUIHealth().catch(() => false),
    ]);

    // Check Baileys WhatsApp
    let baileysStatus = 'offline';
    try {
      const baileysRes = await fetch(`${process.env.BAILEYS_API_URL || 'http://localhost:8186'}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (baileysRes.ok) {
        const data = await baileysRes.json();
        baileysStatus = data.connection === 'connected' ? 'connected' : 'available';
      }
    } catch {
      baileysStatus = 'offline';
    }

    // Check Video API
    let videoStatus = 'offline';
    try {
      const videoRes = await fetch(`${process.env.VIDEO_API_URL || 'http://localhost:8189'}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      videoStatus = videoRes.ok ? 'online' : 'offline';
    } catch {
      videoStatus = 'offline';
    }

    const healthReport = fluroHealth as FluroHealthReport | null;

    // Build comprehensive status
    const services = {
      ollama: {
        status: ollamaHealthy ? 'online' as const : 'offline' as const,
        url: process.env.FLURO_API_URL || 'http://127.0.0.1:11434',
        version: ollamaDetails && 'version' in ollamaDetails ? ollamaDetails.version : undefined,
        models: ollamaDetails && 'models' in ollamaDetails
          ? ollamaDetails.models?.map((m) => m.name)
          : [],
      },
      comfyui: {
        status: comfyuiHealthy ? 'online' as const : 'offline' as const,
        url: process.env.COMFYUI_API_URL || 'http://localhost:8188',
      },
      video: {
        status: videoStatus as 'online' | 'offline',
        url: process.env.VIDEO_API_URL || 'http://localhost:8189',
      },
      baileys: {
        status: baileysStatus as 'connected' | 'available' | 'offline',
        url: process.env.BAILEYS_API_URL || 'http://localhost:8186',
      },
      chat: {
        status: healthReport?.chat ?? (ollamaHealthy ? 'online' as const : 'offline' as const),
        provider: ollamaHealthy ? 'fluro-ollama' : 'z-ai-sdk',
      },
    };

    // Determine overall status
    const onlineServices = [
      ollamaHealthy,
      comfyuiHealthy,
      videoStatus === 'online',
      baileysStatus !== 'offline',
    ].filter(Boolean).length;

    const overall = onlineServices >= 3 ? 'online'
      : onlineServices >= 1 ? 'degraded'
      : 'offline';

    const httpStatus = overall === 'online'
      ? 200
      : overall === 'degraded'
        ? 200 // Degraded is still operational
        : 503; // Offline = service unavailable

    return NextResponse.json({
      success: overall !== 'offline',
      data: {
        overall,
        services,
        fluroOrchestrator: healthReport ? {
          overall: healthReport.overall,
          chat: healthReport.chat,
          comfyui: healthReport.comfyui,
          video: healthReport.video,
          speechbrain: healthReport.speechbrain,
        } : null,
        responseTimeMs: Date.now() - start,
        checkedAt: new Date().toISOString(),
      },
    }, { status: httpStatus });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: {
          overall: 'offline',
          services: {
            ollama: { status: 'offline' },
            comfyui: { status: 'offline' },
            video: { status: 'offline' },
            baileys: { status: 'offline' },
            chat: { status: 'offline' },
          },
        },
        error: error instanceof Error ? error.message : 'Health check failed',
        responseTimeMs: Date.now() - start,
      },
      { status: 503 },
    );
  }
}
