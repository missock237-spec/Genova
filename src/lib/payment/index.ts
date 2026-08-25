// ============================================================
// PAIEMENTS — Orchestrateur à deux fournisseurs
// ============================================================
//  Règle métier : exactement 2 fournisseurs de paiement.
//   - CHARIOW  → abonnements (plans + packs de crédits)
//   - SEBPAY   → marketplace de prompts (Mobile Money + payout créateur)
//
//  Ce module est la source de vérité. Il n'importe AUCUN autre provider.
// ============================================================

import { chariow } from '@/lib/payment/chariow';
import { sebpayMarketplace } from '@/lib/payment/sebpay';

export type PaymentProvider = 'chariow' | 'sebpay';

/**
 * Indique le fournisseur dédié à chaque flux métier.
 */
export const PAYMENT_PROVIDERS = {
  subscription: 'chariow' as const, // abonnements
  marketplace: 'sebpay' as const,   // marketplace de prompts
} as const;

/**
 * Vérifie la disponibilité réelle des deux fournisseurs (configurés).
 */
export function getAvailableProviders(): PaymentProvider[] {
  const providers: PaymentProvider[] = [];
  if (chariow.isConfigured()) providers.push('chariow');
  if (sebpayMarketplace.isConfigured()) providers.push('sebpay');
  return providers;
}

/**
 * Résout le fournisseur associé à un flux métier (`subscription` | `marketplace`).
 * Vérifie qu'il est configuré ; renvoie null sinon.
 */
export function resolveProvider(flow: 'subscription' | 'marketplace'): PaymentProvider | null {
  const provider = PAYMENT_PROVIDERS[flow];
  if (provider === 'chariow' && chariow.isConfigured()) return 'chariow';
  if (provider === 'sebpay' && sebpayMarketplace.isConfigured()) return 'sebpay';
  return null;
}

// ============================================================
//  Ré-exports dédiés : chaque flux consomme son provider.
//  (évite les imports croisés et rend le couplage explicite)
// ============================================================

export { chariow } from '@/lib/payment/chariow';
export { sebpayMarketplace } from '@/lib/payment/sebpay';
export {
  MARKETPLACE_COMMISSION_RATE,
  MARKETPLACE_SELLER_RATE,
} from '@/lib/payment/sebpay';
export type {
  SebpayCurrency,
  SebpayProvider,
  SebpayTransactionStatus,
  SebpayInitiatePaymentParams,
  SebpayWebhookPayload,
} from '@/lib/payment/sebpay';
export type {
  ChariowCurrency,
  ChariowSaleStatus,
  ChariowCheckoutParams,
  ChariowCheckoutResult,
  ChariowWebhookPayload,
} from '@/lib/payment/chariow';
