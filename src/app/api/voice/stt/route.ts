/**
 * API Route: /api/voice/stt
 *
 * POST: Transcribe audio to text
 * - Accepts audio data (base64 or FormData)
 * - Returns transcription with confidence, language, and segments
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createSTTEngine } from '@/lib/voice';

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB max audio size

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
    const contentType = request.headers.get('content-type') || '';
    let audioBuffer: Buffer;
    let language: string | undefined;
    let model: 'whisper-1' | 'whisper-large-v3' | 'distil-whisper-large-v3-en' | undefined;

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData upload
      const formData = await request.formData();
      const audioFile = formData.get('audio') as File | null;

      if (!audioFile) {
        const res = NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
        return secureResponse(res, request);
      }

      const arrayBuffer = await audioFile.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);

      language = (formData.get('language') as string) || undefined;
      model = (formData.get('model') as typeof model) || undefined;
    } else {
      // Handle JSON with base64 audio
      const body = await request.json();
      const { audio, language: reqLang, model: reqModel } = body;

      if (!audio) {
        const res = NextResponse.json({ error: 'No audio data provided' }, { status: 400 });
        return secureResponse(res, request);
      }

      audioBuffer = Buffer.from(audio, 'base64');
      language = reqLang;
      model = reqModel;
    }

    // Validate audio size
    if (audioBuffer.length > MAX_AUDIO_SIZE) {
      const res = NextResponse.json(
        { error: `Audio file too large (max ${MAX_AUDIO_SIZE / 1024 / 1024}MB)` },
        { status: 400 },
      );
      return secureResponse(res, request);
    }

    if (audioBuffer.length === 0) {
      const res = NextResponse.json({ error: 'Audio data is empty' }, { status: 400 });
      return secureResponse(res, request);
    }

    // Transcribe
    const stt = createSTTEngine(auth.userId);
    const result = await stt.transcribe(audioBuffer, {
      language,
      model,
      detectLanguage: !language,
    });

    const res = NextResponse.json({
      text: result.text,
      language: result.language,
      confidence: result.confidence,
      duration: result.duration,
      segments: result.segments,
    });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transcription failed';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
