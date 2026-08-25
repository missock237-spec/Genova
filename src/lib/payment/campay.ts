import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
// ============================================================
// Campay Client — Paiement Mobile Money (Cameroun)
// ============================================================
//  Problème : Chariow redirige vers un site web externe.
//  Les utilisateurs veulent un push USSD direct sur leur
//  téléphone (prompt PIN Orange Money / MTN MoMo).
//
//  Campay est l'agrégateur le plus populaire au Cameroun.
//  API: https://campay.net/api/
//  Flux :
//    1. POST /token/ → obtenir un token d'accès
//    2. POST /collect/ → déclencher le paiement (push USSD)
//    3. Webhook → confirmation de paiement
//
//  Avantage : L'utilisateur reçoit directement le prompt
//  de paiement sur son téléphone, sans redirection web.
// ============================================================

import { createLogger } from '@/lib/logger';

const log = createLogger('campay');

const CAMPAY_API_URL = process.env.CAMPAY_API_URL || 'https://campay.net/api';
const CAMPAY_USERNAME = process.env.CAMPAY_USERNAME || '';
const CAMPAY_PASSWORD = process.env.CAMPAY_PASSWORD || '';
const CAMPAY_APP_ID = process.env.CAMPAY_APP_ID || '';
const CAMPAY_APP_TOKEN = process.env.CAMPAY_APP_TOKEN || '';
const CAMPAY_WEBHOOK_SECRET = process.env.CAMPAY_WEBHOOK_SECRET || '';

export type CampayOperator = 'MTN_MOMO' | 'ORANGE_MONEY' | 'ORANGE_CM' | 'MTN_CM';

export interface CampayPaymentRequest {
  amount: number;        // En XAF
  currency?: string;     // Défaut: XAF
  phone: string;         // Numéro de l'utilisateur (ex: 690123456)
  operator?: CampayOperator; // Si non spécifié, Campay détecte automatiquement
  description: string;
  reference: string;     // Référence unique
  email?: string;
  name?: string;
}

export interface CampayPaymentResult {
  success: boolean;
  reference: string;     // Référence Campay
  status: 'pending' | 'success' | 'failed';
  message?: string;
  transactionId?: string;
}

export interface CampayWebhookPayload {
  reference: string;
  status: 'success' | 'failed';
  amount: number;
  currency: string;
  phone: string;
  transaction_id: string;
  operator: string;
}

class CampayClient {
  private baseUrl: string;
  private cachedToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.baseUrl = CAMPAY_API_URL;
  }

  isConfigured(): boolean {
    return !!(CAMPAY_USERNAME && CAMPAY_PASSWORD);
  }

  /**
   * Obtient un token d'accès Campay (avec cache).
   * POST /token/
   */
  async getToken(): Promise<string | null> {
    if (this.cachedToken && Date.now() < this.tokenExpiry) {
      return this.cachedToken;
    }

    if (!this.isConfigured()) {
      log.warn('Campay not configured');
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_username: CAMPAY_USERNAME,
          app_password: CAMPAY_PASSWORD,
          app_id: CAMPAY_APP_ID,
          app_token: CAMPAY_APP_TOKEN,
        }),
      });

      if (!response.ok) {
        log.error('Campay token failed', { status: response.status });
        return null;
      }

      const data = await response.json() as { token: string; expires_in?: number };
      this.cachedToken = data.token;
      // Token valide ~1h, on cache 50min
      this.tokenExpiry = Date.now() + 50 * 60 * 1000;

      log.info('Campay token obtained');
      return this.cachedToken;
    } catch (err) {
      log.error('Campay token exception', { error: String(err) });
      return null;
    }
  }

  /**
   * Déclenche un paiement Mobile Money (push USSD).
   * POST /collect/
   * L'utilisateur reçoit un prompt sur son téléphone.
   */
  async collect(request: CampayPaymentRequest): Promise<CampayPaymentResult> {
    const token = await this.getToken();
    if (!token) {
      return {
        success: false,
        reference: request.reference,
        status: 'failed',
        message: 'Campay non configuré',
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/collect/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
        body: JSON.stringify({
          amount: request.amount,
          currency: request.currency || 'XAF',
          phone: request.phone,
          operator: request.operator,
          description: request.description,
          reference: request.reference,
          email: request.email,
          name: request.name,
        }),
      });

      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        log.error('Campay collect failed', { status: response.status, data });
        return {
          success: false,
          reference: request.reference,
          status: 'failed',
          message: (data.detail as string) || (data.message as string) || 'Erreur Campay',
        };
      }

      const reference = data.reference as string;
      const status = data.status as string;

      log.info('Campay collect initiated', { reference, status });

      return {
        success: true,
        reference,
        status: 'pending', // Le paiement est en attente de validation par l'utilisateur
        message: 'Paiement initié. Validez avec votre code PIN sur votre téléphone.',
        transactionId: reference,
      };
    } catch (err) {
      log.error('Campay collect exception', { error: String(err) });
      return {
        success: false,
        reference: request.reference,
        status: 'failed',
        message: 'Erreur lors de l\'initiation du paiement',
      };
    }
  }

  /**
   * Vérifie le statut d'une transaction.
   * GET /transaction/{reference}/
   */
  async getTransactionStatus(reference: string): Promise<{ status: string; amount?: number } | null> {
    const token = await this.getToken();
    if (!token) return null;

    try {
      const response = await fetch(`${this.baseUrl}/transaction/${reference}/`, {
        method: 'GET',
        headers: { 'Authorization': `Token ${token}` },
      });

      if (!response.ok) return null;

      const data = await response.json() as Record<string, unknown>;
      return {
        status: data.status as string,
        amount: data.amount as number | undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Vérifie la signature d'un webhook Campay (HMAC SHA-256, constant-time).
   * Le secret utilisé est CAMPAY_WEBHOOK_SECRET s'il est défini, sinon on
   * retombe sur CAMPAY_APP_TOKEN / CAMPAY_PASSWORD (compat historique).
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const secret = CAMPAY_WEBHOOK_SECRET || CAMPAY_APP_TOKEN || CAMPAY_PASSWORD;
    if (!secret || !signature || !payload) return false;

    try {
      const expected = createHmac('sha256', secret).update(payload).digest('hex');
      const sig = signature.startsWith('sha256=') ? signature.slice(7) : signature;
      const expectedBuf = Buffer.from(expected, 'utf-8');
      const signatureBuf = Buffer.from(sig, 'utf-8');
      if (expectedBuf.length !== signatureBuf.length) return false;
      return timingSafeEqual(expectedBuf, signatureBuf);
    } catch {
      return false;
    }
  }
}

export const campay = new CampayClient();
export default campay;
