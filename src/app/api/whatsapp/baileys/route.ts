/**
 * Baileys WhatsApp Session Management API
 * 
 * GET  /api/whatsapp/baileys — Get session status
 * POST /api/whatsapp/baileys — Manage session (connect, disconnect, get QR)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionStatus, getQRCode, disconnectSession, checkBaileysHealth } from '@/lib/baileys-client';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const healthy = await checkBaileysHealth();
    if (!healthy) {
      const res = NextResponse.json({
        connected: false,
        provider: 'baileys',
        status: 'unavailable',
        message: 'Baileys micro-service is not running',
      });
      return secureResponse(res, request);
    }

    const status = await getSessionStatus();
    const res = NextResponse.json({
      connected: status.connected,
      provider: 'baileys',
      status: status.connected ? 'connected' : 'disconnected',
      phoneNumber: status.phoneNumber,
      pushName: status.pushName,
    });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get Baileys session status' },
      { status: 500 },
    );
    return secureResponse(res, request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const action = body.action as 'connect' | 'disconnect' | 'qr';

    switch (action) {
      case 'qr': {
        const qrData = await getQRCode();
        const res = NextResponse.json({ qrCode: qrData.qrCode, sessionId: qrData.sessionId });
        return secureResponse(res, request);
      }
      case 'disconnect': {
        await disconnectSession();
        const res = NextResponse.json({ success: true, message: 'Disconnected' });
        return secureResponse(res, request);
      }
      case 'connect':
      default: {
        const status = await getSessionStatus();
        const res = NextResponse.json(status);
        return secureResponse(res, request);
      }
    }
  } catch (error) {
    const res = NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to manage Baileys session' },
      { status: 500 },
    );
    return secureResponse(res, request);
  }
}
