// ============================================================
// CAMPAY — FOURNISSEUR RETIRÉ
// ============================================================
//  Règle métier : les paiements ne sont gérés que par 2 fournisseurs.
//   - CHARIOW  → abonnements (plans + packs de crédits)
//   - SEBPAY   → marketplace de prompts
//
//  Campay a été retiré du périmètre. Ce module est conservé comme garde-fou
//  afin de ne casser aucun import résiduel : toutes ses méthodes sont
//  désactivées et renvoient une erreur explicite (jamais de transaction).
// ============================================================

import { createLogger } from '@/lib/logger';

const log = createLogger('campay');

export type CampayOperator = 'MTN_MOMO' | 'ORANGE_MONEY' | 'ORANGE_CM' | 'MTN_CM';

export interface CampayPaymentRequest {
  amount: number;
  currency?: string;
  phone: string;
  operator?: CampayOperator;
  description: string;
  reference: string;
  email?: string;
  name?: string;
}

export interface CampayPaymentResult {
  success: boolean;
  reference: string;
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

const RETIRED_MESSAGE =
  'Campay a été retiré. Les paiements sont gérés uniquement par Chariow (abonnements) et SebPay (marketplace).';

class CampayClient {
  isConfigured(): boolean {
    // Toujours faux : le fournisseur est hors périmètre.
    return false;
  }

  async getToken(): Promise<null> {
    log.warn('campay_retired_getToken');
    return null;
  }

  async collect(request: CampayPaymentRequest): Promise<CampayPaymentResult> {
    log.warn('campay_retired_collect', { reference: request.reference });
    return {
      success: false,
      reference: request.reference,
      status: 'failed',
      message: RETIRED_MESSAGE,
    };
  }

  async getTransactionStatus(): Promise<null> {
    log.warn('campay_retired_getTransactionStatus');
    return null;
  }

  verifyWebhookSignature(): boolean {
    return false;
  }
}

export const campay = new CampayClient();
export default campay;
