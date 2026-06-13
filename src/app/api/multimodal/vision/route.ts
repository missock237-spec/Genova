/**
 * API Route: /api/multimodal/vision
 * POST: Analyze an image using the vision engine
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createVisionEngine } from '@/lib/multimodal/vision-engine';
import { FileValidator } from '@/lib/security/file-validator';
import { apiError, apiResponse } from '@/lib/server-api';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 20, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const contentType = request.headers.get('content-type') || '';
    let imageData: Buffer | string;
    let options: Record<string, boolean> = {};

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const imageFile = formData.get('image') as File | null;

      if (!imageFile) {
        return apiError('No image file provided', 400, request);
      }

      // Security: Validate file before processing
      const validator = new FileValidator();
      const validation = validator.validateImage({
        name: imageFile.name,
        size: imageFile.size,
        type: imageFile.type,
      });

      if (!validation.allowed) {
        return apiError(`Invalid image: ${validation.reason}`, 400, request);
      }

      const arrayBuffer = await imageFile.arrayBuffer();
      imageData = Buffer.from(arrayBuffer);

      options = {
        detectObjects: formData.get('detectObjects') !== 'false',
        extractText: formData.get('extractText') !== 'false',
        describeScene: formData.get('describeScene') !== 'false',
        generateTags: formData.get('generateTags') !== 'false',
      };
    } else {
      const body = await request.json();
      const { image, ...opts } = body;

      if (!image) {
        const res = NextResponse.json({ error: 'Image data is required (base64 or file upload)' }, { status: 400 });
        return secureResponse(res, request);
      }

      imageData = image;
      options = opts;
    }

    const engine = createVisionEngine(auth.userId);
    const result = await engine.analyzeImage(imageData, options);

    const res = NextResponse.json({ result });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Vision analysis failed';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
