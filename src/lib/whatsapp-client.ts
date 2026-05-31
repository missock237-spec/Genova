/**
 * WhatsApp Business API Client
 *
 * Real integration with the WhatsApp Cloud API (v21.0).
 * Supports sending text messages, initiating calls, and verifying the API token.
 *
 * Environment variables used:
 *   WHATSAPP_API_TOKEN       — Permanent or temporary access token
 *   WHATSAPP_PHONE_NUMBER_ID — The phone number ID from Meta Business settings
 *   WHATSAPP_BUSINESS_ACCOUNT_ID — (optional) Business account ID
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhatsAppMessageResponse {
  messageId: string;
  recipientWaId: string;
  raw?: Record<string, unknown>;
}

export interface WhatsAppCallResponse {
  callId: string;
  raw?: Record<string, unknown>;
}

export interface WhatsAppVerifyResponse {
  valid: boolean;
  appId?: string;
  appName?: string;
  error?: string;
}

export interface WhatsAppClientConfig {
  apiToken: string;
  phoneNumberId: string;
  businessAccountId?: string;
  apiVersion?: string;
  timeoutMs?: number;
  maxRetries?: number;
  baseRetryDelayMs?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WHATSAPP_API_BASE = 'https://graph.facebook.com';

/** Strip all HTML tags, collapse whitespace, trim. */
function sanitizeMessage(raw: string): string {
  let clean = raw.replace(/<[^>]*>/g, ''); // strip tags
  clean = clean.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

const MAX_MESSAGE_LENGTH = 4096; // WhatsApp text message limit

/**
 * Validate an international phone number.
 * Accepts leading + or digits, 7-15 digits total (E.164).
 */
function validatePhoneNumber(phone: string): { valid: boolean; normalized: string } {
  const stripped = phone.replace(/[\s\-().]/g, '');
  const regex = /^\+?[1-9]\d{6,14}$/;
  if (!regex.test(stripped)) {
    return { valid: false, normalized: stripped };
  }
  // Ensure leading + for WhatsApp API
  const normalized = stripped.startsWith('+') ? stripped : `+${stripped}`;
  return { valid: true, normalized };
}

/** Sleep for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Client class
// ---------------------------------------------------------------------------

export class WhatsAppClient {
  private readonly apiToken: string;
  private readonly phoneNumberId: string;
  private readonly businessAccountId: string;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;

  constructor(config: WhatsAppClientConfig) {
    if (!config.apiToken) {
      throw new Error('WHATSAPP_API_TOKEN is required');
    }
    if (!config.phoneNumberId) {
      throw new Error('WHATSAPP_PHONE_NUMBER_ID is required');
    }

    this.apiToken = config.apiToken;
    this.phoneNumberId = config.phoneNumberId;
    this.businessAccountId = config.businessAccountId || '';
    this.apiVersion = config.apiVersion || 'v21.0';
    this.timeoutMs = config.timeoutMs ?? 15_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.baseRetryDelayMs = config.baseRetryDelayMs ?? 500;
  }

  // -----------------------------------------------------------------------
  // Public methods
  // -----------------------------------------------------------------------

  /**
   * Send a text message via WhatsApp Cloud API.
   *
   * POST https://graph.facebook.com/v21.0/{phone_number_id}/messages
   */
  async sendMessage(to: string, message: string): Promise<WhatsAppMessageResponse> {
    // Validate recipient
    const { valid, normalized } = validatePhoneNumber(to);
    if (!valid) {
      throw new Error(`Invalid phone number: ${to}. Use international format (e.g., +33612345678)`);
    }

    // Sanitize and limit message content
    const sanitized = sanitizeMessage(message);
    if (!sanitized) {
      throw new Error('Message content is empty after sanitization');
    }
    if (sanitized.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters (got ${sanitized.length})`);
    }

    const url = `${WHATSAPP_API_BASE}/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalized.replace(/^\+/, ''), // WhatsApp API expects number without leading +
      type: 'text',
      text: {
        preview_url: false,
        body: sanitized,
      },
    };

    const result = await this.requestWithRetry<WhatsAppApiSendMessageResponse>(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const entry = result?.messages?.[0];
    if (!entry) {
      throw new Error('Unexpected WhatsApp API response: no message entry');
    }

    return {
      messageId: entry.id,
      recipientWaId: result.contacts?.[0]?.wa_id ?? normalized.replace(/^\+/, ''),
      raw: result as unknown as Record<string, unknown>,
    };
  }

  /**
   * Initiate a WhatsApp call.
   *
   * Note: The WhatsApp Business API does not have a public "call" endpoint
   * like it does for messages. Calls require the Business Calling API
   * which is in limited availability. We attempt to use the calling endpoint
   * and fall back gracefully if unavailable.
   */
  async initiateCall(to: string, message?: string): Promise<WhatsAppCallResponse> {
    // Validate recipient
    const { valid, normalized } = validatePhoneNumber(to);
    if (!valid) {
      throw new Error(`Invalid phone number: ${to}. Use international format (e.g., +33612345678)`);
    }

    // The WhatsApp Business Calling API uses a similar pattern to messages
    // but with type "call" — this is available only for verified businesses.
    // We attempt it and provide a meaningful error if not available.
    const url = `${WHATSAPP_API_BASE}/${this.apiVersion}/${this.phoneNumberId}/calls`;

    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: normalized.replace(/^\+/, ''),
    };

    if (message) {
      const sanitized = sanitizeMessage(message);
      if (sanitized.length > MAX_MESSAGE_LENGTH) {
        throw new Error(`Call message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`);
      }
      body.message = sanitized;
    }

    try {
      const result = await this.requestWithRetry<WhatsAppApiCallResponse>(url, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      return {
        callId: result?.id ?? 'unknown',
        raw: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      // If the calling API is not available (common case), provide a clear message
      if (error instanceof WhatsAppApiError && (error.status === 404 || error.status === 400)) {
        throw new WhatsAppApiError(
          'WhatsApp Business Calling API is not available for this account. ' +
          'Calls require the Business Calling API which has limited availability. ' +
          'Please check your Meta Business settings.',
          error.status,
          error.code,
        );
      }
      throw error;
    }
  }

  /**
   * Verify that the WhatsApp API token is valid by calling the /me endpoint.
   *
   * GET https://graph.facebook.com/v21.0/me?access_token=...
   */
  async verifyToken(): Promise<WhatsAppVerifyResponse> {
    const url = `${WHATSAPP_API_BASE}/${this.apiVersion}/me?access_token=${this.apiToken}`;

    try {
      const result = await this.fetchWithTimeout(url, {
        method: 'GET',
      });

      if (!result.ok) {
        const errorBody = await result.json().catch(() => ({}));
        return {
          valid: false,
          error: errorBody?.error?.message || `Token verification failed with status ${result.status}`,
        };
      }

      const data = await result.json();
      return {
        valid: true,
        appId: data.id,
        appName: data.name,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error during token verification',
      };
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Make an HTTP request with retry logic and exponential backoff.
   */
  private async requestWithRetry<T>(url: string, init: RequestInit): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, {
          ...init,
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
            ...(init.headers || {}),
          },
        });

        // Success
        if (response.ok) {
          return (await response.json()) as T;
        }

        // Parse error body
        const errorBody = await response.json().catch(() => ({})) as WhatsAppApiErrorBody;
        const apiError = errorBody?.error;

        // Don't retry client errors (4xx) except 429 (rate limit)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new WhatsAppApiError(
            apiError?.message || `WhatsApp API error: ${response.status}`,
            response.status,
            apiError?.code,
          );
        }

        // Retryable error (5xx or 429)
        lastError = new WhatsAppApiError(
          apiError?.message || `WhatsApp API error: ${response.status}`,
          response.status,
          apiError?.code,
        );
      } catch (error) {
        if (error instanceof WhatsAppApiError) {
          lastError = error;
          // Don't retry non-retryable client errors
          if (error.status >= 400 && error.status < 500 && error.status !== 429) {
            throw error;
          }
        } else {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }

      // Exponential backoff before retry
      if (attempt < this.maxRetries - 1) {
        const delay = this.baseRetryDelayMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Fetch with a configurable timeout.
   */
  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class WhatsAppApiError extends Error {
  public readonly status: number;
  public readonly code?: number;

  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = 'WhatsAppApiError';
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// API response types (WhatsApp Cloud API)
// ---------------------------------------------------------------------------

interface WhatsAppApiSendMessageResponse {
  messaging_product: string;
  contacts?: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

interface WhatsAppApiCallResponse {
  id: string;
  [key: string]: unknown;
}

interface WhatsAppApiErrorBody {
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _client: WhatsAppClient | null = null;

/**
 * Get or create the singleton WhatsApp client.
 *
 * Uses environment variables:
 *   - WHATSAPP_API_TOKEN
 *   - WHATSAPP_PHONE_NUMBER_ID
 *   - WHATSAPP_BUSINESS_ACCOUNT_ID (optional)
 *
 * Can optionally override the phone number ID (e.g. from per-user DB config).
 */
export function getWhatsAppClient(overridePhoneNumberId?: string): WhatsAppClient {
  const apiToken = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = overridePhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

  if (!apiToken) {
    throw new Error('WHATSAPP_API_TOKEN environment variable is not set');
  }
  if (!phoneNumberId) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID environment variable is not set (and no override provided)');
  }

  // Re-create client if config changed or first time
  if (!_client || _client['phoneNumberId'] !== phoneNumberId || _client['apiToken'] !== apiToken) {
    _client = new WhatsAppClient({
      apiToken,
      phoneNumberId,
      businessAccountId,
    });
  }

  return _client;
}

/**
 * Create a WhatsApp client with custom config (e.g. per-user settings).
 */
export function createWhatsAppClient(config: WhatsAppClientConfig): WhatsAppClient {
  return new WhatsAppClient(config);
}

// Re-export helpers for use in routes
export { sanitizeMessage, validatePhoneNumber, MAX_MESSAGE_LENGTH };
