import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import {
  generateImage,
  getUserImages,
  MAX_PROMPT_LENGTH,
  FREE_IMAGE_MODELS,
} from '@/lib/image-generator';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

// ============================================================
// POST /api/images/generate — Generate an image from a prompt
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, {
      requireAuth: true,
      rateLimit: { limit: 20, windowMs: 60 * 1000 }, // 20 req/min for image gen
    });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const body = await request.json();
    const { prompt, model, width, height } = body;

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

    // Validate model if provided
    if (model && !FREE_IMAGE_MODELS[model]) {
      return secureResponse(
        NextResponse.json(
          { error: `Invalid model. Available: ${Object.keys(FREE_IMAGE_MODELS).join(', ')}` },
          { status: 400 }
        ),
        request
      );
    }

    // Validate dimensions if provided
    if (width !== undefined && (typeof width !== 'number' || width < 1 || width > 2048)) {
      return secureResponse(
        NextResponse.json({ error: 'Width must be a number between 1 and 2048' }, { status: 400 }),
        request
      );
    }

    if (height !== undefined && (typeof height !== 'number' || height < 1 || height > 2048)) {
      return secureResponse(
        NextResponse.json({ error: 'Height must be a number between 1 and 2048' }, { status: 400 }),
        request
      );
    }

    // Generate the image
    const result = await generateImage(auth.userId, prompt, {
      model: model || undefined,
      width: width || undefined,
      height: height || undefined,
    });

    return secureResponse(
      NextResponse.json(result, { status: 201 }),
      request
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate image';

    // Rate limit errors get a 429
    if (message.includes('Rate limit')) {
      return secureResponse(
        NextResponse.json({ error: message }, { status: 429 }),
        request
      );
    }

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

    // Validate status filter
    if (status && !['pending', 'completed', 'failed'].includes(status)) {
      return secureResponse(
        NextResponse.json(
          { error: 'Invalid status filter. Allowed: pending, completed, failed' },
          { status: 400 }
        ),
        request
      );
    }

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
