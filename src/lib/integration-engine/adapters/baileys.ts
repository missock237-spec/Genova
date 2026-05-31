/**
 * Baileys Adapter — Genova Integration Engine
 *
 * Integrates Baileys WhatsApp Web API into Genova.
 * Provides WhatsApp messaging with Cloud API fallback.
 */

import type {
  IntegrationAdapter,
  IntegrationConfig,
  ExecutionResult,
  HealthCheckResult,
} from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('adapter-baileys');

const BAILEYS_API_URL = process.env.BAILEYS_API_URL || 'http://localhost:8186';

export class BaileysAdapter implements IntegrationAdapter {
  readonly config: IntegrationConfig = {
    id: 'baileys',
    name: 'baileys',
    displayName: 'Baileys WhatsApp',
    description: 'WhatsApp Web API via Baileys with Cloud API fallback for messaging and notifications',
    version: '1.0.0',
    category: 'communication',
    icon: '💬',
    color: '#25D366',
    homepage: 'https://github.com/WhiskeySockets/Baileys',
    repository: 'https://github.com/WhiskeySockets/Baileys',
    status: 'discovered',
    functions: [
      {
        id: 'baileys-send-message',
        name: 'sendMessage',
        displayName: 'Send WhatsApp Message',
        description: 'Send a text message via WhatsApp',
        category: 'communication',
        inputSchema: [
          { name: 'to', type: 'string', required: true, description: 'Recipient phone number (international format)' },
          { name: 'message', type: 'string', required: true, description: 'Message text content' },
          { name: 'options', type: 'object', required: false, description: 'Additional send options' },
        ],
        outputSchema: [
          { name: 'messageId', type: 'string', required: true, description: 'Message ID' },
          { name: 'status', type: 'string', required: true, description: 'Delivery status' },
          { name: 'provider', type: 'string', required: true, description: 'Provider used' },
        ],
        requiresAuth: true,
        authType: 'token',
        timeoutMs: 15_000,
        costPerCall: 0,
        tags: ['whatsapp', 'messaging', 'communication'],
      },
      {
        id: 'baileys-send-media',
        name: 'sendMedia',
        displayName: 'Send WhatsApp Media',
        description: 'Send an image, video, or document via WhatsApp',
        category: 'communication',
        inputSchema: [
          { name: 'to', type: 'string', required: true, description: 'Recipient phone number' },
          { name: 'mediaUrl', type: 'string', required: true, description: 'URL of the media file' },
          { name: 'caption', type: 'string', required: false, description: 'Media caption' },
          { name: 'mediaType', type: 'string', required: false, defaultValue: 'image', description: 'Media type', enum: ['image', 'video', 'document', 'audio'] },
        ],
        outputSchema: [
          { name: 'messageId', type: 'string', required: true, description: 'Message ID' },
          { name: 'status', type: 'string', required: true, description: 'Delivery status' },
        ],
        requiresAuth: true,
        authType: 'token',
        timeoutMs: 30_000,
        costPerCall: 0,
        tags: ['whatsapp', 'media', 'communication'],
      },
      {
        id: 'baileys-get-status',
        name: 'getConnectionStatus',
        displayName: 'Get Connection Status',
        description: 'Check WhatsApp Web connection status',
        category: 'communication',
        inputSchema: [],
        outputSchema: [
          { name: 'connected', type: 'boolean', required: true, description: 'Connection status' },
          { name: 'phoneNumber', type: 'string', required: false, description: 'Connected phone number' },
        ],
        requiresAuth: false,
        timeoutMs: 5_000,
        costPerCall: 0,
        tags: ['whatsapp', 'status', 'connection'],
      },
    ],
    dependencies: ['@whiskeysockets/baileys', 'qrcode-terminal', 'pino'],
    envVariables: [
      { name: 'BAILEYS_API_URL', description: 'Baileys API server URL', required: false, defaultValue: 'http://localhost:8186', isSecret: false },
      { name: 'WHATSAPP_API_TOKEN', description: 'WhatsApp Cloud API token (fallback)', required: false, isSecret: true },
      { name: 'WHATSAPP_PHONE_NUMBER_ID', description: 'WhatsApp Cloud API phone number ID (fallback)', required: false, isSecret: false },
    ],
    apiBaseUrl: BAILEYS_API_URL,
    metadata: { fallbackChain: ['baileys', 'whatsapp-cloud-api'] },
  };

  async initialize(): Promise<void> {
    log.info('Baileys adapter initializing');
  }

