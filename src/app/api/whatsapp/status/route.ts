import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getWhatsAppRouter } from '@/lib/whatsapp-router';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

/**
 * GET /api/whatsapp/status
 *
 * Returns current WhatsApp connection status:
 * - Which provider is active (baileys or official)
 * - Baileys QR code if not yet authenticated
 * - Connection state and last activity
 */
export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const router = getWhatsAppRouter();
    const status = router.getConnectionStatus();

    const res = NextResponse.json({
      provider: status.activeProvider,
      fallbackMode: status.fallbackMode,
      baileys: {
        state: status.baileysState,
        qrRequired: status.baileysQrRequired,
        qrCode: status.baileysQrCode,
        lastActivity: status.lastActivity,
      },
      official: {
        available: status.officialApiAvailable,
      },
      consecutiveBaileysFailures: status.consecutiveBaileysFailures,
      fallbackRetryAt: status.fallbackRetryAt,
    });

    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json(
      {
        error: 'Failed to get WhatsApp status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
