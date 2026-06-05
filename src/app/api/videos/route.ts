/**
 * POST /api/videos/generate — Generate a video via Fluro.IA
 * GET  /api/videos/status   — Check video generation status
 *
 * Video generation endpoint powered by Fluro.IA:
 *   Fluro → VideoCrafter/CogVideo (primary) → z-ai-sdk (fallback)
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { fluroGenerateVideo, fluroGetVideoStatus } from '@/lib/fluro-ai-client';

// ============================================================
// POST /api/videos/generate — Generate a video from a prompt
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, {
      requireAuth: true,
      rateLimit: { limit: 5, windowMs: 60 * 1000 }, // 5 req/min for video gen
    });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const body = await request.json();
    const { prompt, model, duration, fps, resolution, seed } = body;

    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return secureResponse(
        NextResponse.json({ error: 'Prompt is required' }, { status: 400 }),
        request,
      );
    }

    if (prompt.length > 2000) {
      return secureResponse(
        NextResponse.json({ error: 'Prompt must be at most 2000 characters' }, { status: 400 }),
        request,
      );
    }

    // Validate model if provided
    if (model && !['cogvideo', 'videocrafter'].includes(model)) {
      return secureResponse(
        NextResponse.json({ error: 'Invalid model. Available: cogvideo, videocrafter' }, { status: 400 }),
        request,
      );
    }

    // Generate the video via Fluro
    const result = await fluroGenerateVideo({
      prompt,
      model: model || 'cogvideo',
      duration: duration || 4,
      fps: fps || 8,
      resolution: resolution || '480x480',
      seed,
    });

    return secureResponse(
      NextResponse.json({
        success: true,
        data: result,
      }, { status: 201 }),
      request,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate video';

    if (message.includes('Rate limit')) {
      return secureResponse(
        NextResponse.json({ error: message }, { status: 429 }),
        request,
      );
    }

    return secureResponse(
      NextResponse.json({ error: message }, { status: 500 }),
      request,
    );
  }
}

// ============================================================
// GET /api/videos/status?taskId=xxx — Check video generation status
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const taskId = request.nextUrl.searchParams.get('taskId');

    if (!taskId) {
      return secureResponse(
        NextResponse.json({ error: 'taskId parameter is required' }, { status: 400 }),
        request,
      );
    }

    const result = await fluroGetVideoStatus(taskId);

    return secureResponse(
      NextResponse.json({
        success: true,
        data: result,
      }),
      request,
    );
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Failed to check video status' }, { status: 500 }),
      request,
    );
  }
}
