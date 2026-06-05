/**
 * WhatsApp Auto-Responder — Incoming message → AI agent pipeline
 *
 * When a client sends a WhatsApp message:
 * 1. The message is received via Baileys (or the webhook for official API)
 * 2. A 10-second delay is applied before the AI agent responds
 *    (to appear natural and avoid WhatsApp rate limits/bans)
 * 3. The AI agent generates a response using the agent's configuration
 * 4. The response is sent back via the WhatsApp router
 *
 * The autoMessage flag in WhatsAppConfig controls whether this is active.
 */

import { createLogger } from '@/lib/logger';
import { getWhatsAppRouter } from '@/lib/whatsapp-router';
import { getBaileysService } from '@/lib/whatsapp-baileys';
import { createAIRouter } from '@/lib/ai-router';
import { db } from '@/lib/db';

const log = createLogger('whatsapp-auto-responder');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Delay before AI agent responds to incoming WhatsApp messages (10 seconds) */
const RESPONSE_DELAY_MS = 10_000;

/** Maximum message length for AI processing */
const MAX_MESSAGE_LENGTH = 4000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BaileysIncomingMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text: string };
    imageMessage?: { caption?: string };
    documentMessage?: { caption?: string };
  };
  messageTimestamp?: number | string;
  pushName?: string;
}

interface WebhookIncomingMessage {
  from: string;       // Phone number (e.g., "237612345678")
  text: string;       // Message body
  timestamp: number;  // Unix timestamp
  messageId: string;  // WhatsApp message ID
  senderName?: string;
}

// ---------------------------------------------------------------------------
// Message extraction
// ---------------------------------------------------------------------------

/**
 * Extract text content from a Baileys message object.
 */
function extractBaileysText(msg: BaileysIncomingMessage): string | null {
  if (!msg.message) return null;

  // Direct text message
  if (msg.message.conversation) {
    return msg.message.conversation;
  }

  // Extended text (with link preview, etc.)
  if (msg.message.extendedTextMessage?.text) {
    return msg.message.extendedTextMessage.text;
  }

  // Image with caption
  if (msg.message.imageMessage?.caption) {
    return msg.message.imageMessage.caption;
  }

  // Document with caption
  if (msg.message.documentMessage?.caption) {
    return msg.message.documentMessage.caption;
  }

  return null;
}

/**
 * Extract phone number from Baileys JID.
 * e.g., "237612345678@s.whatsapp.net" → "237612345678"
 */
function extractPhoneFromJid(jid: string): string {
  return jid.split('@')[0];
}

// ---------------------------------------------------------------------------
// Auto-responder core
// ---------------------------------------------------------------------------

/**
 * Find the WhatsApp config and its associated agent for a given user.
 * Returns the first active WhatsApp config with autoMessage enabled.
 */
async function findAutoResponderConfig(userId: string): Promise<{
  agentId: string;
  agentName: string;
  agentConfig: Record<string, unknown>;
  agentType: string;
} | null> {
  const whatsappConfig = await db.whatsAppConfig.findFirst({
    where: {
      userId,
      isActive: true,
      autoMessage: true,
    },
  });

  if (!whatsappConfig) return null;

  // Find the user's WhatsApp-type agent (or first active agent as fallback)
  let agent = await db.agent.findFirst({
    where: {
      userId,
      type: 'whatsapp',
      status: 'active',
    },
  });

  // Fallback: use any active agent
  if (!agent) {
    agent = await db.agent.findFirst({
      where: {
        userId,
        status: 'active',
      },
    });
  }

  if (!agent) {
    log.warn('No active agent found for auto-response', { userId });
    return null;
  }

  let agentConfig: Record<string, unknown> = {};
  try {
    agentConfig = JSON.parse(agent.config);
  } catch {
    agentConfig = {};
  }

  return {
    agentId: agent.id,
    agentName: agent.name,
    agentConfig,
    agentType: agent.type,
  };
}

/**
 * Generate an AI response for an incoming WhatsApp message.
 */
