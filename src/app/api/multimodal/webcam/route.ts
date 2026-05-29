/**
 * API Route: /api/multimodal/webcam
 * POST: Process a webcam frame
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createWebcamProcessor } from '@/lib/multimodal/webcam-processor';

// Cache processors per user for state tracking
const processors = new Map<string, ReturnType<typeof createWebcamProcessor>>();

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { imageData, width, height, deviceId, action } = body;

    // Get or create processor for this user
    let processor = processors.get(auth.userId);
    if (!processor) {
      processor = createWebcamProcessor(auth.userId);
      processors.set(auth.userId, processor);
    }

    // Handle special actions
    if (action === 'stats') {
      const stats = processor.getStats();
      const res = NextResponse.json({ stats });
      return secureResponse(res, request);
    }

    if (action === 'reset') {
      processor.reset();
      const res = NextResponse.json({ success: true, message: 'Processor reset' });
      return secureResponse(res, request);
    }

    // Process frame
    if (!imageData) {
      const res = NextResponse.json({ error: 'Webcam frame data is required' }, { status: 400 });
      return secureResponse(res, request);
    }

    const result = await processor.processFrame({
      data: imageData,
      width: width || 640,
      height: height || 480,
      timestamp: Date.now(),
      deviceId: deviceId || undefined,
    });

    const res = NextResponse.json({ result });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webcam frame processing failed';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
