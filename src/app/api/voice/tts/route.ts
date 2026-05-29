/**
 * API Route: /api/voice/tts
 *
 * POST: Synthesize speech from text
 * - Accepts text and voice options
 * - Returns audio data (base64 encoded)
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createTTSEngine } from '@/lib/voice';

const MAX_TEXT_LENGTH = 4096;

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
    const { text, voice, model, speed, responseFormat, language } = body;

    if (!text || typeof text !== 'string') {
      const res = NextResponse.json({ error: 'Text is required for TTS synthesis' }, { status: 400 });
      return secureResponse(res, request);
    }

    if (text.length > MAX_TEXT_LENGTH) {
      const res = NextResponse.json(
        { error: `Text too long (max ${MAX_TEXT_LENGTH} characters)` },
        { status: 400 },
      );
      return secureResponse(res, request);
    }

    // Synthesize
    const tts = createTTSEngine(auth.userId);
    const result = await tts.synthesize(text, {
      voice: voice || 'alloy',
      model: model || 'tts-1',
      speed: speed ?? 1.0,
      responseFormat: responseFormat || 'mp3',
      language: language || 'en-US',
    });

    // Return audio as base64
    const res = NextResponse.json({
      audio: result.audioBuffer.toString('base64'),
      duration: result.duration,
      format: result.format,
      size: result.size,
    });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Speech synthesis failed';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
