/**
 * API Route: /api/multimodal/screen
 * POST: Process a screen capture frame
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createScreenShareHandler } from '@/lib/multimodal/screen-share';

// Cache handlers per user for frame comparison
const handlers = new Map<string, ReturnType<typeof createScreenShareHandler>>();

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
    const { imageData, width, height, windowTitle, sessionId } = body;

    if (!imageData) {
      const res = NextResponse.json({ error: 'Screen frame data is required' }, { status: 400 });
      return secureResponse(res, request);
    }

    // Get or create handler for this user
    let handler = handlers.get(auth.userId);
    if (!handler) {
      handler = createScreenShareHandler(auth.userId);
      handlers.set(auth.userId, handler);
    }

    const result = await handler.processFrame({
      data: imageData,
      width: width || 1920,
      height: height || 1080,
      timestamp: Date.now(),
      windowTitle: windowTitle || undefined,
    });

    const res = NextResponse.json({ result });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Screen frame processing failed';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
