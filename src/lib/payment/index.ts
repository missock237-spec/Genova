// ============================================================
// PAIEMENT UNIFIÉ — Orchestrateur unique des fournisseurs
// ============================================================
//  Centralise le choix du fournisseur en fonction de la configuration :
//   - Chariow  → redirection web (Orange Money, MTN MoMo, Wave, Carte)
//   - Campay   → push USSD direct Mobile Money (Cameroun)
//   - Stripe   → carte bancaire internationale (optionnel)
//
//  Les adaptateurs historiques (sebpay, subpay) sont conservés ailleurs
//  pour la rétro-compatibilité des imports, mais ce module est la source
//  de vérité pour les nouvelles intégrations.
// ============================================================

import { chariow } from '@/lib/payment/chariow';
import { campay } from '@/lib/payment/campay';

export type PaymentProvider = 'chariow' | 'campay' | 'stripe';

export interface PaymentInitInput {
  provider?: PaymentProvider;
  amount: number;
  currency?: string;
  phone?: string;
  productId?: string;
  planId?: string;
  description?: string;
  reference?: string;
  metadata?: Record<string, string>;
  customerEmail?: string;
  customerName?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface PaymentInitResult {
  provider: PaymentProvider;
  success: boolean;
  transactionId?: string;
  reference: string;
  status: 'pending' | 'completed' | 'failed';
  redirectUrl?: string;
  message?: string;
}

/**
 * Retourne les fournisseurs réellement disponibles (configurés).
 */
export function getAvailableProviders(): PaymentProvider[] {
  const providers: PaymentProvider[] = [];
  if (chariow.isConfigured()) providers.push('chariow');
  if (campay.isConfigured()) providers.push('campay');
  // Stripe à ajouter lorsque src/lib/billing/stripe-client.ts sera actif.
  return providers;
}

/**
 * Résout le fournisseur à utiliser : celui demandé s'il est configuré,
 * sinon le premier disponible (Chariow prioritaire).
 */
export function resolveProvider(preferred?: PaymentProvider): PaymentProvider | null {
  if (preferred) {
    if (preferred === 'chariow' && chariow.isConfigured()) return 'chariow';
    if (preferred === 'campay' && campay.isConfigured()) return 'campay';
    return null;
  }
  return getAvailableProviders()[0] ?? null;
}

/**
 * Initie un paiement via le fournisseur approprié.
 * Campay est requis pour le push USSD (phone obligatoire) ; sinon Chariow.
 */
export async function initiatePayment(input: PaymentInitInput): Promise<PaymentInitResult> {
  const provider = resolveProvider(input.provider);
  if (!provider) {
    return {
      provider: input.provider ?? 'chariow',
      success: false,
      reference: input.reference || '',
      status: 'failed',
      message: 'Aucun fournisseur de paiement configuré (CHARIOW_API_KEY ou CAMPAY_*)',
    };
  }

  const reference =
    input.reference ||
    `gen3ia_${(input.planId || input.description || 'pay').slice(0, 12)}_${Date.now()}`;

  if (provider === 'campay') {
    if (!input.phone) {
      return {
        provider,
        success: false,
        reference,
        status: 'failed',
        message: 'Campay (push USSD) requiert un numéro de téléphone',
      };
    }
    const result = await campay.collect({
      amount: input.amount,
      currency: input.currency || 'XAF',
      phone: input.phone,
      description: input.description || 'Paiement Gen3ia',
      reference,
      email: input.customerEmail,
      name: input.customerName,
    });
    return {
      provider,
      success: result.success,
      transactionId: result.transactionId,
      reference: result.reference || reference,
      status: result.success ? 'pending' : 'failed',
      message: result.message,
    };
  }

  // Chariow (redirection web)
  const productId = input.productId;
  if (!productId) {
    return {
      provider,
      success: false,
      reference,
      status: 'failed',
      message: 'Un productId Chariow est requis pour ce paiement',
    };
  }

  const checkout = await chariow.initiateCheckout({
    productId,
    customerEmail: input.customerEmail,
    customerName: input.customerName,
    metadata: {
      ...(input.metadata || {}),
      reference,
      amount: String(input.amount),
      currency: input.currency || 'XAF',
      ...(input.planId ? { type: 'plan', planId: input.planId } : {}),
    },
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
  });

  return {
    provider,
    success: true,
    transactionId: checkout.saleId || reference,
    reference,
    status: checkout.step === 'payment' ? 'pending' : 'completed',
    redirectUrl: checkout.checkoutUrl,
  };
}

/**
 * Vérifie le statut d'un paiement en fonction du fournisseur.
 */
export async function checkPaymentStatus(
  provider: PaymentProvider,
  transactionId: string
): Promise<string> {
  if (provider === 'campay') {
    const res = await campay.getTransactionStatus(transactionId);
    return res?.status ?? 'unknown';
  }
  const { status } = await chariow.getSaleStatus(transactionId);
  return status;
}

/**
 * Vérifie la signature d'un webhook en fonction du fournisseur.
 */
export function verifyWebhookSignature(
  provider: PaymentProvider,
  body: string,
  signature: string
): boolean {
  if (provider === 'campay') return campay.verifyWebhookSignature(body, signature);
  return chariow.verifyWebhookSignature(body, signature);
}
