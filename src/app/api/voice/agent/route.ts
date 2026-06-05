/**
 * API Route: /api/voice/agent
 *
 * POST: Start/interact with a voice agent
 *   - action: 'start' | 'audio' | 'end' | 'status'
 *   - start: Creates a new voice agent session
 *   - audio: Processes audio through STT → AI → TTS pipeline
 *   - end: Ends a session and saves memory
 *   - status: Gets current session state
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createVoiceAgent } from '@/lib/voice';

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
    const { action } = body;

    if (!action) {
      const res = NextResponse.json({ error: 'Action is required (start, audio, end, status)' }, { status: 400 });
      return secureResponse(res, request);
    }

    const agent = createVoiceAgent(auth.userId);

    switch (action) {
      case 'start': {
        const { agentId, voiceProfileId, language, enableInterruption, vadSensitivity, responseDelayMs } = body;

        if (!agentId) {
          const res = NextResponse.json({ error: 'agentId is required to start a session' }, { status: 400 });
          return secureResponse(res, request);
        }

        const session = await agent.startSession(
          {
            agentId,
            voiceProfileId,
            language: language || 'en-US',
            enableInterruption: enableInterruption ?? true,
            vadSensitivity: vadSensitivity || 'medium',
            responseDelayMs: responseDelayMs ?? 200,
          },
          auth.userId,
        );

        const res = NextResponse.json({
          sessionId: session.id,
          status: session.status,
          agentId: session.agentId,
          startedAt: session.startedAt,
        });
        return secureResponse(res, request);
      }

      case 'audio': {
        const { sessionId, audio } = body;

        if (!sessionId || !audio) {
          const res = NextResponse.json({ error: 'sessionId and audio are required' }, { status: 400 });
          return secureResponse(res, request);
        }

        const audioBuffer = Buffer.from(audio, 'base64');
        const responseAudio = await agent.processAudio(sessionId, audioBuffer);

        const session = agent.getSession(sessionId);
        const res = NextResponse.json({
          audio: responseAudio ? responseAudio.toString('base64') : null,
          status: session?.status ?? 'unknown',
          transcript: session?.transcript ?? [],
        });
        return secureResponse(res, request);
      }

      case 'end': {
        const { sessionId } = body;

        if (!sessionId) {
          const res = NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
          return secureResponse(res, request);
        }

        await agent.endSession(sessionId);

        const res = NextResponse.json({ success: true, sessionId });
        return secureResponse(res, request);
      }

      case 'status': {
        const { sessionId } = body;

        if (!sessionId) {
          const res = NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
          return secureResponse(res, request);
        }

        const session = agent.getSession(sessionId);

        if (!session) {
          const res = NextResponse.json({ error: 'Session not found or has ended' }, { status: 404 });
          return secureResponse(res, request);
        }

        const res = NextResponse.json({
          sessionId: session.id,
          status: session.status,
          transcript: session.transcript,
        });
        return secureResponse(res, request);
      }

      default: {
        const res = NextResponse.json(
          { error: `Unknown action: ${action}. Valid actions: start, audio, end, status` },
          { status: 400 },
        );
        return secureResponse(res, request);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Voice agent error';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
