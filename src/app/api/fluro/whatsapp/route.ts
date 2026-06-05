/**
 * Fluro.IA WhatsApp Integration API
 *
 * GET  /api/fluro/whatsapp — Get WhatsApp connection status via Baileys
 * POST /api/fluro/whatsapp — Connect/disconnect WhatsApp via Fluro
 *
 * Flow:
 *   1. User provides their phone number in the SaaS
 *   2. Fluro.IA sends a connection request to the Baileys server
 *   3. Baileys generates a QR code for the user to scan
 *   4. Once scanned, the WhatsApp connection is established
 *   5. Fluro can now send/receive messages on behalf of the user
 *
 * The WhatsApp connection is managed entirely through Fluro.IA,
 * ensuring all messaging goes through the Fluro orchestration layer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { createLogger } from '@/lib/logger';

const log = createLogger('fluro-whatsapp');

const BAILEYS_API_URL = process.env.BAILEYS_API_URL || 'http://localhost:8186';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BaileysHealthResponse {
  status: string;
  connection: string;
  phoneNumber: string | null;
  uptime: number;
}

interface BaileysQRResponse {
  qr: string;
}

interface BaileysSendResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  state?: string;
}

// ---------------------------------------------------------------------------
// Helper: fetch from Baileys with timeout
// ---------------------------------------------------------------------------

async function fetchBaileys(
  path: string,
  options?: RequestInit,
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BAILEYS_API_URL}${path}`, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (error) {
    clearTimeout(timer);
    throw new Error(
      `Baileys WhatsApp server unreachable: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/fluro/whatsapp — Get WhatsApp connection status
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    // Check Baileys health
    const healthRes = await fetchBaileys('/health');
    if (!healthRes.ok) {
      return NextResponse.json({
        success: false,
        data: {
          connected: false,
          status: 'offline',
          provider: 'fluro-baileys',
          error: 'Baileys server not responding',
        },
      });
    }

    const health: BaileysHealthResponse = await healthRes.json();

    // If connected, get the status details
    if (health.connection === 'connected') {
      return NextResponse.json({
        success: true,
        data: {
          connected: true,
          status: 'connected',
          phoneNumber: health.phoneNumber,
          provider: 'fluro-baileys',
          uptime: health.uptime,
          message: 'WhatsApp is connected via Fluro.IA',
        },
      });
    }

    // If not connected, try to get QR code
    let qrCode: string | null = null;
    try {
      const qrRes = await fetchBaileys('/qr');
      if (qrRes.ok) {
        const qrData: BaileysQRResponse = await qrRes.json();
        qrCode = qrData.qr;
      }
    } catch {
      // QR code not available yet
    }

    return NextResponse.json({
      success: true,
      data: {
        connected: false,
        status: health.connection,
        phoneNumber: null,
        qrCode,
        provider: 'fluro-baileys',
        message: qrCode
          ? 'Scan the QR code with WhatsApp to connect via Fluro.IA'
          : 'WhatsApp not connected. Request a connection to generate a QR code.',
      },
    });
  } catch (error) {
    log.error('Failed to get WhatsApp status', { error });
    return NextResponse.json(
      {
        success: false,
        data: {
          connected: false,
          status: 'error',
          provider: 'fluro-baileys',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 503 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/fluro/whatsapp — Connect/send/disconnect
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'connect':
        return handleConnect();
      case 'disconnect':
        return handleDisconnect();
      case 'send':
        return handleSend(body);
      case 'send-media':
        return handleSendMedia(body);
      default:
        return NextResponse.json(
          { success: false, error: 'Action must be: connect, disconnect, send, send-media' },
          { status: 400 },
        );
    }
  } catch (error) {
    log.error('WhatsApp action failed', { error });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'WhatsApp action failed',
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Connect — Initiate WhatsApp connection via Fluro/Baileys
// ---------------------------------------------------------------------------

async function handleConnect(): Promise<NextResponse> {
  try {
    // Check current status first
    const healthRes = await fetchBaileys('/health');
    if (!healthRes.ok) {
      return NextResponse.json({
        success: false,
        error: 'Baileys WhatsApp server is not running. Start it first.',
      }, { status: 503 });
    }

    const health: BaileysHealthResponse = await healthRes.json();

    if (health.connection === 'connected') {
      return NextResponse.json({
        success: true,
        data: {
          connected: true,
          phoneNumber: health.phoneNumber,
          message: 'WhatsApp is already connected via Fluro.IA',
        },
      });
    }

    // Try to get QR code for the user to scan
    try {
      const qrRes = await fetchBaileys('/qr');
      if (qrRes.ok) {
        const qrData: BaileysQRResponse = await qrRes.json();
        return NextResponse.json({
          success: true,
          data: {
            connected: false,
            status: 'awaiting_scan',
            qrCode: qrData.qr,
            message: 'Scan this QR code with your WhatsApp to connect via Fluro.IA. Open WhatsApp > Settings > Linked Devices > Link a Device',
          },
        });
      }
    } catch {
      // QR not ready yet
    }

    return NextResponse.json({
      success: true,
      data: {
        connected: false,
        status: health.connection,
        message: 'WhatsApp connection is being established. Poll GET /api/fluro/whatsapp for QR code.',
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }, { status: 503 });
  }
}

// ---------------------------------------------------------------------------
// Disconnect — Stop WhatsApp connection
// ---------------------------------------------------------------------------

async function handleDisconnect(): Promise<NextResponse> {
  try {
    // Restart Baileys to clear auth state
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    await execAsync('pm2 restart baileys-whatsapp', { timeout: 15000 }).catch(() => {
      // Ignore errors - pm2 may not be available
    });

    return NextResponse.json({
      success: true,
      data: {
        connected: false,
        message: 'WhatsApp disconnected. Scan QR code again to reconnect via Fluro.IA.',
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Disconnect failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Send — Send a text message via Fluro/Baileys
// ---------------------------------------------------------------------------

async function handleSend(body: Record<string, unknown>): Promise<NextResponse> {
  const { to, message } = body as { to?: string; message?: string };

  if (!to || !message) {
    return NextResponse.json(
      { success: false, error: 'to and message are required' },
      { status: 400 },
    );
  }

  // Validate phone number format
  const phoneRegex = /^\+?[1-9]\d{6,14}$/;
  if (!phoneRegex.test(String(to).replace(/[\s-]/g, ''))) {
    return NextResponse.json(
      { success: false, error: 'Invalid phone number format. Use international format (e.g., +237612345678)' },
      { status: 400 },
    );
  }

  if (String(message).length > 4096) {
    return NextResponse.json(
      { success: false, error: 'Message too long (max 4096 characters)' },
      { status: 400 },
    );
  }

  try {
    const res = await fetchBaileys('/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, message }),
    });

    const data: BaileysSendResponse = await res.json();

    if (!res.ok || !data.success) {
      return NextResponse.json({
        success: false,
        error: data.error || 'Failed to send message',
        provider: 'fluro-baileys',
        state: data.state,
      }, { status: res.ok ? 500 : res.status });
    }

    log.info('WhatsApp message sent via Fluro', { to, messageId: data.messageId });

    return NextResponse.json({
      success: true,
      data: {
        messageId: data.messageId,
        to,
        provider: 'fluro-baileys',
        message: 'Message sent via Fluro.IA WhatsApp',
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Send failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }, { status: 503 });
  }
}

// ---------------------------------------------------------------------------
// Send Media — Send image/video/audio via Fluro/Baileys
// ---------------------------------------------------------------------------

async function handleSendMedia(body: Record<string, unknown>): Promise<NextResponse> {
  const { to, mediaUrl, caption, mediaType } = body as {
    to?: string;
    mediaUrl?: string;
    caption?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'document';
  };

  if (!to || !mediaUrl) {
    return NextResponse.json(
      { success: false, error: 'to and mediaUrl are required' },
      { status: 400 },
    );
  }

  try {
    const res = await fetchBaileys('/send-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, mediaUrl, caption, mediaType: mediaType || 'image' }),
    });

    const data: BaileysSendResponse = await res.json();

    if (!res.ok || !data.success) {
      return NextResponse.json({
        success: false,
        error: data.error || 'Failed to send media',
        provider: 'fluro-baileys',
      }, { status: res.ok ? 500 : res.status });
    }

    log.info('WhatsApp media sent via Fluro', { to, mediaType, messageId: data.messageId });

    return NextResponse.json({
      success: true,
      data: {
        messageId: data.messageId,
        to,
        mediaType: mediaType || 'image',
        provider: 'fluro-baileys',
        message: 'Media sent via Fluro.IA WhatsApp',
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Send media failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }, { status: 503 });
  }
}
