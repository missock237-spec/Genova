import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import {
  getUserImages,
  MAX_PROMPT_LENGTH,
  FREE_IMAGE_MODELS,
  DEFAULT_MODEL,
} from '@/lib/image-generator';
import { getAIJobQueue } from '@/lib/queue';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

// ============================================================
// POST /api/images/generate — Add image generation job to queue
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, {
      requireAuth: true,
      rateLimit: { limit: 20, windowMs: 60 * 1000 },
    });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const body = await request.json();
    const { prompt, model, width, height, negativePrompt, steps, seed, sampler } = body;

    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return secureResponse(
        NextResponse.json({ error: 'Prompt is required' }, { status: 400 }),
        request
      );
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return secureResponse(
        NextResponse.json(
          { error: `Prompt must be at most ${MAX_PROMPT_LENGTH} characters` },
          { status: 400 }
        ),
        request
      );
    }

    // Validate model
    const selectedModel = model || DEFAULT_MODEL;
    if (!FREE_IMAGE_MODELS[selectedModel]) {
      return secureResponse(
        NextResponse.json(
          { error: `Invalid model. Available: ${Object.keys(FREE_IMAGE_MODELS).join(', ')}` },
          { status: 400 }
        ),
        request
      );
    }

    // Add to BullMQ queue for async processing (Vercel-safe)
    const queue = getAIJobQueue();
    const jobId = await queue.addImageJob(auth.userId, prompt, {
      model: selectedModel,
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      negativePrompt,
      steps: steps ? parseInt(steps) : undefined,
      seed: seed ? parseInt(seed) : undefined,
      sampler,
    });

    return secureResponse(
      NextResponse.json({
        success: true,
        jobId,
        message: 'Génération d\'image ajoutée à la file d\'attente',
        status: 'pending',
      }, { status: 202 }),
      request
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to queue image generation';
    return secureResponse(
      NextResponse.json({ error: message }, { status: 500 }),
      request
    );
  }
}

// ============================================================
// GET /api/images/generate — List user's generated images
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const status = searchParams.get('status') || undefined;

    const result = await getUserImages(auth.userId, { limit, offset, status });

    return secureResponse(
      NextResponse.json(result),
      request
    );
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Failed to fetch images' }, { status: 500 }),
      request
    );
  }
}
