/**
 * Baileys WhatsApp Web Client
 *
 * Provides a WhatsApp Web connection via Baileys (@whiskeysockets/baileys).
 * Connects via WebSocket, authenticates with QR code, and supports
 * sending text messages, images, and documents.
 *
 * Session data is persisted to /data/baileys-sessions/
 */

import { createLogger } from '@/lib/logger';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
  type ConnectionState,
  type AuthenticationState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import type { ILogger } from '@whiskeysockets/baileys/lib/Utils/logger.js';
import { Boom } from '@hapi/boom';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';

const log = createLogger('whatsapp-baileys');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BaileysConnectionState = 'disconnected' | 'connecting' | 'connected' | 'awaiting_qr';

export interface BaileysMessageHandler {
  (message: unknown): void;
}

export interface BaileysSendMessageResult {
  messageId: string;
  timestamp: number;
}

export interface BaileysSendImageResult {
  messageId: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_DIR = join(process.cwd(), 'data', 'baileys-sessions');

/**
 * Format a phone number for Baileys JID.
 * Strips leading '+' and ensures @s.whatsapp.net suffix.
 * e.g. "+237612345678" → "237612345678@s.whatsapp.net"
 */
function formatJid(phone: string): string {
  let cleaned = phone.replace(/[\s\-().]/g, '');
  // Remove leading +
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  // Remove @s.whatsapp.net if already present
  if (cleaned.endsWith('@s.whatsapp.net')) {
    return cleaned;
  }
  // Remove @g.us suffix if present (group JID)
  if (cleaned.endsWith('@g.us')) {
    return cleaned;
  }
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Create a pino logger compatible with Baileys.
 * Baileys expects a pino instance; we wrap our createLogger to match the interface.
 */
function createBaileysLogger(): ILogger {
  const baileysLog = createLogger('baileys-internal');
  const logger: ILogger = {
    level: 'silent',
    child: () => createBaileysLogger(),
    trace: (obj: unknown, msg?: string) => { /* suppressed */ },
    debug: (obj: unknown, msg?: string) => baileysLog.debug(msg ?? String(obj)),
    info: (obj: unknown, msg?: string) => baileysLog.info(msg ?? String(obj)),
    warn: (obj: unknown, msg?: string) => baileysLog.warn(msg ?? String(obj)),
    error: (obj: unknown, msg?: string) => baileysLog.error(msg ?? String(obj)),
  };
  return logger;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

class BaileysWhatsAppService {
  private sock: WASocket | null = null;
  private authState: { state: AuthenticationState; saveCreds: () => Promise<void> } | null = null;
  private connectionState: BaileysConnectionState = 'disconnected';
  private qrCode: string | null = null;
  private messageHandlers: BaileysMessageHandler[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivity: Date | null = null;
  private isShuttingDown = false;

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Start connection and authenticate via QR code.
   */
  async connect(): Promise<void> {
    if (this.sock && this.connectionState === 'connected') {
      log.info('Already connected, skipping connect()');
      return;
    }

    this.isShuttingDown = false;
    this.connectionState = 'connecting';
    log.info('Starting Baileys WhatsApp connection...');

    try {
      // Ensure session directory exists
      await mkdir(SESSION_DIR, { recursive: true });

      // Load or create auth state
      // eslint-disable-next-line react-hooks/rules-of-hooks
      this.authState = await useMultiFileAuthState(SESSION_DIR);

      // Fetch latest Baileys version
      const { version } = await fetchLatestBaileysVersion();

      log.info('Creating WhatsApp socket', { version: version.join('.') });

      // Create the socket
      this.sock = makeWASocket({
        version,
        auth: {
          creds: this.authState.state.creds,
          keys: makeCacheableSignalKeyStore(this.authState.state.keys, createBaileysLogger()),
        },
        logger: createBaileysLogger(),
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 30_000,
        defaultQueryTimeoutMs: 30_000,
        browser: ['Genova Genova', 'Chrome', '121.0.0'],
      });

      // Wire up event handlers
      this.sock.ev.on('connection.update', this.handleConnectionUpdate.bind(this));
      this.sock.ev.on('creds.update', this.handleCredsUpdate.bind(this));
      this.sock.ev.on('messages.upsert', this.handleMessagesUpsert.bind(this));
    } catch (error) {
      log.error('Failed to connect Baileys', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.connectionState = 'disconnected';
      this.scheduleReconnect();
    }
  }

  /**
   * Gracefully disconnect from WhatsApp.
   */
  async disconnect(): Promise<void> {
    this.isShuttingDown = true;
    log.info('Disconnecting Baileys WhatsApp...');

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {
        // Ignore errors during disconnect
      }
      this.sock = null;
    }

    this.connectionState = 'disconnected';
    this.qrCode = null;
    this.reconnectAttempts = 0;
  }

  /**
   * Check if currently connected.
   */
  isConnected(): boolean {
    return this.connectionState === 'connected' && this.sock !== null;
  }

  /**
   * Send a text message.
   */
  async sendMessage(to: string, message: string): Promise<BaileysSendMessageResult> {
    if (!this.isConnected() || !this.sock) {
      throw new Error('Baileys WhatsApp is not connected');
    }

    const jid = formatJid(to);
    log.info('Sending text message via Baileys', { to: jid, messageLength: message.length });

    try {
      const sent = await this.sock.sendMessage(jid, { text: message });
      this.lastActivity = new Date();

      const messageId = sent?.key?.id ?? randomBytes(16).toString('hex');
      const timestamp = typeof sent?.messageTimestamp === 'number'
        ? sent.messageTimestamp
        : Date.now();

      log.info('Message sent via Baileys', { to: jid, messageId });
      return { messageId, timestamp };
    } catch (error) {
      log.error('Failed to send message via Baileys', {
        to: jid,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Send an image message.
   */
  async sendImage(to: string, imageBuffer: Buffer, caption?: string): Promise<BaileysSendImageResult> {
    if (!this.isConnected() || !this.sock) {
      throw new Error('Baileys WhatsApp is not connected');
    }

    const jid = formatJid(to);
    log.info('Sending image via Baileys', { to: jid, caption: caption ? 'provided' : 'none' });

    try {
      const sent = await this.sock.sendMessage(jid, {
        image: imageBuffer,
        caption: caption ?? undefined,
      });
      this.lastActivity = new Date();

      const messageId = sent?.key?.id ?? randomBytes(16).toString('hex');
      const timestamp = typeof sent?.messageTimestamp === 'number'
        ? sent.messageTimestamp
        : Date.now();

      log.info('Image sent via Baileys', { to: jid, messageId });
      return { messageId, timestamp };
    } catch (error) {
      log.error('Failed to send image via Baileys', {
        to: jid,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get current QR code string for frontend display.
   * Returns null if not in QR-awaiting state or already authenticated.
   */
  getQRCode(): string | null {
    return this.qrCode;
  }

  /**
   * Get current connection state.
   */
  getConnectionState(): BaileysConnectionState {
    return this.connectionState;
  }

  /**
   * Get the last activity timestamp.
   */
  getLastActivity(): Date | null {
    return this.lastActivity;
  }

  /**
   * Register a message handler for incoming messages.
   */
  onMessage(callback: BaileysMessageHandler): void {
    this.messageHandlers.push(callback);
  }

  /**
   * Remove a message handler.
   */
  offMessage(callback: BaileysMessageHandler): void {
    this.messageHandlers = this.messageHandlers.filter((h) => h !== callback);
  }

  /**
   * Health check: returns whether the service is operational.
   */
  healthCheck(): { healthy: boolean; state: BaileysConnectionState; qrRequired: boolean; lastActivity: string | null } {
    return {
      healthy: this.isConnected(),
      state: this.connectionState,
      qrRequired: this.connectionState === 'awaiting_qr',
      lastActivity: this.lastActivity?.toISOString() ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // Private handlers
  // ---------------------------------------------------------------------------

  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update;

    log.info('Connection update', {
      connection,
      qr: qr ? 'received' : 'none',
      lastDisconnect: lastDisconnect
        ? {
            error: lastDisconnect.error instanceof Error ? lastDisconnect.error.message : 'unknown',
            date: lastDisconnect.date.toISOString(),
          }
        : 'none',
    });

    if (qr) {
      // QR code received — waiting for scan
      this.qrCode = qr;
      this.connectionState = 'awaiting_qr';
      log.info('QR code received. Scan with WhatsApp to authenticate.');
      log.info(`QR code string length: ${qr.length}`);
    }

    if (connection === 'open') {
      // Successfully connected
      this.connectionState = 'connected';
      this.qrCode = null;
      this.reconnectAttempts = 0;
      this.lastActivity = new Date();
      log.info('WhatsApp connected successfully via Baileys');
    }

    if (connection === 'close') {
      // Connection closed
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect =
        statusCode !== DisconnectReason.loggedOut &&
        statusCode !== DisconnectReason.forbidden &&
        !this.isShuttingDown;

      this.connectionState = 'disconnected';
      this.sock = null;
      this.qrCode = null;

      log.warn('WhatsApp connection closed', {
        statusCode,
        shouldReconnect,
        reason: this.getDisconnectReason(statusCode),
      });

      if (shouldReconnect) {
        this.scheduleReconnect();
      } else if (statusCode === DisconnectReason.loggedOut) {
        log.error('WhatsApp logged out. Session invalidated. Re-scan QR code required.');
      }
    }
  }

  private async handleCredsUpdate(): Promise<void> {
    if (this.authState) {
      try {
        await this.authState.saveCreds();
      } catch (error) {
        log.error('Failed to save Baileys credentials', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private handleMessagesUpsert(upsert: { messages: unknown[]; type: string }): void {
    if (upsert.type === 'notify') {
      for (const msg of upsert.messages) {
        for (const handler of this.messageHandlers) {
          try {
            handler(msg);
          } catch (error) {
            log.error('Message handler error', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error('Max reconnect attempts reached. Giving up.', {
        attempts: this.reconnectAttempts,
      });
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(5000 * this.reconnectAttempts, 60_000); // Max 60s delay

    log.info('Scheduling Baileys reconnect', {
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private getDisconnectReason(statusCode?: number): string {
    const reasons: Record<number, string> = {
      [DisconnectReason.badSession]: 'Bad session',
      [DisconnectReason.connectionClosed]: 'Connection closed',
      [DisconnectReason.connectionReplaced]: 'Connection replaced (another session opened)',
      [DisconnectReason.loggedOut]: 'Logged out',
      [DisconnectReason.restartRequired]: 'Restart required',
      [DisconnectReason.timedOut]: 'Timed out',
      [DisconnectReason.forbidden]: 'Forbidden (banned)',
      [DisconnectReason.multideviceMismatch]: 'Multi-device mismatch',
      [DisconnectReason.unavailableService]: 'Service unavailable',
    };
    return statusCode ? reasons[statusCode] ?? `Unknown (${statusCode})` : 'Unknown';
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

let _instance: BaileysWhatsAppService | null = null;

/**
 * Get the singleton BaileysWhatsAppService instance.
 */
export function getBaileysService(): BaileysWhatsAppService {
  if (!_instance) {
    _instance = new BaileysWhatsAppService();
  }
  return _instance;
}

/**
 * BaileysWhatsAppService class export for direct usage.
 */
export { BaileysWhatsAppService };
