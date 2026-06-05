/**
 * WhatsApp Router — Unified entry point for all WhatsApp operations
 *
 * Strategy: Baileys FIRST → Official WhatsApp Cloud API fallback
 *
 * If Baileys fails 3 times in a row, automatically switch to fallback
 * mode for 5 minutes before retrying Baileys.
 */

import { createLogger } from '@/lib/logger';
import { getBaileysService, type BaileysConnectionState } from '@/lib/whatsapp-baileys';
import { getWhatsAppClient, type WhatsAppMessageResponse } from '@/lib/whatsapp-client';
import { registerBaileysAutoResponder } from '@/lib/whatsapp-auto-responder';

const log = createLogger('whatsapp-router');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WhatsAppProvider = 'baileys' | 'official';

export interface WhatsAppRouterStatus {
  activeProvider: WhatsAppProvider;
  baileysState: BaileysConnectionState;
  baileysQrRequired: boolean;
  baileysQrCode: string | null;
  officialApiAvailable: boolean;
  lastActivity: string | null;
  fallbackMode: boolean;
  consecutiveBaileysFailures: number;
  fallbackRetryAt: string | null;
}

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

// ---------------------------------------------------------------------------
// Router class
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
    // Attempt to connect Baileys and register auto-responder on initialization
    this.initBaileys().catch((err) => {
      log.warn('Baileys auto-connect failed on init', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Send a text message. Try Baileys first, fall back to official API.
   */
  async sendMessage(to: string, message: string): Promise<RouterSendMessageResult> {
    // Check if we should attempt to reset from fallback
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
        } else {
          log.info('Baileys not connected, falling back to official API', {
            state: baileys.getConnectionState(),
          });
        }
      } catch (error) {
        this.onBaileysFailure(error);
        log.warn('Baileys send failed, falling back to official API', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback to official WhatsApp API
    return this.sendViaOfficialApi(to, message);
  }

  /**
   * Send an image message. Same fallback strategy.
   */
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
        log.warn('Baileys image send failed, falling back to official API', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Official API doesn't support direct image buffer sending in the same way.
    // Graceful degradation: send a text message indicating an image was attempted.
    log.warn('Image send only available via Baileys, sending text fallback', { to });

    try {
      const fallbackMessage = caption
        ? `[Image: ${caption}]`
        : '[Image — visual content not available via official API]';
      const result = await this.sendViaOfficialApi(to, fallbackMessage);
      return {
        provider: result.provider,
        messageId: result.messageId,
        timestamp: result.timestamp,
      };
    } catch (error) {
      log.error('Official API text fallback also failed for image', {
        to,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        'Image sending is only available via Baileys (WhatsApp Web). ' +
        'The official WhatsApp Cloud API requires a media upload step first. ' +
        'Please ensure Baileys is connected for image sending.'
      );
    }
  }

  /**
   * Get current connection status showing which provider is active.
   */
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

  /**
   * Manually switch to official API (fallback mode).
   */
  forceFallback(): void {
    log.info('Manually switching to official WhatsApp API fallback');
    this.fallbackMode = true;
    this.activeProvider = 'official';
    this.lastProviderSwitch = new Date();
    this.fallbackRetryAt = new Date(Date.now() + this.fallbackDurationMs);

    // Schedule retry after fallback duration
    this.scheduleFallbackRetry();
  }

  /**
   * Try switching back to Baileys.
   */
  async resetToPrimary(): Promise<boolean> {
    log.info('Attempting to switch back to Baileys as primary provider');

    try {
      const baileys = getBaileysService();
      if (!baileys.isConnected()) {
        log.info('Baileys not connected, attempting to connect...');
        await baileys.connect();
        // Give it a moment to establish connection
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (baileys.isConnected()) {
        this.fallbackMode = false;
        this.activeProvider = 'baileys';
        this.consecutiveBaileysFailures = 0;
        this.fallbackRetryAt = null;
        this.lastProviderSwitch = new Date();

        if (this.retryTimer) {
          clearTimeout(this.retryTimer);
          this.retryTimer = null;
        }

        log.info('Successfully switched back to Baileys');
        return true;
      }

      log.warn('Baileys still not connected after reset attempt');
      return false;
    } catch (error) {
      log.error('Failed to reset to Baileys primary', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  private async initBaileys(): Promise<void> {
    const baileys = getBaileysService();
    await baileys.connect();

    // Register the auto-responder with 10-second delay
    await registerBaileysAutoResponder();

    log.info('Baileys WhatsApp service initialized with auto-responder (10s delay)');
  }

  private onBaileysSuccess(): void {
    if (this.consecutiveBaileysFailures > 0) {
      log.info('Baileys recovered after failures', {
        previousFailures: this.consecutiveBaileysFailures,
      });
    }
    this.consecutiveBaileysFailures = 0;
  }

  private onBaileysFailure(error: unknown): void {
    this.consecutiveBaileysFailures++;

    log.warn('Baileys failure recorded', {
      consecutiveFailures: this.consecutiveBaileysFailures,
      maxBeforeFallback: this.maxConsecutiveFailures,
      error: error instanceof Error ? error.message : String(error),
    });

    if (this.consecutiveBaileysFailures >= this.maxConsecutiveFailures) {
      log.error('Baileys failed too many times, switching to fallback mode', {
        failures: this.consecutiveBaileysFailures,
        fallbackDurationMs: this.fallbackDurationMs,
      });
      this.forceFallback();
    }
  }

  private maybeResetFromFallback(): void {
    if (!this.fallbackMode) return;

    if (this.fallbackRetryAt && new Date() >= this.fallbackRetryAt) {
      log.info('Fallback duration expired, attempting to reset to Baileys');
      this.resetToPrimary().catch((err) => {
        log.warn('Auto-reset to Baileys failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }

  private scheduleFallbackRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    this.retryTimer = setTimeout(() => {
      log.info('Fallback timer expired, attempting to reset to Baileys');
      this.resetToPrimary().catch((err) => {
        log.warn('Scheduled reset to Baileys failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.fallbackDurationMs);
  }

  private async sendViaOfficialApi(to: string, message: string): Promise<RouterSendMessageResult> {
    log.info('Sending message via official WhatsApp API', { to });

    try {
      const client = getWhatsAppClient();
      const result: WhatsAppMessageResponse = await client.sendMessage(to, message);

      return {
        provider: 'official',
        messageId: result.messageId,
        recipientWaId: result.recipientWaId,
      };
    } catch (error) {
      log.error('Official WhatsApp API also failed', {
        to,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

let _router: WhatsAppRouter | null = null;

/**
 * Get the singleton WhatsAppRouter instance.
 */
export function getWhatsAppRouter(): WhatsAppRouter {
  if (!_router) {
    _router = new WhatsAppRouter();
  }
  return _router;
}

/**
 * WhatsAppRouter class export for direct usage.
 */
export { WhatsAppRouter };
