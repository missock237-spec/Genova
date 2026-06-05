/**
 * WhatsApp Cloud API Webhook Endpoint
 *
 * GET  — Verification endpoint (Meta requires this during setup)
 * POST — Receives incoming messages and status updates from WhatsApp
 *
 * When a message is received, it triggers the auto-responder pipeline
 * with a 10-second delay before the AI agent responds.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { handleWebhookIncomingMessage } from '@/lib/whatsapp-auto-responder';

const log = createLogger('whatsapp-webhook');

// ---------------------------------------------------------------------------
// GET — Webhook verification (required by Meta)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  log.info('Webhook verification request', { mode, token: token ? 'provided' : 'missing' });

  // Verify the webhook token matches our configured token
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    log.info('Webhook verified successfully');
    return new NextResponse(challenge, { status: 200 });
  }

  log.warn('Webhook verification failed', {
    mode,
    tokenProvided: !!token,
    expectedToken: verifyToken ? 'configured' : 'not configured',
  });

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// ---------------------------------------------------------------------------
// POST — Incoming messages from WhatsApp Cloud API
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    log.info('Webhook POST received', {
      object: body.object,
      entryCount: body.entry?.length ?? 0,
    });

    // Validate this is a WhatsApp webhook event
    if (body.object !== 'whatsapp_business_account') {
      log.warn('Invalid webhook object', { object: body.object });
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    // Process each entry
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;

        // Process incoming messages
        if (value?.messages && Array.isArray(value.messages)) {
          for (const message of value.messages) {
            // Skip messages from the business account
            if (message.from_me) continue;

            const text = message.text?.body
              || message.image?.caption
              || message.document?.caption
              || message.video?.caption
              || null;

            if (!text) {
              log.debug('Non-text webhook message, skipping auto-response', {
                type: message.type,
                from: message.from,
              });
              continue;
            }

            log.info('Processing webhook message', {
              from: message.from,
              type: message.type,
              messageId: message.id,
            });

            // Trigger auto-responder with 10-second delay
            handleWebhookIncomingMessage({
              from: message.from,
              text,
              timestamp: parseInt(message.timestamp, 10) || Date.now(),
              messageId: message.id,
              senderName: message.profile?.name,
            }).catch((err) => {
              log.error('Webhook auto-responder error', {
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
        }

        // Log status updates (delivered, read, etc.)
        if (value?.statuses && Array.isArray(value.statuses)) {
          for (const status of value.statuses) {
            log.info('Message status update', {
              messageId: status.id,
              status: status.status,
              recipient: status.recipient_id,
              timestamp: status.timestamp,
            });
          }
        }
      }
    }

    // Always return 200 quickly — Meta expects fast acknowledgment
    return NextResponse.json({ status: 'received' }, { status: 200 });
  } catch (error) {
    log.error('Webhook POST processing error', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Still return 200 to prevent Meta from retrying
    return NextResponse.json({ status: 'error' }, { status: 200 });
  }
}