async function generateAIResponse(
  userId: string,
  agentId: string,
  agentName: string,
  agentConfig: Record<string, unknown>,
  agentType: string,
  incomingMessage: string,
  senderPhone: string,
  senderName?: string,
): Promise<string> {
  const personality = (agentConfig as { personality?: string }).personality || 'helpful and professional';
  const instructions = (agentConfig as { instructions?: string }).instructions || '';

  // Retrieve agent permissions
  const permissions = await db.agentPermission.findMany({
    where: { agentId, granted: true },
    select: { permission: true },
  });
  const grantedPermissions = permissions.map((p) => p.permission);

  const systemPrompt = `You are ${agentName}, an AI assistant responding to a WhatsApp message.
- Agent Type: ${agentType}
- Personality: ${personality}
${instructions ? `- Special Instructions: ${instructions}` : ''}

Your granted permissions: ${grantedPermissions.length > 0 ? grantedPermissions.join(', ') : 'none'}

IMPORTANT RULES FOR WHATSAPP RESPONSES:
1. Keep responses concise and natural — this is a WhatsApp conversation, not an essay
2. Use a friendly, conversational tone
3. Avoid overly long messages (ideal: 1-3 short paragraphs max)
4. Do NOT mention that you are an AI unless specifically asked
5. Respond in the same language as the incoming message
6. If the user's message is a greeting, respond warmly and ask how you can help
7. Never share sensitive information, passwords, or API keys
8. If you cannot help with something, suggest alternatives politely

${senderName ? `The sender's name is ${senderName}.` : ''}

Respond to the following WhatsApp message:`;

  const router = createAIRouter(userId);

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: incomingMessage },
  ];

  const response = await router.chat(messages, { model: 'fast' });

  // Log the auto-response interaction
  await db.agentActionLog.create({
    data: {
      agentId,
      action: 'whatsapp_auto_response',
      details: JSON.stringify({
        from: senderPhone,
        messageLength: incomingMessage.length,
        responseLength: response.content.length,
        provider: response.provider,
        model: response.model,
      }),
      userId,
      status: 'completed',
      result: 'Auto-response sent via WhatsApp',
      resolvedAt: new Date(),
    },
  });

  // Learn from this interaction (fire-and-forget)
  try {
    const { learnFromInteraction } = await import('@/lib/agent-memory');
    learnFromInteraction(agentId, userId, incomingMessage, response.content).catch(() => {});
  } catch {
    // Memory module not available — silent fail
  }

  return response.content;
}

/**
 * Process an incoming WhatsApp message with a 10-second delay before responding.
 * This is the main entry point for auto-response logic.
 */
export async function processIncomingWhatsAppMessage(
  userId: string,
  senderPhone: string,
  messageText: string,
  senderName?: string,
): Promise<void> {
  const startTime = Date.now();
  log.info('Incoming WhatsApp message received', {
    userId,
    from: senderPhone,
    messageLength: messageText.length,
  });

  try {
    // Find auto-responder config
    const config = await findAutoResponderConfig(userId);
    if (!config) {
      log.info('No auto-responder configured for user', { userId });
      return;
    }

    // Truncate message if too long
    const truncatedMessage = messageText.length > MAX_MESSAGE_LENGTH
      ? messageText.substring(0, MAX_MESSAGE_LENGTH) + '...'
      : messageText;

    // ═══════════════════════════════════════════════════════════════
    // 10-SECOND DELAY BEFORE AI AGENT RESPONDS
    // This delay makes the conversation feel more natural and helps
    // avoid WhatsApp rate limits and spam detection.
    // ═══════════════════════════════════════════════════════════════
    log.info('Waiting 10 seconds before responding', {
      from: senderPhone,
      delayMs: RESPONSE_DELAY_MS,
    });
    await new Promise((resolve) => setTimeout(resolve, RESPONSE_DELAY_MS));

    // Generate AI response
    const aiResponse = await generateAIResponse(
      userId,
      config.agentId,
      config.agentName,
      config.agentConfig,
      config.agentType,
      truncatedMessage,
      senderPhone,
      senderName,
    );

    // Send response via WhatsApp router (Baileys first, official API fallback)
    const router = getWhatsAppRouter();
    const sendResult = await router.sendMessage(senderPhone, aiResponse);

    const totalDuration = Date.now() - startTime;
    log.info('WhatsApp auto-response sent', {
      from: senderPhone,
      provider: sendResult.provider,
      messageId: sendResult.messageId,
      totalDurationMs: totalDuration,
      delayMs: RESPONSE_DELAY_MS,
      responseLength: aiResponse.length,
    });
  } catch (error) {
    log.error('Failed to process WhatsApp auto-response', {
      userId,
      from: senderPhone,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Baileys message handler registration
// ---------------------------------------------------------------------------

let _baileysHandlerRegistered = false;

/**
 * Register the Baileys incoming message handler.
 * Should be called once at application startup.
 */
export async function registerBaileysAutoResponder(): Promise<void> {
  if (_baileysHandlerRegistered) {
    log.info('Baileys auto-responder already registered');
    return;
  }

  const baileys = getBaileysService();

  baileys.onMessage(async (msg: unknown) => {
    try {
      const baileysMsg = msg as BaileysIncomingMessage;

      // Skip messages sent by us
      if (baileysMsg.key?.fromMe) return;

      // Extract text content
      const text = extractBaileysText(baileysMsg);
      if (!text) {
        log.debug('Non-text Baileys message, skipping auto-response');
        return;
      }

      // Extract sender info
      const senderPhone = extractPhoneFromJid(baileysMsg.key?.remoteJid ?? '');
      const senderName = baileysMsg.pushName;

      if (!senderPhone) {
        log.warn('Could not extract sender phone from Baileys message');
        return;
      }

      // Find which user owns this WhatsApp connection
      // We need to find the user with an active WhatsApp config
      const whatsappConfigs = await db.whatsAppConfig.findMany({
        where: { isActive: true, autoMessage: true },
        select: { userId: true },
      });

      // Process for all users with auto-message enabled
      // (In practice, usually just one user per Baileys connection)
      for (const config of whatsappConfigs) {
        // Fire-and-forget — don't block the message handler
        processIncomingWhatsAppMessage(
          config.userId,
          senderPhone,
          text,
          senderName,
        ).catch((err) => {
          log.error('Auto-responder error', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (error) {
      log.error('Baileys message handler error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  _baileysHandlerRegistered = true;
  log.info('Baileys auto-responder registered with 10-second response delay');
}

// ---------------------------------------------------------------------------
// Official API webhook handler
// ---------------------------------------------------------------------------

/**
 * Process an incoming message from the WhatsApp Cloud API webhook.
 * Called by the webhook route when a message is received.
 */
export async function handleWebhookIncomingMessage(
  webhookData: WebhookIncomingMessage,
): Promise<void> {
  const { from, text, messageId, senderName } = webhookData;

  log.info('Webhook incoming message', { from, messageId });

  // Find all users with auto-message enabled and an active WhatsApp config
  const whatsappConfigs = await db.whatsAppConfig.findMany({
    where: { isActive: true, autoMessage: true },
    select: { userId: true },
  });

  for (const config of whatsappConfigs) {
    processIncomingWhatsAppMessage(
      config.userId,
      from,
      text,
      senderName,
    ).catch((err) => {
      log.error('Webhook auto-responder error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}
