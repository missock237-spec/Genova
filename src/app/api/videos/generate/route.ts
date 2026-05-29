/**
 * POST /api/videos/generate — Generate a video from text prompt
 * GET  /api/videos/generate — List user's videos
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, getAllowedOrigins } from '@/lib/security';
import { generateVideo, getUserVideos, AVAILABLE_MODELS, DEFAULT_MODEL } from '@/lib/video-generator';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new Response(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 10, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { prompt, model, mode, width, height, fps, numFrames, numInferenceSteps, guidanceScale, seed } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (model && !AVAILABLE_MODELS[model]) {
      return NextResponse.json({ error: `Invalid model. Available: ${Object.keys(AVAILABLE_MODELS).join(', ')}` }, { status: 400 });
    }

    const result = await generateVideo(auth.userId, prompt, {
      model: model || DEFAULT_MODEL,
      mode: mode || 't2v',
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      fps: fps ? parseInt(fps) : undefined,
      numFrames: numFrames ? parseInt(numFrames) : undefined,
      numInferenceSteps: numInferenceSteps ? parseInt(numInferenceSteps) : undefined,
      guidanceScale: guidanceScale ? parseFloat(guidanceScale) : undefined,
      seed: seed ? parseInt(seed) : undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate video';
    const status = message.includes('Rate limit') ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status') || undefined;

    const validStatuses = ['pending', 'processing', 'completed', 'failed'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
    }

    const result = await getUserVideos(auth.userId, { limit, offset, status });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to list videos' }, { status: 500 });
  }
}
