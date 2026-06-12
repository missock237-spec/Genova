/**
 * WhatsApp Router — Unified interface for WhatsApp messaging
 *
 * Routes messages through either Baileys (WhatsApp Web) or the
 * official WhatsApp Business API, with automatic failover.
 *
 * Priority:
 *  1. Baileys (more flexible, no message fees)
 *  2. WhatsApp Cloud API (more reliable, fallback)
 */

import { createLogger } from '@/lib/logger';
import { getBaileysService } from '@/lib/whatsapp-baileys';
import { getWhatsAppClient, type WhatsAppMessageResponse, type WhatsAppCallResponse } from '@/lib/whatsapp-client';
import { registerBaileysAutoResponder } from '@/lib/whatsapp-auto-responder';

const log = createLogger('whatsapp-router');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WhatsAppProvider = 'baileys' | 'official';

export interface RouterSendMessageResult {
  provider: WhatsAppProvider;
  messageId: string;
  recipientWaId?: string;
  timestamp?: number;
}

export interface RouterSendImageResult {
  provider: WhatsAppProvider;
  messageId: string;
  timestamp?: number;
}

export interface RouterCallResult {
  provider: WhatsAppProvider;
  callId: string;
}

export interface WhatsAppRouterStatus {
  activeProvider: WhatsAppProvider;
  baileysState: string;
  baileysQrRequired: boolean;
  baileysQrCode: string | null;
  officialApiAvailable: boolean;
  lastActivity: string | null;
  fallbackMode: boolean;
  consecutiveBaileysFailures: number;
  fallbackRetryAt: string | null;
}

// ---------------------------------------------------------------------------
// Router Class
// ---------------------------------------------------------------------------

class WhatsAppRouter {
  private activeProvider: WhatsAppProvider = 'baileys';
  private fallbackMode = false;
  private consecutiveBaileysFailures = 0;
  private readonly maxConsecutiveFailures = 3;
  private fallbackRetryAt: Date | null = null;
  private fallbackDurationMs = 5 * 60 * 1000; // 5 minutes
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastProviderSwitch: Date | null = null;

  constructor() {
    this.initBaileys().catch((err) => {
      log.warn('Baileys auto-connect failed on init', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  async sendMessage(to: string, message: string): Promise<RouterSendMessageResult> {
    this.maybeResetFromFallback();

    if (!this.fallbackMode && this.activeProvider === 'baileys') {
      try {
        const baileys = getBaileysService();
        if (baileys.isConnected()) {
          const result = await baileys.sendMessage(to, message);
          this.onBaileysSuccess();
          return {
            provider: 'baileys',
            messageId: result.messageId,
            timestamp: result.timestamp,
          };
        }
      } catch (error) {
        this.onBaileysFailure(error);
      }
    }

    return this.sendViaOfficialApi(to, message);
  }

  async sendImage(to: string, imageBuffer: Buffer, caption?: string): Promise<RouterSendImageResult> {
    this.maybeResetFromFallback();

    if (!this.fallbackMode && this.activeProvider === 'baileys') {
      try {
        const baileys = getBaileysService();
        if (baileys.isConnected()) {
          const result = await baileys.sendImage(to, imageBuffer, caption);
          this.onBaileysSuccess();
          return {
            provider: 'baileys',
            messageId: result.messageId,
            timestamp: result.timestamp,
          };
        }
      } catch (error) {
        this.onBaileysFailure(error);
      }
    }

    const fallbackMessage = caption ? `[Image: ${caption}]` : '[Image]';
    const result = await this.sendViaOfficialApi(to, fallbackMessage);
    return {
      provider: result.provider,
      messageId: result.messageId,
      timestamp: result.timestamp,
    };
  }

  async initiateCall(to: string, message?: string): Promise<RouterCallResult> {
    log.info('Initiating call via official WhatsApp API', { to });
    try {
      const client = getWhatsAppClient();
      const result = await client.initiateCall(to, message);
      return {
        provider: 'official',
        callId: result.callId,
      };
    } catch (error) {
      log.error('WhatsApp call failed', { to, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  getConnectionStatus(): WhatsAppRouterStatus {
    const baileys = getBaileysService();
    const baileysHealth = baileys.healthCheck();

    let officialApiAvailable = false;
    try {
      getWhatsAppClient();
      officialApiAvailable = true;
    } catch {
      officialApiAvailable = false;
    }

    return {
      activeProvider: this.fallbackMode ? 'official' : this.activeProvider,
      baileysState: baileysHealth.state,
      baileysQrRequired: baileysHealth.qrRequired,
      baileysQrCode: baileys.getQRCode(),
      officialApiAvailable,
      lastActivity: baileysHealth.lastActivity,
      fallbackMode: this.fallbackMode,
      consecutiveBaileysFailures: this.consecutiveBaileysFailures,
      fallbackRetryAt: this.fallbackRetryAt?.toISOString() ?? null,
    };
  }

  forceFallback(): void {
    this.fallbackMode = true;
    this.activeProvider = 'official';
    this.fallbackRetryAt = new Date(Date.now() + this.fallbackDurationMs);
    this.scheduleFallbackRetry();
  }

  async resetToPrimary(): Promise<boolean> {
    try {
      const baileys = getBaileysService();
      if (!baileys.isConnected()) {
        await baileys.connect();
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (baileys.isConnected()) {
        this.fallbackMode = false;
        this.activeProvider = 'baileys';
        this.consecutiveBaileysFailures = 0;
        this.fallbackRetryAt = null;
        if (this.retryTimer) {
          clearTimeout(this.retryTimer);
          this.retryTimer = null;
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async initBaileys(): Promise<void> {
    const baileys = getBaileysService();
    await baileys.connect();
    await registerBaileysAutoResponder();
  }

  private onBaileysSuccess(): void {
    this.consecutiveBaileysFailures = 0;
  }

  private onBaileysFailure(error: unknown): void {
    this.consecutiveBaileysFailures++;
    if (this.consecutiveBaileysFailures >= this.maxConsecutiveFailures) {
      this.forceFallback();
    }
  }

  private maybeResetFromFallback(): void {
    if (this.fallbackMode && this.fallbackRetryAt && new Date() >= this.fallbackRetryAt) {
      this.resetToPrimary().catch(() => {});
    }
  }

  private scheduleFallbackRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.resetToPrimary().catch(() => {});
    }, this.fallbackDurationMs);
  }

  private async sendViaOfficialApi(to: string, message: string): Promise<RouterSendMessageResult> {
    const client = getWhatsAppClient();
    const result = await client.sendMessage(to, message);
    return {
      provider: 'official',
      messageId: result.messageId,
      recipientWaId: result.recipientWaId,
    };
  }
}

let _router: WhatsAppRouter | null = null;

export function getWhatsAppRouter(): WhatsAppRouter {
  if (!_router) {
    _router = new WhatsAppRouter();
  }
  return _router;
}

export { WhatsAppRouter };
