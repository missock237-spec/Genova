/**
 * API Route: /api/voice/memory
 *
 * GET: List/search voice memories
 * POST: Store a new voice memory
 * DELETE: Delete a voice memory
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createVoiceMemory } from '@/lib/voice';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 60, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query') || undefined;
    const category = searchParams.get('category') || undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const memory = createVoiceMemory(auth.userId);

    if (query) {
      // Search mode
      const results = await memory.searchMemories(auth.userId, query, limit);
      const res = NextResponse.json({
        memories: results,
        total: results.length,
        query,
      });
      return secureResponse(res, request);
    }

    // List mode
    const result = await memory.listMemories(auth.userId, {
      category: category || undefined,
      limit,
      offset,
    });

    const res = NextResponse.json(result);
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get voice memories';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { transcription, audio, type, agentId, sessionId, language, confidence, metadata } = body;

    if (!transcription || typeof transcription !== 'string') {
      const res = NextResponse.json(
        { error: 'transcription is required' },
        { status: 400 },
      );
      return secureResponse(res, request);
    }

    if (transcription.length > 10000) {
      const res = NextResponse.json(
        { error: 'Transcription too long (max 10000 characters)' },
        { status: 400 },
      );
      return secureResponse(res, request);
    }

    const memory = createVoiceMemory(auth.userId);

    const audioBuffer = audio ? Buffer.from(audio, 'base64') : undefined;

    const entry = await memory.storeMemory(auth.userId, transcription, audioBuffer, {
      type: type || 'conversation',
      agentId,
      sessionId,
      language: language || 'en-US',
      confidence: confidence ?? 0.8,
      ...metadata,
    });

    const res = NextResponse.json({
      id: entry.id,
      type: entry.type,
      transcription: entry.transcription,
      createdAt: entry.createdAt,
    }, { status: 201 });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to store voice memory';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function DELETE(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const memoryId = searchParams.get('id');

    if (!memoryId) {
      const res = NextResponse.json(
        { error: 'Memory ID is required (query param: id)' },
        { status: 400 },
      );
      return secureResponse(res, request);
    }

    const memory = createVoiceMemory(auth.userId);
    const deleted = await memory.deleteMemory(memoryId);

    if (!deleted) {
      const res = NextResponse.json({ error: 'Memory not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    const res = NextResponse.json({ success: true });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete voice memory';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
