/**
 * API Route: /api/voice/profile
 *
 * GET: Get the current user's voice profile
 * PUT: Create or update the voice profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { db } from '@/lib/db';

const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const VALID_PROVIDERS = ['openai', 'elevenlabs', 'azure', 'z-ai-sdk'];

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
    const profile = await db.voiceProfile.findUnique({
      where: { userId: auth.userId },
    });

    if (!profile) {
      // Return default profile
      const res = NextResponse.json({
        language: 'en-US',
        voiceModel: 'alloy',
        speed: 1.0,
        pitch: 1.0,
        volume: 1.0,
        provider: 'openai',
        isActive: true,
      });
      return secureResponse(res, request);
    }

    const res = NextResponse.json({
      id: profile.id,
      language: profile.language,
      voiceModel: profile.voiceModel,
      speed: profile.speed,
      pitch: profile.pitch,
      volume: profile.volume,
      provider: profile.provider,
      isActive: profile.isActive,
      metadata: JSON.parse(profile.metadata || '{}'),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get voice profile';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function PUT(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 20, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { language, voiceModel, speed, pitch, volume, provider, isActive, metadata } = body;

    // Validate inputs
    if (voiceModel && !VALID_VOICES.includes(voiceModel)) {
      const res = NextResponse.json(
        { error: `Invalid voice model. Valid: ${VALID_VOICES.join(', ')}` },
        { status: 400 },
      );
      return secureResponse(res, request);
    }

    if (provider && !VALID_PROVIDERS.includes(provider)) {
      const res = NextResponse.json(
        { error: `Invalid provider. Valid: ${VALID_PROVIDERS.join(', ')}` },
        { status: 400 },
      );
      return secureResponse(res, request);
    }

    if (speed !== undefined && (speed < 0.25 || speed > 4.0)) {
      const res = NextResponse.json(
        { error: 'Speed must be between 0.25 and 4.0' },
        { status: 400 },
      );
      return secureResponse(res, request);
    }

    if (pitch !== undefined && (pitch < 0.5 || pitch > 2.0)) {
      const res = NextResponse.json(
        { error: 'Pitch must be between 0.5 and 2.0' },
        { status: 400 },
      );
      return secureResponse(res, request);
    }

    // Upsert profile
    const profile = await db.voiceProfile.upsert({
      where: { userId: auth.userId },
      update: {
        ...(language !== undefined && { language }),
        ...(voiceModel !== undefined && { voiceModel }),
        ...(speed !== undefined && { speed }),
        ...(pitch !== undefined && { pitch }),
        ...(volume !== undefined && { volume }),
        ...(provider !== undefined && { provider }),
        ...(isActive !== undefined && { isActive }),
        ...(metadata !== undefined && { metadata: JSON.stringify(metadata) }),
      },
      create: {
        userId: auth.userId,
        language: language || 'en-US',
        voiceModel: voiceModel || 'alloy',
        speed: speed ?? 1.0,
        pitch: pitch ?? 1.0,
        volume: volume ?? 1.0,
        provider: provider || 'openai',
        isActive: isActive ?? true,
        metadata: JSON.stringify(metadata || {}),
      },
    });

    const res = NextResponse.json({
      id: profile.id,
      language: profile.language,
      voiceModel: profile.voiceModel,
      speed: profile.speed,
      pitch: profile.pitch,
      volume: profile.volume,
      provider: profile.provider,
      isActive: profile.isActive,
      updatedAt: profile.updatedAt,
    });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update voice profile';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
