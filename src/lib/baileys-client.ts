/**
 * Baileys WhatsApp Client — Connect to Baileys micro-service for WhatsApp messaging
 * 
 * Baileys is a WhatsApp Web API that provides a persistent WebSocket connection
 * to WhatsApp servers. This client communicates with a Baileys micro-service
 * that handles the actual WhatsApp connection.
 * 
 * Fallback chain: Baileys (primary) → WhatsApp Cloud API (fallback)
 * 
 * Environment variables:
 *   BAILEYS_API_URL — Base URL of the Baileys micro-service (default: http://localhost:8186)
 */

import { createLogger } from '@/lib/logger';
import { sanitizeMessage, validatePhoneNumber, MAX_MESSAGE_LENGTH, WhatsAppMessageResponse } from '@/lib/whatsapp-client';

const log = createLogger('baileys-client');

// Types
export interface BaileysConnectionState {
  connection: 'close' | 'connecting' | 'open';
  lastDisconnect?: {
    error?: { output?: { statusCode?: number } };
  };
  qrCode?: string;
}

export interface BaileysSendMessageOptions {
  to: string;
  message: string;
  quotedMessageId?: string;
  mentionJids?: string[];
}

export interface BaileysSendMediaOptions {
  to: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  mediaUrl: string;
  caption?: string;
  fileName?: string;
  mimeType?: string;
}

export interface BaileysMessageResponse {
  messageId: string;
  status: string;
  timestamp: number;
}

export interface BaileysSessionInfo {
  sessionId: string;
  connected: boolean;
  phoneNumber?: string;
  pushName?: string;
  qrCode?: string;
}

const BAILEYS_API_URL = process.env.BAILEYS_API_URL || 'http://localhost:8186';

/**
 * Check if Baileys micro-service is available
 */
export async function checkBaileysHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BAILEYS_API_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get the current Baileys session status
 */
export async function getSessionStatus(): Promise<BaileysSessionInfo> {
  const response = await fetch(`${BAILEYS_API_URL}/session/status`, {
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Baileys session status error: ${response.status}`);
  }

  return response.json();
}

/**
 * Get QR code for linking a new WhatsApp device
 */
export async function getQRCode(): Promise<{ qrCode: string; sessionId: string }> {
  const response = await fetch(`${BAILEYS_API_URL}/session/qr`, {
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Baileys QR code error: ${response.status}`);
  }

  return response.json();
}

/**
 * Send a text message via Baileys
 */
export async function sendBaileysMessage(options: BaileysSendMessageOptions): Promise<BaileysMessageResponse> {
  // Validate phone number
  const { valid, normalized } = validatePhoneNumber(options.to);
  if (!valid) {
    throw new Error(`Invalid phone number: ${options.to}. Use international format (e.g., +33612345678)`);
  }

  // Sanitize message
  const sanitized = sanitizeMessage(options.message);
  if (!sanitized) {
    throw new Error('Message content is empty after sanitization');
  }
  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`);
  }

  // Convert phone number to WhatsApp JID format
  const jid = `${normalized.replace(/^\+/, '')}@s.whatsapp.net`;

  const response = await fetch(`${BAILEYS_API_URL}/messages/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jid,
      text: sanitized,
      quoted: options.quotedMessageId,
      mentionJids: options.mentionJids,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`Baileys send message error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Send a media message via Baileys
 */
export async function sendBaileysMedia(options: BaileysSendMediaOptions): Promise<BaileysMessageResponse> {
  const { valid, normalized } = validatePhoneNumber(options.to);
  if (!valid) {
    throw new Error(`Invalid phone number: ${options.to}`);
  }

  const jid = `${normalized.replace(/^\+/, '')}@s.whatsapp.net`;

  const response = await fetch(`${BAILEYS_API_URL}/messages/send-media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jid,
      mediaType: options.mediaType,
      mediaUrl: options.mediaUrl,
      caption: options.caption ? sanitizeMessage(options.caption) : undefined,
      fileName: options.fileName,
      mimeType: options.mimeType,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Baileys send media error: ${response.status}`);
  }

  return response.json();
}

/**
 * Disconnect the Baileys session
 */
export async function disconnectSession(): Promise<void> {
  await fetch(`${BAILEYS_API_URL}/session/disconnect`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
  });
}

/**
 * Unified WhatsApp send that tries Baileys first, then falls back to Cloud API
 */
export async function sendWhatsAppMessage(to: string, message: string): Promise<WhatsAppMessageResponse> {
  // Try Baileys first
  if (await checkBaileysHealth()) {
    try {
      const result = await sendBaileysMessage({ to, message });
      return {
        messageId: result.messageId,
        recipientWaId: to.replace(/^\+/, ''),
        raw: { provider: 'baileys', status: result.status },
      };
    } catch (baileysError) {
      log.warn('Baileys send failed, falling back to Cloud API', {
        error: baileysError instanceof Error ? baileysError.message : String(baileysError),
      });
    }
  }

  // Fall back to WhatsApp Cloud API
  const { getWhatsAppClient } = await import('@/lib/whatsapp-client');
  const client = getWhatsAppClient();
  return client.sendMessage(to, message);
}

export { BAILEYS_API_URL };