  async execute(functionId: string, params: Record<string, unknown>, _userId: string): Promise<ExecutionResult> {
    switch (functionId) {
      case 'baileys-send-message':
      case 'sendMessage':
        return this.sendMessage(params);
      case 'baileys-send-media':
      case 'sendMedia':
        return this.sendMedia(params);
      case 'baileys-get-status':
      case 'getConnectionStatus':
        return this.getConnectionStatus();
      default:
        return { success: false, error: `Unknown function: ${functionId}`, executionTimeMs: 0, provider: 'baileys', costUsd: 0, metadata: {} };
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${BAILEYS_API_URL}/health`, { signal: controller.signal });
      clearTimeout(timer);
      return { healthy: res.ok, responseTimeMs: Date.now() - start, checkedAt: new Date() };
    } catch {
      // Baileys might not be running — that's OK, we have Cloud API fallback
      return { healthy: false, responseTimeMs: Date.now() - start, error: 'Baileys server not reachable', checkedAt: new Date() };
    }
  }

  async shutdown(): Promise<void> {
    log.info('Baileys adapter shutting down');
  }

  private async sendMessage(params: Record<string, unknown>): Promise<ExecutionResult> {
    const { to, message, options } = params as { to: string; message: string; options?: Record<string, unknown> };
    const startTime = Date.now();

    // Try Baileys first
    try {
      const res = await fetch(`${BAILEYS_API_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message, ...options }),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          success: true,
          data: { messageId: data.messageId, status: 'sent', provider: 'baileys' },
          executionTimeMs: Date.now() - startTime,
          provider: 'baileys',
          costUsd: 0,
          metadata: { provider: 'baileys' },
        };
      }
    } catch {
      log.info('Baileys unavailable, falling back to WhatsApp Cloud API');
    }

    // Fallback: WhatsApp Cloud API
    const apiToken = process.env.WHATSAPP_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!apiToken || !phoneNumberId) {
      return {
        success: false,
        error: 'Both Baileys and WhatsApp Cloud API are unavailable. Configure WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID.',
        executionTimeMs: Date.now() - startTime,
        provider: 'baileys',
        costUsd: 0,
        metadata: {},
      };
    }

    try {
      const normalizedTo = to.replace(/[\s\-()]/g, '').replace(/^\+/, '');
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalizedTo,
          type: 'text',
          text: { body: message },
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Cloud API error (${res.status}): ${errBody.slice(0, 200)}`);
      }

      const data = await res.json();
      return {
        success: true,
        data: { messageId: data.messages?.[0]?.id, status: 'sent', provider: 'whatsapp-cloud-api' },
        executionTimeMs: Date.now() - startTime,
        provider: 'whatsapp-cloud-api',
        costUsd: 0,
        metadata: { provider: 'whatsapp-cloud-api', fallbackFrom: 'baileys' },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WhatsApp send failed',
        executionTimeMs: Date.now() - startTime,
        provider: 'baileys',
        costUsd: 0,
        metadata: {},
      };
    }
  }

  private async sendMedia(params: Record<string, unknown>): Promise<ExecutionResult> {
    const { to, mediaUrl, caption, mediaType } = params as { to: string; mediaUrl: string; caption?: string; mediaType?: string };
    const startTime = Date.now();

    try {
      const res = await fetch(`${BAILEYS_API_URL}/send-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, mediaUrl, caption, mediaType: mediaType || 'image' }),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          success: true,
          data: { messageId: data.messageId, status: 'sent', provider: 'baileys' },
          executionTimeMs: Date.now() - startTime,
          provider: 'baileys',
          costUsd: 0,
          metadata: { provider: 'baileys' },
        };
      }
    } catch {
      log.info('Baileys unavailable for media send');
    }

    return {
      success: false,
      error: 'Media sending requires Baileys server to be running',
      executionTimeMs: Date.now() - startTime,
      provider: 'baileys',
      costUsd: 0,
      metadata: {},
    };
  }

  private async getConnectionStatus(): Promise<ExecutionResult> {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${BAILEYS_API_URL}/status`, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        return {
          success: true,
          data: { connected: data.connected, phoneNumber: data.phoneNumber, provider: 'baileys' },
          executionTimeMs: Date.now() - startTime,
          provider: 'baileys',
          costUsd: 0,
          metadata: {},
        };
      }
    } catch {
      // Not available
    }

    return {
      success: true,
      data: { connected: false, provider: 'baileys' },
      executionTimeMs: Date.now() - startTime,
      provider: 'baileys',
      costUsd: 0,
      metadata: {},
    };
  }
}
