/**
 * API Route: /api/voice/calls
 *
 * POST: Initiate an AI-powered call
 * GET: List calls for the authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createAICallSystem } from '@/lib/voice';

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
    const status = searchParams.get('status') || undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const callSystem = createAICallSystem();
    const result = await callSystem.listCalls(auth.userId, {
      status: status || undefined,
      limit,
      offset,
    });

    const res = NextResponse.json(result);
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list calls';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 10, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { provider, fromNumber, toNumber, agentId, language, maxDurationMinutes, recordingEnabled } = body;

    if (!provider || !fromNumber || !toNumber) {
      const res = NextResponse.json(
        { error: 'provider, fromNumber, and toNumber are required' },
        { status: 400 },
      );
      return secureResponse(res, request);
    }

    if (!['twilio', 'whatsapp'].includes(provider)) {
      const res = NextResponse.json(
        { error: 'provider must be twilio or whatsapp' },
        { status: 400 },
      );
      return secureResponse(res, request);
    }

    const callSystem = createAICallSystem();
    const session = await callSystem.initiateCall(
      {
        provider,
        fromNumber,
        toNumber,
        agentId: agentId || 'default',
        language: language || 'en-US',
        maxDurationMinutes: maxDurationMinutes ?? 30,
        recordingEnabled: recordingEnabled ?? false,
      },
      auth.userId,
    );

    const res = NextResponse.json({
      callId: session.id,
      status: session.status,
      startedAt: session.startedAt,
    });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to initiate call';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
