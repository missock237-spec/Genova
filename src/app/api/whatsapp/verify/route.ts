import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getWhatsAppClient } from '@/lib/whatsapp-client';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

/**
 * GET /api/whatsapp/verify
 *
 * Verifies that the WhatsApp Business API token is valid and returns
 * connection status information. Requires authentication.
 */
export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    // Check if env vars are configured
    const hasApiToken = !!process.env.WHATSAPP_API_TOKEN;
    const hasPhoneNumberId = !!process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!hasApiToken || !hasPhoneNumberId) {
      const res = NextResponse.json({
        connected: false,
        configured: false,
        missing: [
          !hasApiToken && 'WHATSAPP_API_TOKEN',
          !hasPhoneNumberId && 'WHATSAPP_PHONE_NUMBER_ID',
        ].filter(Boolean),
        message: 'WhatsApp API is not fully configured. Missing required environment variables.',
      });
      return secureResponse(res, request);
    }

    // Attempt to verify the token with the WhatsApp API
    const client = getWhatsAppClient();
    const verification = await client.verifyToken();

    const res = NextResponse.json({
      connected: verification.valid,
      configured: true,
      appId: verification.appId || null,
      appName: verification.appName || null,
      error: verification.error || null,
      message: verification.valid
        ? 'WhatsApp API connection is active and verified'
        : `WhatsApp API token verification failed: ${verification.error}`,
    });
    return secureResponse(res, request);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during verification';
    const res = NextResponse.json(
      {
        connected: false,
        configured: true,
        error: message,
        message: 'Failed to verify WhatsApp API connection',
      },
      { status: 502 }
    );
    return secureResponse(res, request);
  }
}
